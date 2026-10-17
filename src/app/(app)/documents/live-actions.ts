"use server";

import { and, desc, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { activities, assets, documentSnapshots, documents } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { DOC_CATEGORIES } from "@/lib/constants";
import { convertFileDocument, docxToHtml } from "@/lib/convert";
import { mimeFromName } from "@/lib/mime";
import { isValidStorageKey, readFileBuffer } from "@/lib/storage";
import { docTemplates } from "@/lib/templates";
import { fileExtension, isUuid } from "@/lib/utils";

type Json = Record<string, unknown>;
const MAX_CONTENT_BYTES = 3_000_000;
const AUTO_SNAPSHOT_MS = 30 * 60 * 1000;
const EDIT_ACTIVITY_MS = 30 * 60 * 1000;

function cleanCategory(value: string): string {
  return DOC_CATEGORIES.some((c) => c.value === value) ? value : "etc";
}

/** 새 실시간 문서 (템플릿으로 시작) */
export async function createLiveDocument(input: {
  title: string;
  projectId: string;
  category: string;
  templateId: string;
}): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const template = docTemplates().find((t) => t.id === input.templateId) ?? docTemplates()[0];
  const title = input.title.trim() || (template.id === "blank" ? "제목 없는 문서" : template.label);
  const [doc] = await db
    .insert(documents)
    .values({
      title,
      kind: "live",
      category: cleanCategory(input.category || template.category),
      projectId: isUuid(input.projectId) ? input.projectId : null,
      initialHtml: template.html,
      createdBy: user.id,
    })
    .returning();
  await logActivity({ actorId: user.id, verb: "실시간 문서를 만들었습니다", targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId: doc.projectId });
  revalidatePath("/", "layout");
  return { id: doc.id };
}

/** Word(.docx) 파일 → 실시간 문서 (이미지는 첨부로 저장) */
export async function importDocx(input: {
  projectId: string;
  category: string;
  file: { fileName: string; size: number; storage: string; key: string };
}): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  if (fileExtension(input.file.fileName) !== "docx") return { error: "Word(.docx) 파일만 불러올 수 있습니다. (.doc 은 Word에서 .docx 로 저장 후 올려 주세요)" };
  if (!isValidStorageKey(input.file.storage, input.file.key)) return { error: "업로드 정보가 올바르지 않습니다." };
  const buffer = await readFileBuffer(input.file.storage, input.file.key);
  if (!buffer) return { error: "업로드한 파일을 읽지 못했습니다." };

  let html: string;
  try {
    html = (await docxToHtml(buffer, user.id)) || "<p></p>";
  } catch (err) {
    console.error("docx 변환 실패:", err);
    return { error: "Word 파일을 변환하지 못했습니다. 파일이 손상되지 않았는지 확인하세요." };
  }

  const title = input.file.fileName.replace(/\.docx$/i, "");
  const [doc] = await db
    .insert(documents)
    .values({
      title,
      kind: "live",
      category: cleanCategory(input.category),
      projectId: isUuid(input.projectId) ? input.projectId : null,
      initialHtml: html,
      description: `Word 파일 「${input.file.fileName}」에서 가져옴`,
      createdBy: user.id,
    })
    .returning();
  await logActivity({ actorId: user.id, verb: "Word 파일을 실시간 문서로 가져왔습니다", targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId: doc.projectId });
  revalidatePath("/", "layout");
  return { id: doc.id };
}

/** 업로드한 Word·텍스트 파일 문서 → 실시간 문서 (원본 파일은 버전 기록에 보관) */
export async function makeDocumentEditable(documentId: string): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(documentId)) return { error: "잘못된 요청입니다." };
  const result = await convertFileDocument(documentId, user.id);
  if (result.error || !result.doc) return { error: result.error ?? "편집 문서로 바꾸지 못했습니다." };
  if (result.converted) {
    await logActivity({ actorId: user.id, verb: "업로드 문서를 편집 문서로 열었습니다", targetType: "document", targetId: documentId, targetTitle: result.doc.title, projectId: result.doc.projectId });
  }
  revalidatePath("/", "layout");
  return {};
}

/** 편집 내용 사본 저장 (검색·Word 내보내기·버전 기록용). 본문 원본은 Liveblocks 에 실시간 저장됨 */
export async function saveLiveContent(documentId: string, input: { json: Json; text: string }): Promise<{ error?: string; savedAt?: string }> {
  const user = await requireUser();
  if (!isUuid(documentId)) return { error: "잘못된 요청입니다." };
  const serialized = JSON.stringify(input.json ?? {});
  if (serialized.length > MAX_CONTENT_BYTES) return { error: "문서가 너무 커서 사본을 저장하지 못했습니다." };
  const text = String(input.text ?? "").slice(0, 500_000);
  const now = new Date();

  const [doc] = await db
    .update(documents)
    .set({ content: input.json, contentText: text, initialHtml: null, lastEditedBy: user.id, lastEditedAt: now, updatedAt: now })
    .where(and(eq(documents.id, documentId), eq(documents.kind, "live")))
    .returning({ id: documents.id, title: documents.title, projectId: documents.projectId });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };

  // 30분마다 자동 버전 저장
  const [last] = await db
    .select({ createdAt: documentSnapshots.createdAt, contentText: documentSnapshots.contentText })
    .from(documentSnapshots)
    .where(eq(documentSnapshots.documentId, documentId))
    .orderBy(desc(documentSnapshots.createdAt))
    .limit(1);
  if (text.trim() && (!last || (now.getTime() - last.createdAt.getTime() > AUTO_SNAPSHOT_MS && last.contentText !== text))) {
    await db.insert(documentSnapshots).values({ documentId, label: "자동 저장", content: input.json, contentText: text, createdBy: user.id });
  }

  // 편집 활동은 30분에 한 번만 기록
  const [recent] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(
      and(
        eq(activities.targetId, documentId),
        eq(activities.actorId, user.id),
        eq(activities.verb, "문서를 편집했습니다"),
        gte(activities.createdAt, new Date(now.getTime() - EDIT_ACTIVITY_MS)),
      ),
    )
    .limit(1);
  if (!recent) await logActivity({ actorId: user.id, verb: "문서를 편집했습니다", targetType: "document", targetId: documentId, targetTitle: doc.title, projectId: doc.projectId });

  return { savedAt: now.toISOString() };
}

/** 이름 붙인 버전 저장 */
export async function createSnapshot(documentId: string, input: { label: string; json: Json; text: string }): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(documentId)) return { error: "잘못된 요청입니다." };
  if (JSON.stringify(input.json ?? {}).length > MAX_CONTENT_BYTES) return { error: "문서가 너무 큽니다." };
  await db.insert(documentSnapshots).values({
    documentId,
    label: input.label.trim().slice(0, 100) || "수동 저장",
    content: input.json,
    contentText: String(input.text ?? "").slice(0, 500_000),
    createdBy: user.id,
  });
  revalidatePath(`/documents/${documentId}`);
  return {};
}

/** 버전 내용 불러오기 (복원용) */
export async function getSnapshotContent(snapshotId: string): Promise<{ error?: string; json?: Json }> {
  await requireUser();
  if (!isUuid(snapshotId)) return { error: "잘못된 요청입니다." };
  const [snap] = await db.select({ content: documentSnapshots.content }).from(documentSnapshots).where(eq(documentSnapshots.id, snapshotId)).limit(1);
  if (!snap) return { error: "버전을 찾을 수 없습니다." };
  return { json: snap.content };
}

/** 문서 본문 이미지 첨부 등록 */
export async function createAsset(file: { fileName: string; size: number; storage: string; key: string }): Promise<{ error?: string; url?: string }> {
  const user = await requireUser();
  if (!isValidStorageKey(file.storage, file.key)) return { error: "업로드 정보가 올바르지 않습니다." };
  if (!["png", "jpg", "jpeg", "gif", "webp"].includes(fileExtension(file.fileName))) return { error: "이미지(png, jpg, gif, webp)만 넣을 수 있습니다." };
  const [asset] = await db
    .insert(assets)
    .values({ fileName: file.fileName, mimeType: mimeFromName(file.fileName), size: Math.max(0, Math.floor(file.size)), storage: file.storage, storageKey: file.key, createdBy: user.id })
    .returning({ id: assets.id });
  return { url: `/api/assets/${asset.id}` };
}
