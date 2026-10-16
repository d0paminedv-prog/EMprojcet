"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import type { Minutes, MinutesActionItem } from "@/db/schema";
import { saveMeeting } from "../../actions";

const toText = (items: string[]) => items.join("\n");
const fromText = (text: string) =>
  text
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "").trim())
    .filter(Boolean);

const EMPTY: Minutes = {
  title: "",
  summary: "",
  agenda: [],
  discussions: [],
  decisions: [],
  actionItems: [],
  openIssues: [],
  nextMeeting: "",
};

type Props = {
  meetingId: string;
  initial: {
    title: string;
    meetingDate: string;
    projectId: string;
    attendees: string[];
    rawNotes: string;
    minutes: Minutes | null;
  };
  projects: { id: string; name: string }[];
  members: { id: string; name: string }[];
};

function ListField({ label, value, onChange, rows = 4, hint }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; hint?: string }) {
  const [text, setText] = useState(toText(value));
  return (
    <div>
      <label className="label">{label}</label>
      <textarea
        className="input"
        rows={rows}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(fromText(e.target.value));
        }}
        placeholder="한 줄에 한 항목씩"
      />
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

export function MinutesEditor({ meetingId, initial, projects, members }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [meetingDate, setMeetingDate] = useState(initial.meetingDate);
  const [projectId, setProjectId] = useState(initial.projectId);
  const [attendees, setAttendees] = useState(initial.attendees.join(", "));
  const [rawNotes, setRawNotes] = useState(initial.rawNotes);
  const [withMinutes, setWithMinutes] = useState(!!initial.minutes);
  const [minutes, setMinutes] = useState<Minutes>(initial.minutes ?? { ...EMPTY, title: initial.title });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof Minutes>(key: K, value: Minutes[K]) => setMinutes((m) => ({ ...m, [key]: value }));
  const setAction = (i: number, patch: Partial<MinutesActionItem>) =>
    set("actionItems", minutes.actionItems.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));

  async function save() {
    setSaving(true);
    setError(null);
    const result = await saveMeeting(meetingId, {
      title: withMinutes ? minutes.title || title : title,
      meetingDate,
      projectId,
      attendees: attendees.split(",").map((a) => a.trim()).filter(Boolean),
      rawNotes,
      minutes: withMinutes ? { ...minutes, title: minutes.title || title } : null,
    });
    setSaving(false);
    if (result.error) return setError(result.error);
    router.push(`/meetings/${meetingId}`);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="card-title">회의 정보</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label">회의 제목</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label">회의 날짜</label>
            <input type="date" className="input" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} />
          </div>
          <div>
            <label className="label">프로젝트</label>
            <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">공통</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="label">참석자 (쉼표로 구분)</label>
            <input className="input" value={attendees} onChange={(e) => setAttendees(e.target.value)} />
          </div>
        </div>
      </section>

      {withMinutes ? (
        <section className="card space-y-4 p-5">
          <h2 className="card-title">회의록 내용</h2>
          <div>
            <label className="label">회의록 제목</label>
            <input className="input" value={minutes.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div>
            <label className="label">핵심 요약</label>
            <textarea className="input" rows={4} value={minutes.summary} onChange={(e) => set("summary", e.target.value)} />
          </div>
          <ListField label="안건" value={minutes.agenda} onChange={(v) => set("agenda", v)} />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">주요 논의 내용</span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => set("discussions", [...minutes.discussions, { topic: "", points: [] }])}>
                <Plus className="h-3.5 w-3.5" />
                주제 추가
              </button>
            </div>
            <div className="space-y-3">
              {minutes.discussions.map((d, i) => (
                <div key={i} className="rounded-lg border border-gray-200 p-3">
                  <div className="mb-2 flex gap-2">
                    <input
                      className="input"
                      placeholder="논의 주제"
                      value={d.topic}
                      onChange={(e) => set("discussions", minutes.discussions.map((x, idx) => (idx === i ? { ...x, topic: e.target.value } : x)))}
                    />
                    <button type="button" className="btn-ghost btn-sm" aria-label="주제 삭제" onClick={() => set("discussions", minutes.discussions.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <ListField
                    label="논의 내용"
                    value={d.points}
                    rows={3}
                    onChange={(v) => set("discussions", minutes.discussions.map((x, idx) => (idx === i ? { ...x, points: v } : x)))}
                  />
                </div>
              ))}
            </div>
          </div>

          <ListField label="결정 사항" value={minutes.decisions} onChange={(v) => set("decisions", v)} />

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label mb-0">액션 아이템</span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => set("actionItems", [...minutes.actionItems, { task: "", owner: "", dueDate: "", eventId: null }])}>
                <Plus className="h-3.5 w-3.5" />
                항목 추가
              </button>
            </div>
            <datalist id="member-names">
              {members.map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
            <div className="space-y-2">
              {minutes.actionItems.map((a, i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[1fr_120px_150px_auto]">
                  <input className="input" placeholder="할 일" value={a.task} onChange={(e) => setAction(i, { task: e.target.value })} />
                  <input className="input" placeholder="담당자" list="member-names" value={a.owner} onChange={(e) => setAction(i, { owner: e.target.value })} />
                  <input className="input" type="date" value={a.dueDate} onChange={(e) => setAction(i, { dueDate: e.target.value })} />
                  <button type="button" className="btn-ghost btn-sm" aria-label="항목 삭제" onClick={() => set("actionItems", minutes.actionItems.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {minutes.actionItems.some((a) => a.eventId) && (
                <p className="text-xs text-gray-500">이미 일정에 등록된 항목은 여기서 수정해도 일정에는 반영되지 않습니다. 일정 화면에서 함께 수정하세요.</p>
              )}
            </div>
          </div>

          <ListField label="미결·확인 필요 사항" value={minutes.openIssues} onChange={(v) => set("openIssues", v)} />
          <div>
            <label className="label">다음 회의</label>
            <input className="input" value={minutes.nextMeeting} onChange={(e) => set("nextMeeting", e.target.value)} />
          </div>
        </section>
      ) : (
        <section className="card flex flex-col items-start gap-2 p-5">
          <p className="text-sm text-gray-600">아직 정리된 회의록이 없습니다. AI 없이 직접 작성할 수도 있습니다.</p>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setWithMinutes(true)}>
            회의록 직접 작성
          </button>
        </section>
      )}

      <section className="card space-y-2 p-5">
        <h2 className="card-title">회의 원문</h2>
        <p className="text-xs text-gray-500">원문을 고친 뒤 회의록 화면에서 「원문으로 다시 정리」를 누르면 AI가 새로 정리합니다.</p>
        <textarea className="input text-sm leading-relaxed" rows={12} value={rawNotes} onChange={(e) => setRawNotes(e.target.value)} />
      </section>

      <div className="sticky bottom-4 flex items-center justify-end gap-3 rounded-xl border border-gray-200 bg-white/95 p-3 shadow-lg backdrop-blur">
        {error && <p className="mr-auto text-sm text-red-600">{error}</p>}
        <button type="button" className="btn-secondary" onClick={() => router.back()}>
          취소
        </button>
        <button type="button" className="btn-primary" onClick={save} disabled={saving}>
          {saving ? "저장 중…" : "저장"}
        </button>
      </div>
    </div>
  );
}
