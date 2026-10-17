import { Liveblocks } from "@liveblocks/node";

/** Liveblocks(실시간 동기화) — 무료 플랜의 Secret key 로 동작 */
export function liveblocksConfigured(): boolean {
  return !!process.env.LIVEBLOCKS_SECRET_KEY;
}

/** 로컬 개발 서버(npx liveblocks dev) 사용 시에만 설정됨 */
export function liveblocksBaseUrl(): string | undefined {
  return process.env.LIVEBLOCKS_BASE_URL || undefined;
}

const globalForLb = globalThis as unknown as { __bxLiveblocks?: Liveblocks };

export function liveblocks(): Liveblocks {
  if (!globalForLb.__bxLiveblocks) {
    const secret = process.env.LIVEBLOCKS_SECRET_KEY;
    if (!secret) throw new Error("LIVEBLOCKS_SECRET_KEY가 설정되지 않았습니다.");
    globalForLb.__bxLiveblocks = new Liveblocks({ secret, baseUrl: liveblocksBaseUrl() });
  }
  return globalForLb.__bxLiveblocks;
}

/** 방 이름 규칙: 팀 전체 방(접속자·변경 알림) + 문서별 방 */
export const ROOM_PREFIX = "bx:";
export const TEAM_ROOM = "bx:team";
export const docRoomId = (documentId: string) => `bx:doc:${documentId}`;
