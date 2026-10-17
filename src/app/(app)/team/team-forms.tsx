"use client";

import { useActionState, useState } from "react";
import { Check, Copy } from "lucide-react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { PALETTE } from "@/lib/constants";
import type { ActionState } from "@/lib/utils";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export function MemberEditForm({ action, member }: { action: Action; member: { name: string; role: string; color: string } }) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="mt-3 space-y-3 border-t border-gray-100 pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <input name="name" className="input" defaultValue={member.name} placeholder="이름" maxLength={20} required />
        <input name="role" className="input" defaultValue={member.role} placeholder="역할 (예: PM, 디자이너, 운영)" />
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

/** 팀원에게 보낼 초대 문구 복사 */
export function InviteBox({ code, origin }: { code: string; origin: string }) {
  const [copied, setCopied] = useState(false);
  const text = `[BX Hub 초대]\n아래 링크로 접속해서 입장 코드를 입력하고 본인 이름을 적어 주세요.\n링크: ${origin}\n입장 코드: ${code}`;
  return (
    <div className="space-y-3">
      <pre className="whitespace-pre-wrap rounded-lg bg-gray-50 p-3 font-sans text-sm text-gray-800">{text}</pre>
      <button
        type="button"
        className="btn-primary btn-sm w-full"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "복사했습니다" : "초대 문구 복사"}
      </button>
      <p className="text-xs text-gray-500">입장 코드는 Vercel 환경변수 <code>ENTRY_CODE</code>로 바꿀 수 있고, 바꾸면 모든 팀원이 새 코드로 다시 입장합니다.</p>
    </div>
  );
}
