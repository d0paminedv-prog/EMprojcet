"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, Sparkles } from "lucide-react";

const STEPS = ["회의 원문을 읽는 중", "안건과 논의 주제를 분류하는 중", "결정 사항을 정리하는 중", "액션 아이템과 담당자를 추출하는 중", "회의록을 다듬는 중"];

export function SummarizeButton({
  meetingId,
  autoStart,
  label = "AI로 회의록 정리",
  className = "btn-primary",
  confirmMessage,
}: {
  meetingId: string;
  autoStart?: boolean;
  label?: string;
  className?: string;
  confirmMessage?: string;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    setStep(0);
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 6000);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/summarize`, { method: "POST" });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "AI 정리에 실패했습니다.");
      router.replace(`/meetings/${meetingId}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "AI 정리에 실패했습니다.");
      router.refresh();
    } finally {
      clearInterval(timer);
      setRunning(false);
    }
  }, [meetingId, router]);

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoStart, run]);

  if (running) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
        <Loader2 className="h-5 w-5 animate-spin text-violet-600" />
        <div>
          <p className="text-sm font-medium text-violet-900">AI가 회의록을 정리하고 있습니다…</p>
          <p className="text-xs text-violet-700">{STEPS[step]} · 보통 20초~1분 정도 걸립니다</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => (!confirmMessage || window.confirm(confirmMessage)) && run()} className={className}>
        <Sparkles className="h-4 w-4" />
        {label}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function CopyButton({ text, label = "마크다운 복사" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
      {copied ? "복사됨" : label}
    </button>
  );
}
