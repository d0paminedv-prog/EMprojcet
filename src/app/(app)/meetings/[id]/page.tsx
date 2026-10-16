import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CalendarCheck, CalendarPlus, FileDown, FolderInput, Pencil, Users } from "lucide-react";
import { db } from "@/db";
import { meetings, members, projects } from "@/db/schema";
import { ConfirmButton, SubmitButton } from "@/components/form-controls";
import { MEETING_STATUS } from "@/components/lists";
import { Badge, Dot, Notice } from "@/components/ui";
import { aiConfigured } from "@/lib/ai";
import { dDay, formatDate } from "@/lib/dates";
import { minutesToMarkdown } from "@/lib/minutes-docx";
import { isUuid } from "@/lib/utils";
import { addActionItemsToSchedule, deleteMeeting, saveMinutesToDocuments } from "../actions";
import { CopyButton, SummarizeButton } from "./meeting-client";

async function getMeeting(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ meeting: meetings, projectName: projects.name, projectColor: projects.color, authorName: members.name })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(members, eq(members.id, meetings.createdBy))
    .where(eq(meetings.id, id))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getMeeting(id))?.meeting.title ?? "회의록" };
}

function Section({ no, title, children }: { no: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-gray-100 pt-5">
      <h3 className="mb-2.5 flex items-center gap-2 text-sm font-semibold text-gray-900">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-50 text-[11px] font-bold text-brand-700">{no}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (!items.length) return <p className="text-sm text-gray-400">해당 없음</p>;
  return (
    <ul className="prose-minutes list-disc space-y-1 pl-5 text-sm text-gray-800">
      {items.map((t, i) => (
        <li key={i}>{t}</li>
      ))}
    </ul>
  );
}

export default async function MeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generate?: string }>;
}) {
  const { id } = await params;
  const { generate } = await searchParams;
  const row = await getMeeting(id);
  if (!row) notFound();
  const { meeting } = row;
  const m = meeting.minutes;
  const status = MEETING_STATUS[meeting.status] ?? MEETING_STATUS.draft;
  const aiReady = aiConfigured();
  const autoStart = generate === "1" && aiReady && !m && meeting.status !== "summarizing";
  const pendingActions = m?.actionItems.filter((a) => !a.eventId).length ?? 0;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-2 text-sm text-gray-500">
        <Link href="/meetings" className="hover:text-gray-900">
          회의록
        </Link>
        {row.projectName && meeting.projectId && (
          <>
            {" / "}
            <Link href={`/projects/${meeting.projectId}`} className="inline-flex items-center gap-1 hover:text-gray-900">
              <Dot color={row.projectColor ?? "#6b7280"} />
              {row.projectName}
            </Link>
          </>
        )}
      </div>

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">{m?.title ?? meeting.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-gray-500">
            <Badge color={status.color}>{status.label}</Badge>
            <span>{formatDate(meeting.meetingDate)}</span>
            {meeting.attendees.length > 0 && (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                {meeting.attendees.join(", ")}
              </span>
            )}
            {row.authorName && <span>· 작성 {row.authorName}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href={`/meetings/${meeting.id}/edit`} className="btn-secondary">
            <Pencil className="h-4 w-4" />
            편집
          </Link>
          {m && (
            <a href={`/api/meetings/${meeting.id}/docx`} className="btn-primary">
              <FileDown className="h-4 w-4" />
              Word 다운로드
            </a>
          )}
        </div>
      </div>

      {meeting.status === "error" && meeting.errorMessage && (
        <div className="mb-4">
          <Notice tone="error">{meeting.errorMessage}</Notice>
        </div>
      )}

      {!m && (
        <div className="card mb-6 flex flex-col items-start gap-3 p-5">
          <p className="text-sm text-gray-700">
            {meeting.status === "summarizing"
              ? "AI 정리가 진행 중입니다. 잠시 후 새로고침해 주세요."
              : "아직 회의록으로 정리되지 않았습니다. AI가 원문을 읽고 요약·결정 사항·액션 아이템으로 정리합니다."}
          </p>
          {aiReady ? (
            <SummarizeButton meetingId={meeting.id} autoStart={autoStart} />
          ) : (
            <Notice tone="warn">ANTHROPIC_API_KEY 환경변수를 설정하면 AI 정리를 사용할 수 있습니다. 직접 작성하려면 「편집」을 누르세요.</Notice>
          )}
        </div>
      )}

      {m && (
        <article className="card space-y-5 p-5 sm:p-7">
          <div className="rounded-xl bg-gradient-to-br from-brand-50 to-violet-50 p-4">
            <p className="mb-1 text-xs font-semibold text-brand-700">핵심 요약</p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{m.summary || "-"}</p>
          </div>

          <Section no={1} title="안건">
            <Bullets items={m.agenda} />
          </Section>

          <Section no={2} title="주요 논의 내용">
            {m.discussions.length ? (
              <div className="space-y-4">
                {m.discussions.map((d, i) => (
                  <div key={i}>
                    <p className="mb-1 text-sm font-semibold text-gray-800">{d.topic}</p>
                    <Bullets items={d.points} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">해당 없음</p>
            )}
          </Section>

          <Section no={3} title="결정 사항">
            <Bullets items={m.decisions} />
          </Section>

          <Section no={4} title={`액션 아이템 (${m.actionItems.length})`}>
            {m.actionItems.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                        <th className="py-2 pr-2 font-medium">할 일</th>
                        <th className="w-24 py-2 pr-2 font-medium">담당자</th>
                        <th className="w-32 py-2 pr-2 font-medium">기한</th>
                        <th className="w-28 py-2 text-right font-medium">일정</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {m.actionItems.map((a, i) => (
                        <tr key={i}>
                          <td className="py-2 pr-2 text-gray-900">{a.task}</td>
                          <td className="py-2 pr-2 text-gray-700">{a.owner || <span className="text-gray-400">미정</span>}</td>
                          <td className="py-2 pr-2 text-gray-700">
                            {a.dueDate ? (
                              <>
                                {a.dueDate.slice(5).replace("-", "/")} <span className="text-xs text-gray-400">{dDay(a.dueDate)}</span>
                              </>
                            ) : (
                              <span className="text-gray-400">미정</span>
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {a.eventId ? (
                              <Link href={`/schedule?event=${a.eventId}&month=${(a.dueDate || meeting.meetingDate).slice(0, 7)}`} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
                                <CalendarCheck className="h-3.5 w-3.5" />
                                등록됨
                              </Link>
                            ) : (
                              <form action={addActionItemsToSchedule.bind(null, meeting.id, i)}>
                                <SubmitButton className="btn-ghost btn-sm" pendingText="등록 중…">
                                  <CalendarPlus className="h-3.5 w-3.5" />
                                  일정 등록
                                </SubmitButton>
                              </form>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {pendingActions > 1 && (
                  <form action={addActionItemsToSchedule.bind(null, meeting.id, undefined)} className="mt-3">
                    <SubmitButton className="btn-secondary btn-sm" pendingText="등록 중…">
                      <CalendarPlus className="h-3.5 w-3.5" />
                      미등록 {pendingActions}건 모두 일정에 등록
                    </SubmitButton>
                  </form>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">해당 없음</p>
            )}
          </Section>

          <Section no={5} title="미결·확인 필요 사항">
            <Bullets items={m.openIssues} />
          </Section>

          <Section no={6} title="다음 회의">
            <p className="text-sm text-gray-800">{m.nextMeeting || "미정"}</p>
          </Section>
        </article>
      )}

      {m && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <form action={saveMinutesToDocuments.bind(null, meeting.id)}>
            <SubmitButton className="btn-secondary" pendingText="저장 중…">
              <FolderInput className="h-4 w-4" />
              Word로 문서함에 저장
            </SubmitButton>
          </form>
          <CopyButton
            text={minutesToMarkdown(m, { meetingDate: meeting.meetingDate, projectName: row.projectName, attendees: meeting.attendees })}
          />
          {aiReady && <SummarizeButton
              meetingId={meeting.id}
              label="원문으로 다시 정리"
              className="btn-ghost"
              confirmMessage="현재 회의록(직접 수정한 내용 포함)을 AI가 원문 기준으로 새로 정리합니다. 계속할까요?"
            />}
        </div>
      )}

      <details className="card mt-6 p-4">
        <summary className="cursor-pointer text-sm font-medium text-gray-700">회의 원문 보기 ({meeting.rawNotes.length.toLocaleString()}자)</summary>
        <pre className="mt-3 max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm leading-relaxed text-gray-700">{meeting.rawNotes}</pre>
      </details>

      <form action={deleteMeeting.bind(null, meeting.id)} className="mt-6 flex justify-end">
        <ConfirmButton message="회의록을 삭제할까요? (등록된 일정은 유지됩니다)">회의록 삭제</ConfirmButton>
      </form>
    </div>
  );
}
