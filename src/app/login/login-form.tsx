"use client";

import { useActionState, useState } from "react";
import { loginAction } from "./actions";
import { FormError, SubmitButton } from "@/components/form-controls";
import { cn } from "@/lib/utils";

type MemberOption = { id: string; name: string; role: string; color: string; hasPassword: boolean };

export function LoginForm({ members, next }: { members: MemberOption[]; next: string }) {
  const [state, action] = useActionState(loginAction, undefined);
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = members.find((m) => m.id === selectedId);

  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="memberId" value={selectedId} />
      <div>
        <p className="label">누구신가요?</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSelectedId(m.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                selectedId === m.id
                  ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
                  : "border-gray-200 bg-white hover:border-gray-300",
              )}
            >
              <span
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                style={{ backgroundColor: m.color }}
              >
                {m.name.slice(0, 1)}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-gray-900">{m.name}</span>
                {m.role && <span className="block truncate text-xs text-gray-500">{m.role}</span>}
              </span>
            </button>
          ))}
        </div>
      </div>

      {selected && selected.hasPassword && (
        <div>
          <label className="label" htmlFor="password">
            비밀번호
          </label>
          <input id="password" name="password" type="password" className="input" autoComplete="current-password" autoFocus required />
        </div>
      )}

      {selected && !selected.hasPassword && (
        <div className="space-y-3 rounded-lg border border-brand-100 bg-brand-50/50 p-3.5">
          <p className="text-sm text-gray-700">
            <b>{selected.name}</b>님의 첫 로그인입니다. 팀 초대 코드를 입력하고 개인 비밀번호를 만들어 주세요.
          </p>
          <div>
            <label className="label" htmlFor="inviteCode">
              팀 초대 코드
            </label>
            <input id="inviteCode" name="inviteCode" type="password" className="input" required autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="newPassword">
                새 비밀번호 (6자 이상)
              </label>
              <input id="newPassword" name="newPassword" type="password" className="input" autoComplete="new-password" required minLength={6} />
            </div>
            <div>
              <label className="label" htmlFor="confirmPassword">
                비밀번호 확인
              </label>
              <input id="confirmPassword" name="confirmPassword" type="password" className="input" autoComplete="new-password" required minLength={6} />
            </div>
          </div>
        </div>
      )}

      <FormError state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="로그인 중…">
        {selected && !selected.hasPassword ? "비밀번호 설정하고 시작하기" : "로그인"}
      </SubmitButton>
    </form>
  );
}
