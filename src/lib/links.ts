/** 문서·위치 링크 만들기와 글 속 링크 찾기 (서버·브라우저 공용) */

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const DOC_PATH = new RegExp(`^/documents/(${UUID})$`, "i");

/** 위치 코드: Yjs 상대 위치(base64url) 1개 또는 범위 2개, 뒤에 「~소속 제목」 */
export function isPositionCode(value: string | null | undefined): value is string {
  return !!value && /^[A-Za-z0-9_-]{2,200}(\.[A-Za-z0-9_-]{2,200})?(~[A-Za-z0-9_-]{2,200})?$/.test(value);
}

export function parsePageNumber(value: string | null | undefined): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 10000 ? n : null;
}

/** 문서(·위치) 경로. 예) /documents/<id>?at=<코드>, /documents/<id>?page=3 */
export function documentPath(documentId: string, opts: { at?: string; page?: number } = {}): string {
  // 위치 코드는 주소에 그대로 쓸 수 있는 글자만 사용 (~ 도 인코딩하지 않아 링크가 짧고 읽기 쉬움)
  const query = [opts.at && isPositionCode(opts.at) ? `at=${opts.at}` : "", opts.page ? `page=${opts.page}` : ""].filter(Boolean).join("&");
  return `/documents/${documentId}${query ? `?${query}` : ""}`;
}

export type FoundUrl = { start: number; end: number; url: string };

/** 글 속 http(s) 주소 찾기 (끝의 문장부호·닫는 괄호는 제외) */
export function findUrls(text: string): FoundUrl[] {
  const out: FoundUrl[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s<>"'「」『』]+/g)) {
    const url = m[0].replace(/[.,;:!?)\]}>…]+$/, "");
    if (url.length > "https://".length) out.push({ start: m.index, end: m.index + url.length, url });
  }
  return out;
}

export type AppLink = { path: string; documentId: string | null; at: string | null; page: number | null };

/** 이 앱 주소인지 확인하고 경로·문서 정보를 꺼냄 (다른 사이트 주소면 null) */
export function parseAppLink(url: string, origin: string): AppLink | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  const doc = u.pathname.match(DOC_PATH);
  const at = u.searchParams.get("at");
  return {
    path: `${u.pathname}${u.search}${u.hash}`,
    documentId: doc ? doc[1].toLowerCase() : null,
    at: doc && isPositionCode(at) ? at : null,
    page: doc ? parsePageNumber(u.searchParams.get("page")) : null,
  };
}

/** 공유용 글: 「문서 제목」 › 위치 설명 + 주소 */
export function shareText(title: string, url: string, detail?: string): string {
  return `「${title}」${detail ? ` › ${detail}` : ""}\n${url}`;
}

export function clip(text: string, max = 40): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
