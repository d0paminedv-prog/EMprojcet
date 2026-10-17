"use client";

import { useActionState } from "react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { submitEntryCode, submitName } from "./actions";

export function EntryCodeForm({ next }: { next: string }) {
  const [state, action] = useActionState(submitEntryCode, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="code">
          입장 코드
        </label>
        <input
          id="code"
          name="code"
          className="input py-3 text-center text-lg tracking-widest"
          placeholder="팀에서 공유받은 코드"
          autoComplete="off"
          autoFocus
          required
        />
      </div>
      <FormError state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="확인 중…">
        입장하기
      </SubmitButton>
    </form>
  );
}

export function NameForm({ next, names }: { next: string; names: string[] }) {
  const [state, action] = useActionState(submitName, undefined);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div>
        <label className="label" htmlFor="name">
          본인 이름
        </label>
        <input
          id="name"
          name="name"
          list="member-names"
          className="input py-3 text-center text-lg"
          placeholder="예) 김민지"
          maxLength={20}
          autoComplete="name"
          autoFocus
          required
        />
        <datalist id="member-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <p className="mt-2 text-xs text-gray-500">처음 입력한 이름은 팀원으로 등록되고, 다음부터는 같은 이름으로 들어오면 됩니다.</p>
      </div>
      <FormError state={state} />
      <SubmitButton className="btn-primary w-full py-2.5" pendingText="입장 중…">
        시작하기
      </SubmitButton>
    </form>
  );
}
