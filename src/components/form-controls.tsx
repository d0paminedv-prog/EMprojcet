"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

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
