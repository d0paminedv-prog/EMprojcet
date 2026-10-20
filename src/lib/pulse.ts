import { and, eq, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { members, presence } from "@/db/schema";
import { isPositionCode } from "./links";
import { isAppPath, type PulseResult, type TeamPresence } from "./presence";

/**
 * 팀원 실시간 활동 (앱 서버 방식)
 * 열린 탭마다 20초(PULSE_MS)에 한 번 지금 상태를 보내고, 같은 응답으로 팀원 활동과 「마지막 변경 시각」을 받습니다.
 * Liveblocks 협업 분을 쓰지 않고, 쉬거나 다른 탭을 보면 신호를 멈춰 서버·DB 사용량도 아낍니다.
 */

/** 신호가 이만큼 끊기면 오프라인 (탭 강제 종료·네트워크 끊김) */
const ONLINE_SECONDS = 70;
/** 자리 비움을 알리고 신호를 멈춘 탭은 이만큼 「자리 비움」으로 보임 */
const AWAY_MINUTES = 30;

export function isTabId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(value);
}

const text = (value: unknown, max: number) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);

/** 브라우저가 보낸 상태를 정해진 형식·길이로만 저장 */
export function cleanPresence(input: unknown): TeamPresence {
  const p = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const since = typeof p.since === "number" && Number.isFinite(p.since) && p.since > 0 ? Math.round(p.since) : 0;
  return {
    page: typeof p.page === "string" && isAppPath(p.page) ? p.page : null,
    title: text(p.title, 200),
    doing: text(p.doing, 120),
    typing: p.typing === true,
    away: p.away === true,
    since,
    at: typeof p.at === "string" && isPositionCode(p.at) ? p.at : null,
    section: text(p.section, 200),
  };
}

/** 내 탭 상태 저장 → 접속 중인 팀원 탭 목록 + 다른 탭이 데이터를 마지막으로 바꾼 시각 */
export async function pulse(memberId: string, tab: string, state: TeamPresence, changed: boolean): Promise<PulseResult> {
  await db
    .insert(presence)
    .values({ tabId: tab, memberId, state, changedAt: changed ? sql`now()` : null })
    .onConflictDoUpdate({
      target: presence.tabId,
      set: { state, updatedAt: sql`now()`, goneAt: null, ...(changed ? { changedAt: sql`now()` } : {}) },
      setWhere: eq(presence.memberId, memberId),
    });

  const [rows, [last]] = await Promise.all([
    db
      .select({ tab: presence.tabId, id: presence.memberId, state: presence.state, seen: presence.updatedAt, name: members.name, color: members.color })
      .from(presence)
      .innerJoin(members, eq(members.id, presence.memberId))
      .where(
        sql`${presence.goneAt} is null and (${presence.updatedAt} > now() - make_interval(secs => ${ONLINE_SECONDS}) or (${presence.state}->>'away' = 'true' and ${presence.updatedAt} > now() - make_interval(mins => ${AWAY_MINUTES})))`,
      ),
    db
      .select({ at: sql<Date | string | null>`max(${presence.changedAt})` })
      .from(presence)
      .where(ne(presence.tabId, tab)),
  ]);

  // 하루 지난 탭 정리 (가끔 한 번)
  if (Math.random() < 0.02) await db.delete(presence).where(lt(presence.updatedAt, sql`now() - interval '1 day'`));

  return {
    members: rows.map((r) => ({ id: r.id, name: r.name, color: r.color, tab: r.tab, seen: new Date(r.seen).getTime(), presence: cleanPresence(r.state) })),
    changedAt: last?.at ? new Date(last.at).getTime() : null,
  };
}

/** 탭을 닫음 — 바로 접속자 목록에서 빠짐 (마지막 변경 시각은 남김) */
export async function leavePulse(memberId: string, tab: string): Promise<void> {
  await db
    .update(presence)
    .set({ goneAt: sql`now()` })
    .where(and(eq(presence.tabId, tab), eq(presence.memberId, memberId)));
}
