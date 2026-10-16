"use client";

import { useActionState } from "react";
import type { Project } from "@/db/schema";
import { FormError, SubmitButton } from "@/components/form-controls";
import { PALETTE, PROJECT_CATEGORIES, PROJECT_STATUSES } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  project?: Project;
  members: { id: string; name: string }[];
  defaultOwnerId?: string;
  submitLabel: string;
};

export function ProjectForm({ action, project, members, defaultOwnerId, submitLabel }: Props) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="card space-y-5 p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="name">
            프로젝트명 *
          </label>
          <input id="name" name="name" className="input" required defaultValue={project?.name} placeholder="예) OO브랜드 성수 팝업스토어" />
        </div>
        <div>
          <label className="label" htmlFor="brand">
            브랜드 / 클라이언트
          </label>
          <input id="brand" name="brand" className="input" defaultValue={project?.brand} placeholder="예) OO코스메틱" />
        </div>
        <div>
          <label className="label" htmlFor="venue">
            장소
          </label>
          <input id="venue" name="venue" className="input" defaultValue={project?.venue} placeholder="예) 성수동 OO갤러리" />
        </div>
        <div>
          <label className="label" htmlFor="category">
            체험마케팅 유형
          </label>
          <select id="category" name="category" className="input" defaultValue={project?.category ?? "popup"}>
            {PROJECT_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="status">
            진행 상태
          </label>
          <select id="status" name="status" className="input" defaultValue={project?.status ?? "planning"}>
            {PROJECT_STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="startDate">
            시작일 (운영 시작)
          </label>
          <input id="startDate" name="startDate" type="date" className="input" defaultValue={project?.startDate ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="endDate">
            종료일
          </label>
          <input id="endDate" name="endDate" type="date" className="input" defaultValue={project?.endDate ?? ""} />
        </div>
        <div>
          <label className="label" htmlFor="ownerId">
            담당 PM
          </label>
          <select id="ownerId" name="ownerId" className="input" defaultValue={project?.ownerId ?? defaultOwnerId ?? ""}>
            <option value="">미지정</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <span className="label">표시 색상</span>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c, i) => (
              <label key={c} className="cursor-pointer">
                <input
                  type="radio"
                  name="color"
                  value={c}
                  defaultChecked={project ? project.color === c : i === 0}
                  className="peer sr-only"
                />
                <span
                  className="block h-7 w-7 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-gray-900"
                  style={{ backgroundColor: c }}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="description">
            개요 / 목표
          </label>
          <textarea
            id="description"
            name="description"
            rows={5}
            className="input"
            defaultValue={project?.description}
            placeholder="캠페인 목적, 타깃, KPI(방문객 수, 샘플 배포 수, SNS 언급량 등), 예산 범위 등을 적어 두세요."
          />
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormError state={state} />
        <SubmitButton className="btn-primary ml-auto">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
