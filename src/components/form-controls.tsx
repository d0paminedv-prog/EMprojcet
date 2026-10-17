"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { notifyChange } from "./realtime";

/** 폼 제출(서버 저장)이 끝나면 다른 팀원 화면에 변경 알림 */
function useNotifyWhenDone(pending: boolean) {
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) notifyChange();
    wasPending.current = pending;
  }, [pending]);
}

/** 일반 버튼을 쓰는 폼 안에 넣으면 제출 완료 후 변경 알림 */
export function NotifyAfterSubmit() {
  const { pending } = useFormStatus();
  useNotifyWhenDone(pending);
  return null;
}

export function SubmitButton({
  children,
  pendingText,
  className = "btn-primary",
  name,
  value,
}: {
  children: ReactNode;
  pendingText?: string;
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  useNotifyWhenDone(pending);
  return (
    <button type="submit" className={className} disabled={pending} name={name} value={value}>
      {pending ? pendingText ?? "처리 중…" : children}
    </button>
  );
}

/** 삭제 등 되돌릴 수 없는 작업 전 확인창을 띄우는 제출 버튼 */
export function ConfirmButton({
  children,
  message,
  className = "btn-danger btn-sm",
}: {
  children: ReactNode;
  message: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  useNotifyWhenDone(pending);
  return (
    <button
      type="submit"
      className={cn(className)}
      disabled={pending}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}

export function FormError({ state }: { state?: { error?: string; message?: string } }) {
  if (state?.error) return <p className="text-sm text-red-600">{state.error}</p>;
  if (state?.message) return <p className="text-sm text-emerald-600">{state.message}</p>;
  return null;
}
