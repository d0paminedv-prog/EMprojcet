import { and, eq, gt, isNotNull, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { documents, members, presence } from "@/db/schema";
import { SOLO_MARK } from "./presence";
import { markChanged } from "./pulse";
import { isUuid } from "./utils";

/**
 * 단독 편집 모드 — Liveblocks(실시간 동시 편집)에 연결할 수 없을 때(무료 사용량 초과·장애·미설정)
 * 앱 DB 의 본문 사본을 한 번에 한 명만 편집합니다.
 *
 * - 편집 권한(임대): 90초짜리, 편집하는 동안 30초마다 연장. 창을 닫으면 바로 반납
 * - 같은 문서를 실시간 편집기로 보고 있는 팀원이 있으면 내용이 갈라지지 않도록 단독 편집을 막음
 * - 단독 편집한 내용은 solo_edited_at 으로 표시해 두었다가, 다음에 실시간으로 연 사람 화면에서 한 번만 실시간 문서에 반영
 *   (그 전까지는 실시간 편집기의 사본 저장이 이 내용을 덮어쓰지 않음)
 */

export const SOLO_LEASE_SECONDS = 90;

type Json = Record<string, unknown>;

export type SoloLock = { by: string; name: string; until: string } | null;

export type SoloState = {
  json: Json | null;
  /** 아직 한 번도 열지 않은 새 문서의 첫 내용 (템플릿·Word 불러오기) */
  html: string | null;
  lastEditedAt: string | null;
  lock: SoloLock;
};

export type AcquireResult = SoloState & ({ ok: true } | { ok: false; reason: "locked" | "live"; names: string[] });

const leaseFree = () => or(isNull(documents.soloBy), lt(documents.soloUntil, sql`now()`));

async function readState(documentId: string): Promise<SoloState | null> {
  const [row] = await db
    .select({
      json: documents.content,
      html: documents.initialHtml,
      lastEditedAt: documents.lastEditedAt,
      soloBy: documents.soloBy,
      soloUntil: documents.soloUntil,
      lockName: members.name,
      locked: sql<boolean>`(${documents.soloBy} is not null and ${documents.soloUntil} > now())`,
    })
    .from(documents)
    .leftJoin(members, eq(members.id, documents.soloBy))
    .where(and(eq(documents.id, documentId), eq(documents.kind, "live")))
    .limit(1);
  if (!row) return null;
  return {
    json: row.json ?? null,
    html: row.json ? null : row.html,
    lastEditedAt: row.lastEditedAt?.toISOString() ?? null,
    lock: row.locked && row.soloBy && row.soloUntil ? { by: row.soloBy, name: row.lockName ?? "다른 팀원", until: row.soloUntil.toISOString() } : null,
  };
}

/** 지금 이 문서를 실시간 편집기로 보고 있는 다른 팀원 (팀원 활동 신호 기준) */
async function liveViewers(userId: string, documentId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: members.name })
    .from(presence)
    .innerJoin(members, eq(members.id, presence.memberId))
    .where(
      and(
        ne(presence.memberId, userId),
        isNull(presence.goneAt),
        sql`${presence.updatedAt} > now() - interval '70 seconds'`,
        sql`${presence.state}->>'page' = ${`/documents/${documentId}`}`,
        sql`coalesce(${presence.state}->>'away', 'false') <> 'true'`,
        sql`position(${SOLO_MARK} in coalesce(${presence.state}->>'doing', '')) = 0`,
      ),
    );
  return rows.map((r) => r.name);
}

/** 단독 편집 상태와 서버 사본 (보기만 하는 팀원이 15초마다 확인) */
export async function soloState(documentId: string): Promise<SoloState | null> {
  if (!isUuid(documentId)) return null;
  return readState(documentId);
}

/** 편집 권한 받기·연장 (이미 내 것이면 연장) */
export async function acquireSolo(userId: string, documentId: string): Promise<AcquireResult | null> {
  if (!isUuid(documentId)) return null;
  const [mine] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.soloBy, userId), gt(documents.soloUntil, sql`now()`)))
    .limit(1);
  if (!mine) {
    const viewers = await liveViewers(userId, documentId);
    if (viewers.length) {
      const state = await readState(documentId);
      return state && { ...state, ok: false, reason: "live", names: viewers };
    }
  }
  const [taken] = await db
    .update(documents)
    .set({ soloBy: userId, soloUntil: sql`now() + make_interval(secs => ${SOLO_LEASE_SECONDS})` })
    .where(and(eq(documents.id, documentId), eq(documents.kind, "live"), or(leaseFree(), eq(documents.soloBy, userId))))
    .returning({ id: documents.id });
  // 새로 편집을 시작하면 이 문서를 보던 팀원 화면이 「단독 편집 중」으로 바뀌도록
  if (taken && !mine) await markChanged(userId);
  const state = await readState(documentId);
  if (!state) return null;
  if (taken) return { ...state, ok: true };
  return { ...state, ok: false, reason: "locked", names: [state.lock?.name ?? "다른 팀원"] };
}

/** 편집 권한 반납 */
export async function releaseSolo(userId: string, documentId: string): Promise<void> {
  if (!isUuid(documentId)) return;
  const released = await db
    .update(documents)
    .set({ soloBy: null, soloUntil: null })
    .where(and(eq(documents.id, documentId), eq(documents.soloBy, userId)))
    .returning({ id: documents.id });
  // 기다리던 팀원(보기만·실시간 편집기) 화면이 바로 이어서 편집·반영하도록
  if (released.length) await markChanged(userId);
}

/**
 * 실시간으로 다시 연 사람이 단독 편집 내용을 가져감 (한 명만 성공).
 * 아직 누가 단독 편집 중이면 기다림(null)
 */
export async function claimSoloEdits(documentId: string): Promise<Json | null> {
  if (!isUuid(documentId)) return null;
  const [row] = await db
    .update(documents)
    .set({ soloEditedAt: null, soloBy: null, soloUntil: null })
    .where(and(eq(documents.id, documentId), isNotNull(documents.soloEditedAt), leaseFree()))
    .returning({ json: documents.content });
  return row?.json ?? null;
}

/** 실시간 편집기의 사본 저장 조건: 단독 편집 중이거나 반영 대기 중인 내용이 있으면 덮어쓰지 않음 */
export function liveSaveAllowed() {
  return and(isNull(documents.soloEditedAt), leaseFree());
}

/** 단독 편집 저장 조건: 내가 편집 권한을 가지고 있음 */
export function soloSaveAllowed(userId: string) {
  return and(eq(documents.soloBy, userId), gt(documents.soloUntil, sql`now()`));
}

export const soloSaveFields = () => ({ soloEditedAt: sql`now()`, soloUntil: sql`now() + make_interval(secs => ${SOLO_LEASE_SECONDS})` });

/** 문서 화면에 넘길 단독 편집 상태 */
export async function soloInfoOf(doc: { soloBy: string | null; soloUntil: Date | null; soloEditedAt: Date | null }): Promise<{ lock: SoloLock; pending: boolean }> {
  const pending = !!doc.soloEditedAt;
  if (!doc.soloBy || !doc.soloUntil || doc.soloUntil.getTime() <= Date.now()) return { lock: null, pending };
  const [holder] = await db.select({ name: members.name }).from(members).where(eq(members.id, doc.soloBy)).limit(1);
  return { lock: { by: doc.soloBy, name: holder?.name ?? "다른 팀원", until: doc.soloUntil.toISOString() }, pending };
}
