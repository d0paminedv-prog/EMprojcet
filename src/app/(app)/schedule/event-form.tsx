"use client";

import { useActionState, useState } from "react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { EVENT_TYPES } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

export type EventFormValues = {
  title: string;
  type: string;
  allDay: boolean;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  description: string;
  projectId: string;
  assigneeIds: string[];
  done: boolean;
};

export function EventForm({
  action,
  values,
  projects,
  members,
  filterProject,
  submitLabel,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: EventFormValues;
  projects: { id: string; name: string }[];
  members: { id: string; name: string; color: string }[];
  filterProject?: string;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [allDay, setAllDay] = useState(values.allDay);
  const [type, setType] = useState(values.type);

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="filterProject" value={filterProject ?? ""} />
      <div>
        <label className="label" htmlFor="ev-title">
          제목 *
        </label>
        <input id="ev-title" name="title" className="input" required defaultValue={values.title} placeholder="예) 팝업 공간 시공 미팅" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ev-type">
            유형
          </label>
          <select id="ev-type" name="type" className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="ev-project">
            프로젝트
          </label>
          <select id="ev-project" name="projectId" className="input" defaultValue={values.projectId}>
            <option value="">공통</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" name="allDay" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
        종일
      </label>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">시작일</label>
          <input type="date" name="startDate" className="input" required defaultValue={values.startDate} />
        </div>
        {!allDay && (
          <div>
            <label className="label">시작 시간</label>
            <input type="time" name="startTime" className="input" defaultValue={values.startTime} />
          </div>
        )}
        <div>
          <label className="label">종료일</label>
          <input type="date" name="endDate" className="input" defaultValue={values.endDate} />
        </div>
        {!allDay && (
          <div>
            <label className="label">종료 시간</label>
            <input type="time" name="endTime" className="input" defaultValue={values.endTime} />
          </div>
        )}
      </div>

      <div>
        <label className="label" htmlFor="ev-location">
          장소
        </label>
        <input id="ev-location" name="location" className="input" defaultValue={values.location} placeholder="예) 성수 현장 / 회의실 / Zoom" />
      </div>

      <div>
        <span className="label">담당자</span>
        <div className="flex flex-wrap gap-1.5">
          {members.map((m) => (
            <label key={m.id} className="cursor-pointer">
              <input type="checkbox" name="assigneeIds" value={m.id} defaultChecked={values.assigneeIds.includes(m.id)} className="peer sr-only" />
              <span className="badge border border-gray-200 bg-white px-2.5 py-1 text-gray-600 peer-checked:border-transparent peer-checked:bg-gray-900 peer-checked:text-white">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: m.color }} />
                {m.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="ev-desc">
          메모
        </label>
        <textarea id="ev-desc" name="description" rows={3} className="input" defaultValue={values.description} />
      </div>

      {type === "task" && (
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" name="done" defaultChecked={values.done} className="h-4 w-4 rounded border-gray-300" />
          완료됨
        </label>
      )}

      <FormError state={state} />
      <SubmitButton className="btn-primary w-full">{submitLabel}</SubmitButton>
    </form>
  );
}
