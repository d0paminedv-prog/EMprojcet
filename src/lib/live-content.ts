import { and, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { activities, documentSnapshots, documents } from "@/db/schema";
import { logActivity } from "./activity";
import { liveSaveAllowed, soloSaveAllowed, soloSaveFields } from "./solo";
import { isUuid } from "./utils";

type Json = Record<string, unknown>;
const MAX_CONTENT_BYTES = 3_000_000;
const AUTO_SNAPSHOT_MS = 30 * 60 * 1000;
const EDIT_ACTIVITY_MS = 30 * 60 * 1000;

/**
 * 실시간 문서 본문 사본 저장 (서버 액션·창 닫을 때 저장 API·단독 편집 공용).
 * 30분마다 자동 버전도 남기고, 편집 활동은 30분에 한 번만 기록합니다.
 * solo: 단독 편집 모드 저장 — 편집 권한이 있을 때만, 실시간 문서 반영 대기로 표시.
 * 실시간 편집기 저장은 단독 편집 중이거나 반영 대기 중인 내용이 있으면 덮어쓰지 않습니다.
 */
export async function saveLiveContentFor(
  userId: string,
  documentId: string,
  input: { json: Json; text: string },
  opts: { solo?: boolean } = {},
): Promise<{ error?: string; savedAt?: string; blocked?: boolean }> {
  if (!isUuid(documentId)) return { error: "잘못된 요청입니다." };
  const serialized = JSON.stringify(input.json ?? {});
  if (serialized.length > MAX_CONTENT_BYTES) return { error: "문서가 너무 커서 사본을 저장하지 못했습니다." };
  const text = String(input.text ?? "").slice(0, 500_000);
  const now = new Date();

  const [doc] = await db
    .update(documents)
    .set({ content: input.json, contentText: text, initialHtml: null, lastEditedBy: userId, lastEditedAt: now, updatedAt: now, ...(opts.solo ? soloSaveFields() : {}) })
    .where(and(eq(documents.id, documentId), eq(documents.kind, "live"), opts.solo ? soloSaveAllowed(userId) : liveSaveAllowed()))
    .returning({ id: documents.id, title: documents.title, projectId: documents.projectId });
  if (!doc) {
    const [exists] = await db.select({ id: documents.id }).from(documents).where(and(eq(documents.id, documentId), eq(documents.kind, "live"))).limit(1);
    if (!exists) return { error: "문서를 찾을 수 없습니다." };
    return opts.solo
      ? { error: "단독 편집 권한이 끝나 저장하지 못했습니다.", blocked: true }
      : { error: "단독 편집한 내용을 반영하는 중이라 사본 저장을 잠시 멈췄습니다.", blocked: true };
  }

  // 30분마다 자동 버전 저장
  const [last] = await db
    .select({ createdAt: documentSnapshots.createdAt, contentText: documentSnapshots.contentText })
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.createdAt))
    .limit(1);
  if (text.trim() && (!last || (now.getTime() - last.createdAt.getTime() > AUTO_SNAPSHOT_MS && last.contentText !== text))) {
    await db.insert(documentSnapshots).values({ documentId, label: "자동 저장", content: input.json, contentText: text, createdBy: userId });
  }

  // 편집 활동은 30분에 한 번만 기록
  const [recent] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.targetId, documentId),
        eq(activities.actorId, userId),
        eq(activities.verb, "문서를 편집했습니다"),
        gte(activities.createdAt, new Date(now.getTime() - EDIT_ACTIVITY_MS)),
      ),
    )
    .limit(1);
  if (!recent) await logActivity({ actorId: userId, verb: "문서를 편집했습니다", targetType: "document", targetId: documentId, targetTitle: doc.title, projectId: doc.projectId });

  return { savedAt: now.toISOString() };
}
