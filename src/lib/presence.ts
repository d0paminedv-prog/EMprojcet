import { isPositionCode } from "./links";

/** 팀원 실시간 활동 정의와 문장 만들기 (앱 서버 신호 + 실시간 문서 방 presence 공용) */

export type TeamPresence = Liveblocks["Presence"];

export const EMPTY_PRESENCE: TeamPresence = { page: null, title: null, doing: null, typing: false, away: false, since: 0, at: null, section: null };

/** 5분 동안 조작이 없으면 자리 비움 */
export const IDLE_MS = 5 * 60 * 1000;

/** 팀원 활동 신호 간격 (앱 서버 /api/pulse) */
export const PULSE_MS = 20_000;

/** 접속 중인 팀원 탭 하나 (seen: 마지막 신호 시각, 서버 시계 ms) */
export type PulseMember = { id: string; name: string; color: string; tab: string; seen: number; presence: TeamPresence };
export type PulseResult = { members: PulseMember[]; changedAt: number | null };

type SectionKind =
  | "dashboard"
  | "tasks"
  | "projects"
  | "project"
  | "project-new"
  | "project-edit"
  | "documents"
  | "document"
  | "document-new"
  | "schedule"
  | "team"
  | "other";

export function pageSection(path: string): SectionKind {
  const p = path.replace(/\/+$/, "") || "/";
  if (p === "/") return "dashboard";
  if (p === "/tasks") return "tasks";
  if (p === "/projects") return "projects";
  if (p === "/projects/new") return "project-new";
  if (/^\/projects\/[^/]+\/edit$/.test(p)) return "project-edit";
  if (p.startsWith("/projects/")) return "project";
  if (p === "/documents") return "documents";
  if (p === "/documents/new") return "document-new";
  if (p.startsWith("/documents/")) return "document";
  if (p.startsWith("/schedule")) return "schedule";
  if (p.startsWith("/team")) return "team";
  return "other";
}

/** 앱 안의 경로만 링크로 (다른 사이트·스크립트 URL 차단) */
export function isAppPath(path: string | null): path is string {
  return !!path && /^\/(?![/\\])/.test(path) && path.length < 500;
}

/** 팀원이 있는 곳으로 가는 주소 (실시간 문서면 커서 위치까지) */
export function presenceHref(p: TeamPresence): string | null {
  if (!isAppPath(p.page)) return null;
  return pageSection(p.page) === "document" && isPositionCode(p.at) ? `${p.page}?at=${p.at}` : p.page;
}

/** 브라우저 탭 제목에서 앱 이름을 뗀 화면 제목 */
export function screenTitle(documentTitle: string): string | null {
  const t = documentTitle.replace(/\s*·\s*BX Hub$/, "").trim();
  return t || null;
}

/** 예) 「성수 팝업 기획안」 편집 중 / 태스크 보드 보는 중 */
export function describeActivity(p: TeamPresence): string {
  if (p.doing) return p.doing;
  if (!p.page) return "접속 중";
  const section = pageSection(p.page);
  // 문서·프로젝트 상세 화면은 탭 제목이 문서·프로젝트 이름
  const named = (fallback: string) => (p.title && p.title !== fallback ? `「${p.title}」` : fallback);
  switch (section) {
    case "dashboard":
      return "대시보드 보는 중";
    case "tasks":
      return p.typing ? "태스크 작성 중" : "태스크 보드 보는 중";
    case "projects":
      return "프로젝트 목록 보는 중";
    case "project":
      return p.typing ? `${named("프로젝트")}에서 작성 중` : `${named("프로젝트")} 보는 중`;
    case "project-new":
      return "새 프로젝트 만드는 중";
    case "project-edit":
      return "프로젝트 정보 수정 중";
    case "documents":
      return "문서 목록 보는 중";
    case "document":
      return `${named("문서")}${p.section ? ` › ${p.section}` : ""} ${p.typing ? "편집 중" : "보는 중"}`;
    case "document-new":
      return p.typing ? "새 문서 작성 중" : "새 문서 만드는 중";
    case "schedule":
      return p.typing ? "일정 등록 중" : "일정 보는 중";
    case "team":
      return "팀 화면 보는 중";
    default:
      return "접속 중";
  }
}

/**
 * 한 팀원의 탭들 중 지금 쓰는 것만: 가장 최근 신호보다 30초 넘게 뒤처진 탭은 닫혔거나(강제 종료·절전)
 * 다른 기기로 옮겨 간 것이라 뺌 — 보고 있는 탭은 20초마다 신호를 보냄
 */
export function liveTabs<T extends { seen: number }>(tabs: T[]): T[] {
  const latest = Math.max(...tabs.map((t) => t.seen));
  return tabs.filter((t) => latest - t.seen <= PULSE_MS + 10_000);
}

/** 같은 팀원이 여러 탭으로 접속한 경우 가장 의미 있는 활동 하나를 고름 */
export function pickPresence(list: TeamPresence[]): TeamPresence {
  const score = (p: TeamPresence) => (p.away ? 0 : 2) + (p.doing || p.typing ? 1 : 0);
  return list.reduce((best, p) => (score(p) > score(best) || (score(p) === score(best) && p.since > best.since) ? p : best));
}

/** 이 화면에 머문 시간. 1분 미만이면 빈 문자열 */
export function stayLabel(since: number, now: number): string {
  if (!since) return "";
  const minutes = Math.floor((now - since) / 60000);
  if (minutes < 1) return "";
  if (minutes < 60) return `${minutes}분째`;
  return `${Math.floor(minutes / 60)}시간째`;
}
