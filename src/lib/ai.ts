import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Minutes } from "@/db/schema";

export const AI_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

export function aiConfigured(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

const MinutesSchema = z.object({
  title: z.string().describe("회의 내용을 대표하는 간결한 회의록 제목"),
  summary: z.string().describe("회의 핵심 요약 (3~5문장)"),
  agenda: z.array(z.string()).describe("다룬 안건 목록"),
  discussions: z
    .array(
      z.object({
        topic: z.string().describe("논의 주제"),
        points: z.array(z.string()).describe("주제별 주요 논의 내용 (개조식)"),
      }),
    )
    .describe("주제별 논의 내용"),
  decisions: z.array(z.string()).describe("확정된 결정 사항"),
  actionItems: z
    .array(
      z.object({
        task: z.string().describe("구체적인 할 일"),
        owner: z.string().describe("담당자 이름. 원문에서 알 수 없으면 빈 문자열"),
        dueDate: z.string().describe("기한 YYYY-MM-DD. 원문에서 특정할 수 없으면 빈 문자열"),
      }),
    )
    .describe("후속 조치(액션 아이템)"),
  openIssues: z.array(z.string()).describe("결론이 나지 않았거나 추가 확인이 필요한 사항"),
  nextMeeting: z.string().describe("다음 회의 일정/안건. 언급이 없으면 빈 문자열"),
});

const SYSTEM_PROMPT = `당신은 브랜드 체험마케팅(팝업스토어, 샘플링, 체험단, 오프라인 행사, 인플루언서 협업 등) 에이전시 팀의 회의록 작성 담당자입니다.
팀원이 붙여넣은 정리되지 않은 회의 메모(단편적인 메모, 메신저 대화, 음성 받아쓰기, 약어 등)를 공유용 회의록으로 정리합니다.

작성 원칙:
- 원문에 있는 사실만 사용합니다. 추측으로 내용을 보태지 않습니다.
- 숫자, 금액, 수량, 날짜, 장소, 브랜드·업체명, 사람 이름은 원문 그대로 정확히 옮깁니다.
- 한국어 비즈니스 개조식 문체로 간결하게 씁니다 (예: "~함", "~예정", "~필요").
- 중복되거나 잡담에 가까운 내용은 정리하고, 의사결정에 필요한 맥락은 남깁니다.
- 결정 사항과 아직 결론이 나지 않은 사항을 구분합니다.
- 액션 아이템은 누가 무엇을 언제까지 하는지 드러나게 씁니다. 담당자는 가능하면 팀원 목록의 이름과 맞추고, 알 수 없으면 비워 둡니다.
- "다음 주 금요일"처럼 상대적인 기한은 회의 날짜를 기준으로 YYYY-MM-DD로 바꾸되, 확실하지 않으면 dueDate를 비우고 할 일 문장에 원래 표현을 남깁니다.
- 해당 항목에 내용이 없으면 빈 배열 또는 빈 문자열로 둡니다.`;

export type MinutesInput = {
  title: string;
  meetingDate: string;
  projectName?: string | null;
  attendees: string[];
  teamMembers: string[];
  rawNotes: string;
};

export class AiError extends Error {}

export async function generateMinutes(input: MinutesInput): Promise<Minutes> {
  if (!aiConfigured()) {
    throw new AiError("ANTHROPIC_API_KEY가 설정되지 않아 AI 요약을 사용할 수 없습니다.");
  }
  const client = new Anthropic();

  const context = [
    `회의 날짜: ${input.meetingDate}`,
    input.title ? `회의 제목(임시): ${input.title}` : null,
    input.projectName ? `프로젝트: ${input.projectName}` : null,
    input.attendees.length ? `참석자: ${input.attendees.join(", ")}` : null,
    input.teamMembers.length ? `팀원 목록: ${input.teamMembers.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const stream = client.beta.messages.stream({
      model: AI_MODEL,
      max_tokens: 32000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(MinutesSchema),
      },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `${context}\n\n아래 회의 원문을 회의록으로 정리해 주세요.\n\n<notes>\n${input.rawNotes}\n</notes>`,
        },
      ],
    });
    const message = await stream.finalMessage();

    if (message.stop_reason === "refusal") {
      throw new AiError("AI가 이 내용의 요약을 거절했습니다. 원문을 확인한 뒤 다시 시도하세요.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("회의 원문이 너무 길어 요약이 중간에 끊겼습니다. 원문을 나누어 정리해 주세요.");
    }
    const parsed = message.parsed_output;
    if (!parsed) throw new AiError("AI 응답을 해석하지 못했습니다. 다시 시도해 주세요.");

    return {
      ...parsed,
      actionItems: parsed.actionItems.map((a) => ({
        ...a,
        dueDate: /^\d{4}-\d{2}-\d{2}$/.test(a.dueDate) ? a.dueDate : "",
        eventId: null,
      })),
    };
  } catch (err) {
    if (err instanceof AiError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      throw new AiError("Anthropic API 키가 올바르지 않습니다. 환경변수를 확인하세요.");
    }
    if (err instanceof Anthropic.RateLimitError) {
      throw new AiError("AI 요청 한도를 초과했습니다. 잠시 후 다시 시도하세요.");
    }
    if (err instanceof Anthropic.BadRequestError) {
      throw new AiError(`AI 요청이 거부되었습니다: ${err.message}`);
    }
    if (err instanceof Anthropic.APIError) {
      throw new AiError(`AI 서버 오류(${err.status ?? "연결 실패"})가 발생했습니다. 잠시 후 다시 시도하세요.`);
    }
    throw err;
  }
}
