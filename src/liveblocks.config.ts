// Liveblocks 전역 타입 정의 (접속자 정보, 실시간 알림 이벤트)
declare global {
  interface Liveblocks {
    Presence: { page: string | null };
    UserMeta: { id: string; info: { name: string; color: string } };
    RoomEvent: { type: "changed"; scope: string };
  }
}

export {};
