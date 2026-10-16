"use client";

import { useActionState, useRef, useState } from "react";
import { FileUp, Sparkles } from "lucide-react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { createMeeting } from "../actions";

const EXAMPLE = `- 성수 팝업 오픈 D-14 / 시공 일정 다음주 화요일 시작 예정 (OO디자인 김실장)
- 입장 동선: 대기열 길어질 것 대비 사전예약 50% + 현장 50%로 가기로
- 샘플 키트 3천개 → 부족할 듯, 클라이언트에 2천개 추가 요청 필요 (박서연)
- 인플루언서 초청 데이 오픈 전날 저녁 6시~8시, 30명 리스트 금요일까지 확정 — 이준호
- 굿즈 디자인 시안 Figma 업로드됨, 컬러 수정 요청 2건
- 예산 이슈: 운영 인력 추가 시 300만원 초과 → 다음 회의 때 재논의`;

export function NewMeetingForm({
  projects,
  members,
  defaultProjectId,
  today,
  aiReady,
}: {
  projects: { id: string; name: string }[];
  members: { id: string; name: string; color: string }[];
  defaultProjectId: string;
  today: string;
  aiReady: boolean;
}) {
  const [state, action] = useActionState(createMeeting, undefined);
  const [notes, setNotes] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function importFile(file: File | undefined) {
    if (!file) return;
    setImporting(true);
    setImportError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/extract-text", { method: "POST", body: form });
      const json = (await res.json()) as { text?: string; error?: string };
      if (!res.ok || json.text === undefined) throw new Error(json.error ?? "불러오기 실패");
      setNotes((prev) => (prev ? `${prev}\n\n${json.text}` : json.text!));
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "불러오기 실패");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="text-sm font-semibold text-gray-900" htmlFor="rawNotes">
            회의 내용 (정리 안 된 메모 그대로)
          </label>
          <div className="flex gap-2">
            {!notes && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setNotes(EXAMPLE)}>
                예시 넣기
              </button>
            )}
            <button type="button" className="btn-secondary btn-sm" onClick={() => fileRef.current?.click()} disabled={importing}>
              <FileUp className="h-3.5 w-3.5" />
              {importing ? "불러오는 중…" : "Word/텍스트 파일 불러오기"}
            </button>
            <input ref={fileRef} type="file" accept=".docx,.txt,.md,.vtt,.srt" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
          </div>
        </div>
        <textarea
          id="rawNotes"
          name="rawNotes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={22}
          required
          className="input text-sm leading-relaxed"
          placeholder={"회의 중 적은 메모, 카톡/슬랙 대화, 음성 받아쓰기 텍스트 등을 그대로 붙여넣으세요.\nAI가 요약 · 안건 · 논의 내용 · 결정 사항 · 액션 아이템(담당자/기한)으로 정리합니다."}
        />
        <div className="flex justify-between text-xs text-gray-500">
          <span>{importError && <span className="text-red-600">{importError}</span>}</span>
          <span>{notes.length.toLocaleString()}자</span>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4 p-5">
          <div>
            <label className="label" htmlFor="title">
              회의 제목 (비워두면 AI가 작성)
            </label>
            <input id="title" name="title" className="input" placeholder="예) 성수 팝업 주간 회의" />
          </div>
          <div>
            <label className="label" htmlFor="meetingDate">
              회의 날짜
            </label>
            <input id="meetingDate" name="meetingDate" type="date" className="input" defaultValue={today} required />
          </div>
          <div>
            <label className="label" htmlFor="projectId">
              프로젝트
            </label>
            <select id="projectId" name="projectId" className="input" defaultValue={defaultProjectId}>
              <option value="">공통</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="label">참석자</span>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <label key={m.id} className="cursor-pointer">
                  <input type="checkbox" name="attendees" value={m.name} className="peer sr-only" />
                  <span className="badge border border-gray-200 bg-white px-2.5 py-1 text-gray-600 peer-checked:border-transparent peer-checked:bg-gray-900 peer-checked:text-white">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                    {m.name}
                  </span>
                </label>
              ))}
            </div>
            <input name="externalAttendees" className="input mt-2" placeholder="외부 참석자 (쉼표로 구분)" />
          </div>
        </div>
        {!aiReady && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            ANTHROPIC_API_KEY가 설정되지 않아 원문만 저장됩니다. 키를 설정하면 AI 정리를 실행할 수 있습니다.
          </p>
        )}
        <FormError state={state} />
        <SubmitButton className="btn-primary w-full py-2.5" pendingText="저장 중…">
          <Sparkles className="h-4 w-4" />
          {aiReady ? "저장하고 AI로 회의록 정리" : "원문 저장"}
        </SubmitButton>
      </div>
    </form>
  );
}
