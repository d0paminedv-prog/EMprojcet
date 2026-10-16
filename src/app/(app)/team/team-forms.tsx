"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { PALETTE } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function MemberEditForm({ action, member }: { action: Action; member: { name: string; role: string; email: string; color: string } }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <input name="name" className="input" defaultValue={member.name} placeholder="이름" required />
        <input name="role" className="input" defaultValue={member.role} placeholder="역할 (예: PM, 디자이너)" />
        <input name="email" type="email" className="input" defaultValue={member.email} placeholder="이메일" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {PALETTE.map((c) => (
          <label key={c} className="cursor-pointer">
            <input type="radio" name="color" value={c} defaultChecked={member.color === c} className="peer sr-only" />
            <span className="block h-6 w-6 rounded-full ring-offset-2 peer-checked:ring-2 peer-checked:ring-gray-900" style={{ backgroundColor: c }} />
          </label>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <FormError state={state} />
          <SubmitButton className="btn-primary btn-sm">저장</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function AddMemberForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <input name="name" className="input" placeholder="이름" required />
        <input name="role" className="input" placeholder="역할" />
        <SubmitButton className="btn-secondary">팀원 추가</SubmitButton>
      </div>
      <FormError state={state} />
    </form>
  );
}

export function ChangePasswordForm({ action }: { action: Action }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <input name="current" type="password" className="input" placeholder="현재 비밀번호" autoComplete="current-password" required />
      <input name="next" type="password" className="input" placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password" required minLength={6} />
      <input name="confirm" type="password" className="input" placeholder="새 비밀번호 확인" autoComplete="new-password" required minLength={6} />
      <FormError state={state} />
      <SubmitButton className="btn-primary btn-sm w-full">비밀번호 변경</SubmitButton>
    </form>
  );
}
