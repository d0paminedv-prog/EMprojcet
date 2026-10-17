"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { FormError, SubmitButton } from "@/components/form-controls";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

export type TaskFormValues = {
  title: string;
  description: string;
  status: string;
  priority: string;
  dueDate: string;
  assigneeId: string;
  projectId: string;
  documentId: string;
  figmaUrl: string;
};

type Option = { id: string; name: string };

export function TaskForm({
  action,
  values,
  members,
  projects,
  documents,
  submitLabel,
  doneHref,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  values: TaskFormValues;
  members: Option[];
  projects: Option[];
  documents: { id: string; title: string }[];
  submitLabel: string;
  doneHref: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, undefined);
  useEffect(() => {
    if (state?.ok) router.push(doneHref, { scroll: false });
  }, [state, doneHref, router]);

  return (
    <form action={formAction} className="space-y-3.5">
      <div>
        <label className="label" htmlFor="task-title">
          제목 *
        </label>
        <input id="task-title" name="title" className="input" required defaultValue={values.title} placeholder="예) 팝업 동선 도면 확정" autoFocus={!values.title} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="task-assignee">
            담당자
          </label>
          <select id="task-assignee" name="assigneeId" className="input" defaultValue={values.assigneeId}>
            <option value="">미배정</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="task-due">
            마감일
          </label>
          <input id="task-due" name="dueDate" type="date" className="input" defaultValue={values.dueDate} />
        </div>
        <div>
          <label className="label" htmlFor="task-status">
            상태
          </label>
          <select id="task-status" name="status" className="input" defaultValue={values.status}>
            {TASK_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="task-priority">
            우선순위
          </label>
          <select id="task-priority" name="priority" className="input" defaultValue={values.priority}>
            {TASK_PRIORITIES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="task-project">
          프로젝트
        </label>
        <select id="task-project" name="projectId" className="input" defaultValue={values.projectId}>
          <option value="">공통</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="task-desc">
          메모
        </label>
        <textarea id="task-desc" name="description" rows={4} className="input" defaultValue={values.description} placeholder="세부 내용, 체크할 점 등" />
      </div>
      <div>
        <label className="label" htmlFor="task-doc">
          연결 문서
        </label>
        <select id="task-doc" name="documentId" className="input" defaultValue={values.documentId}>
          <option value="">없음</option>
          {documents.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="task-figma">
          Figma 링크
        </label>
        <input id="task-figma" name="figmaUrl" type="url" className="input" defaultValue={values.figmaUrl} placeholder="https://www.figma.com/design/..." />
      </div>
      <FormError state={state?.error ? state : undefined} />
      <SubmitButton className="btn-primary w-full">{submitLabel}</SubmitButton>
    </form>
  );
}

/** 보드 상단 빠른 추가 */
export function QuickAddTask({
  action,
  members,
  projects,
  defaultAssigneeId,
  defaultProjectId,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  members: Option[];
  projects: Option[];
  defaultAssigneeId: string;
  defaultProjectId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await action(prev, form);
    if (result?.ok) {
      const title = formRef.current?.elements.namedItem("title") as HTMLInputElement | null;
      if (title) {
        title.value = "";
        title.focus();
      }
    }
    return result;
  }, undefined);
  return (
    <form ref={formRef} action={formAction} className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_130px_170px_150px_auto]">
      <input name="title" className="input" placeholder="+ 새 태스크 입력 후 Enter" required aria-label="새 태스크 제목" />
      <select name="assigneeId" className="input" defaultValue={defaultAssigneeId} aria-label="담당자">
        <option value="">미배정</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      <select name="projectId" className="input" defaultValue={defaultProjectId} aria-label="프로젝트">
        <option value="">공통</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input name="dueDate" type="date" className="input" aria-label="마감일" />
      <SubmitButton className="btn-primary" pendingText="추가 중…">
        추가
      </SubmitButton>
      {state?.error && <p className="text-sm text-red-600 sm:col-span-5">{state.error}</p>}
    </form>
  );
}
