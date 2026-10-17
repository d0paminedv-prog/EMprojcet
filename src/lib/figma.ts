import type { FigmaMeta } from "@/db/schema";

/** 선택 기능: FIGMA_TOKEN(개인 액세스 토큰, file_content:read)을 넣으면 썸네일·수정 시각을 가져옵니다. */
export function figmaConfigured(): boolean {
  return !!process.env.FIGMA_TOKEN;
}

/** Figma URL → 파일 키 (디자인·프로토타입·FigJam·Slides·브랜치 링크 지원) */
export function figmaFileKey(url: string): string | null {
  try {
    const u = new URL(url);
    if (!(u.hostname === "figma.com" || u.hostname.endsWith(".figma.com"))) return null;
    const branch = u.pathname.match(/\/(?:file|design|proto|board|slides|deck)\/[A-Za-z0-9]+(?:\/[^/]+)?\/branch\/([A-Za-z0-9]+)/);
    if (branch) return branch[1];
    const m = u.pathname.match(/\/(?:file|design|proto|board|slides|deck)\/([A-Za-z0-9]+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

const REFRESH_MS = 6 * 60 * 60 * 1000;

export function figmaMetaStale(meta: FigmaMeta | null | undefined): boolean {
  return !meta || Date.now() - new Date(meta.fetchedAt).getTime() > REFRESH_MS;
}

/** Figma REST API로 파일 이름·최종 수정 시각·썸네일 조회 (실패 시 null) */
export async function fetchFigmaMeta(url: string): Promise<FigmaMeta | null> {
  const token = process.env.FIGMA_TOKEN;
  const key = figmaFileKey(url);
  if (!token || !key) return null;
  try {
    const res = await fetch(`https://api.figma.com/v1/files/${key}?depth=1`, {
      headers: { "X-Figma-Token": token },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`Figma API ${res.status} (${key})`);
      return null;
    }
    const json = (await res.json()) as { name?: string; lastModified?: string; thumbnailUrl?: string };
    return {
      name: json.name ?? "",
      lastModified: json.lastModified ?? null,
      thumbnailUrl: json.thumbnailUrl ?? null,
      fetchedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn("Figma API 호출 실패:", err);
    return null;
  }
}

/** 오래된 Figma 정보 새로 고침 (토큰이 있을 때만, 응답 후 백그라운드에서 호출) */
export async function refreshFigmaDocs(docs: { id: string; url: string | null; figmaMeta: FigmaMeta | null }[]): Promise<void> {
  if (!figmaConfigured()) return;
  const stale = docs.filter((d) => d.url && figmaMetaStale(d.figmaMeta)).slice(0, 10);
  if (!stale.length) return;
  const { db } = await import("@/db");
  const { documents } = await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  await Promise.all(
    stale.map(async (d) => {
      const meta = await fetchFigmaMeta(d.url!);
      if (meta) await db.update(documents).set({ figmaMeta: meta }).where(eq(documents.id, d.id));
    }),
  );
}
