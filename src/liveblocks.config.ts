// Liveblocks 전역 타입 정의 (접속자 정보, 실시간 알림 이벤트)
declare global {
  interface Liveblocks {
    Presence: {
      /** 지금 보고 있는 화면 경로 */
      page: string | null;
      /** 화면 제목 (문서·프로젝트 이름) */
      title: string | null;
      /** 직접 알린 작업 (예: 파일 3개 올리는 중) */
      doing: string | null;
      /** 입력·편집 중 */
      typing: boolean;
      /** 다른 탭을 보고 있거나 5분 이상 조작 없음 */
      away: boolean;
      /** 이 화면에 들어온 시각 (ms) */
      since: number;
      /** 실시간 문서 안 내 커서 위치 코드 (위치 링크와 같은 형식) */
      at: string | null;
      /** 커서가 있는 곳의 제목 (예: 3. 타깃) */
      section: string | null;
    };
    UserMeta: { id: string; info: { name: string; color: string } };
    RoomEvent: { type: "changed"; scope: string };
  }
}

export {};
