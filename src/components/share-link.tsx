"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { documentPath, shareText } from "@/lib/links";
import { cn } from "@/lib/utils";

/** 클립보드 복사 (http 접속 등 Clipboard API 를 못 쓰는 환경은 예전 방식으로) */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * 링크 공유: 모바일(터치)은 공유 창(카카오톡 등), PC 는 클립보드 복사.
 * 둘 다 안 되면 직접 복사할 수 있게 주소를 띄움.
 */
export async function shareOrCopy({ title, url, detail }: { title: string; url: string; detail?: string }): Promise<"shared" | "copied" | "cancelled"> {
  const text = shareText(title, url, detail);
  if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
    try {
      await navigator.share({ title, text: detail ? `「${title}」 › ${detail}` : `「${title}」`, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "cancelled";
    }
  }
  if (await copyText(text)) return "copied";
  window.prompt("아래 링크를 복사해 공유하세요", url);
  return "cancelled";
}

export function absoluteUrl(path: string): string {
  return new URL(path, window.location.origin).toString();
}

/** 잠깐 떴다 사라지는 알림 */
export function Toast({ message, onDone }: { message: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!message) return;
    const id = setTimeout(onDone, 2800);
    return () => clearTimeout(id);
  }, [message, onDone]);
  if (!message) return null;
  return (
    <div role="status" className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-gray-900 px-3.5 py-2 text-sm text-white shadow-lg" data-testid="toast">
      {message}
    </div>
  );
}

function useCopiedFlag(): [boolean, () => void] {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(id);
  }, [copied]);
  return [copied, () => setCopied(true)];
}

/** 문서 상단 「링크 복사」 */
export function ShareLinkButton({ documentId, title, className }: { documentId: string; title: string; className?: string }) {
  const [copied, markCopied] = useCopiedFlag();
  return (
    <button
      type="button"
      className={cn("btn-secondary", className)}
      onClick={async () => {
        if ((await shareOrCopy({ title, url: absoluteUrl(documentPath(documentId)) })) === "copied") markCopied();
      }}
      title="이 문서로 바로 가는 링크를 복사합니다 (팀원만 열람 가능)"
    >
      {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Link2 className="h-4 w-4" />}
      {copied ? "복사됨" : "링크 복사"}
    </button>
  );
}

/** PDF 미리보기의 특정 쪽 링크 */
export function PdfPageLink({ documentId, title, initialPage }: { documentId: string; title: string; initialPage: number | null }) {
  const [page, setPage] = useState(String(initialPage ?? 1));
  const [copied, markCopied] = useCopiedFlag();
  const n = Math.max(1, Math.min(10000, Math.floor(Number(page)) || 1));
  return (
    <div className="flex flex-wrap items-center gap-2 px-1 pb-2 text-xs text-gray-600">
      {initialPage && <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">공유된 {initialPage}쪽부터 표시</span>}
      <span className="ml-auto flex items-center gap-1.5">
        <label htmlFor="pdf-page">쪽 링크</label>
        <input id="pdf-page" type="number" min={1} inputMode="numeric" className="input w-20 py-1 text-xs" value={page} onChange={(e) => setPage(e.target.value)} />
        <span>쪽</span>
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={async () => {
            if ((await shareOrCopy({ title, url: absoluteUrl(documentPath(documentId, { page: n })), detail: `${n}쪽` })) === "copied") markCopied();
          }}
        >
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Link2 className="h-3.5 w-3.5" />}
          {copied ? "복사됨" : "이 쪽 링크 복사"}
        </button>
      </span>
    </div>
  );
}
