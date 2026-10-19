/** 편집기 ↔ 코멘트 패널 사이 신호 (window 이벤트) */

/** 편집기에서 「코멘트」를 눌렀을 때 (detail: 위치 코드·인용) */
export const NEW_COMMENT_EVENT = "bx:new-comment";
export type NewCommentDetail = { anchor: string; quote: string };

/** 본문의 코멘트 표시를 눌렀을 때 → 패널에서 그 코멘트 보여 주기 (detail: 코멘트 ID) */
export const OPEN_COMMENT_EVENT = "bx:open-comment";
export type OpenCommentDetail = { id: string };

/** 패널에서 인용을 눌렀을 때 → 본문의 그 위치로 이동 (detail: 위치 코드) */
export const FOCUS_ANCHOR_EVENT = "bx:focus-anchor";
export type FocusAnchorDetail = { anchor: string };

export function emit<T>(name: string, detail: T) {
  window.dispatchEvent(new CustomEvent<T>(name, { detail }));
}
