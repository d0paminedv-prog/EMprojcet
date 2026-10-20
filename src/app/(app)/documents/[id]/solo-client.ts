import type { AcquireResult, SoloState } from "@/lib/solo";

/** 단독 편집 모드 API (/api/documents/[id]/solo) 호출 */

type Json = Record<string, unknown>;

const url = (documentId: string) => `/api/documents/${documentId}/solo`;

async function post<T>(documentId: string, body: Record<string, unknown>): Promise<{ status: number; data: T | null }> {
  const res = await fetch(url(documentId), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  return { status: res.status, data: res.status === 204 ? null : ((await res.json().catch(() => null)) as T | null) };
}

/** 편집 권한 받기·연장 (네트워크 오류면 null) */
export async function acquireSolo(documentId: string): Promise<AcquireResult | null> {
  try {
    const { data } = await post<AcquireResult>(documentId, { action: "acquire" });
    return data && "ok" in data ? data : null;
  } catch {
    return null;
  }
}

/** 서버 사본·단독 편집 상태 (네트워크 오류면 null) */
export async function fetchSoloState(documentId: string): Promise<SoloState | null> {
  try {
    const res = await fetch(url(documentId), { cache: "no-store" });
    return res.ok ? ((await res.json()) as SoloState) : null;
  } catch {
    return null;
  }
}

/** 단독 편집 저장. lost: 편집 권한이 끝남 */
export async function saveSolo(documentId: string, input: { json: Json; text: string }): Promise<{ savedAt?: string; error?: string; lost?: boolean }> {
  try {
    const { status, data } = await post<{ savedAt?: string; error?: string }>(documentId, { action: "save", ...input });
    if (status === 409) return { error: data?.error ?? "단독 편집 권한이 끝났습니다.", lost: true };
    return data ?? { error: "저장하지 못했습니다." };
  } catch {
    return { error: "서버에 연결할 수 없어 저장하지 못했습니다. 다시 연결되면 저장합니다." };
  }
}

/** 창을 닫을 때: 남은 내용 저장 + 편집 권한 반납 (페이지가 닫혀도 전송되도록 keepalive / sendBeacon) */
export function leaveSolo(documentId: string, pending: { json: Json; text: string } | null) {
  const body = JSON.stringify(pending ? { action: "save", ...pending, release: true } : { action: "release" });
  if (body.length < 60_000) {
    if (navigator.sendBeacon?.(url(documentId), new Blob([body], { type: "application/json" }))) return;
    void fetch(url(documentId), { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  } else {
    void fetch(url(documentId), { method: "POST", headers: { "Content-Type": "application/json" }, body }).catch(() => {});
  }
}

/** 실시간으로 다시 연 사람이 단독 편집 내용 가져가기 (먼저 가져간 한 명만 받음) */
export async function claimSoloEdits(documentId: string): Promise<Json | null> {
  try {
    const { data } = await post<{ json: Json | null }>(documentId, { action: "claim" });
    return data?.json ?? null;
  } catch {
    return null;
  }
}
