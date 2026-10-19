"use server";

import { and, eq, gte, isNull, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { refreshFigmaDocs } from "@/lib/figma";
import { db } from "@/db";
import { activities, comments, documents, documentVersions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES } from "@/lib/constants";
import { convertFileDocument } from "@/lib/convert";
import { formatTime } from "@/lib/dates";
import { isEditableFile, mimeFromName } from "@/lib/mime";
import { deleteFile, isValidStorageKey } from "@/lib/storage";
import { clip, isPositionCode } from "@/lib/links";
import { fileExtension, isFigmaUrl, isHttpUrl, isUuid, str, type ActionState } from "@/lib/utils";

type UploadedFileInput = { fileName: string; size: number; storage: string; key: string };

function validateFile(file: UploadedFileInput): string | null {
  if (!file?.fileName || !isValidStorageKey(file.storage, file.key)) return "업로드 정보가 올바르지 않습니다.";
  if (!ALLOWED_UPLOAD_EXTENSIONS.includes(fileExtension(file.fileName))) return "지원하지 않는 파일 형식입니다.";
  return null;
}

function cleanCategory(value: string): string {
  return DOC_CATEGORIES.some((c) => c.value === value) ? value : "etc";
}

export async function createFileDocument(input: {
  title: string;
  projectId: string;
  category: string;
  description: string;
  file: UploadedFileInput;
  /** Word·텍스트 파일을 바로 실시간 문서로 바꿈 (원본은 버전 기록에 보관) */
  editable?: boolean;
}): Promise<{ error?: string; id?: string; warning?: string }> {
  const user = await requireUser();
  const fileError = validateFile(input.file);
  if (fileError) return { error: fileError };
  const title = input.title.trim() || input.file.fileName.replace(/\.[^.]+$/, "");
  const projectId = isUuid(input.projectId) ? input.projectId : null;

  const doc = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        title,
        kind: "file",
        category: cleanCategory(input.category),
        description: input.description.trim(),
        projectId,
        createdBy: user.id,
      })
      .returning();
    await tx.insert(documentVersions).values({
      documentId: doc.id,
      version: 1,
      fileName: input.file.fileName,
      mimeType: mimeFromName(input.file.fileName),
      size: Math.max(0, Math.floor(input.file.size)),
      storage: input.file.storage,
      storageKey: input.file.key,
      note: "최초 업로드",
      uploadedBy: user.id,
    });
    return doc;
  });

  let warning: string | undefined;
  let verb = "문서를 올렸습니다";
  if (input.editable && isEditableFile(input.file.fileName)) {
    const converted = await convertFileDocument(doc.id, user.id);
    if (converted.error) warning = `${converted.error} 파일 미리보기로 등록했습니다.`;
    else verb = "문서를 올려 편집 문서로 열었습니다";
  }

  await logActivity({ actorId: user.id, verb, targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId });
  revalidatePath("/", "layout");
  return { id: doc.id, warning };
}

export async function createLinkDocument(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const kind = str(form, "kind") === "figma" ? "figma" : "link";
  const url = str(form, "url");
  if (kind === "figma" && !isFigmaUrl(url)) return { error: "Figma 공유 링크(https://www.figma.com/...)를 입력하세요." };
  if (kind === "link" && !isHttpUrl(url)) return { error: "올바른 URL을 입력하세요." };
  const title = str(form, "title");
  if (!title) return { error: "제목을 입력하세요." };
  const projectId = str(form, "projectId");

  const [doc] = await db
    .insert(documents)
    .values({
      title,
      kind,
      url,
      category: cleanCategory(str(form, "category")),
      description: str(form, "description"),
      projectId: isUuid(projectId) ? projectId : null,
      createdBy: user.id,
    })
    .returning();
  await logActivity({
    actorId: user.id,
    verb: kind === "figma" ? "Figma 디자인을 공유했습니다" : "링크를 공유했습니다",
    targetType: "document",
    targetId: doc.id,
    targetTitle: doc.title,
    projectId: doc.projectId,
  });
  if (kind === "figma") after(() => refreshFigmaDocs([{ id: doc.id, url: doc.url, figmaMeta: null }]));
  revalidatePath("/", "layout");
  redirect(`/documents/${doc.id}`);
}

export async function addDocumentVersion(input: {
  documentId: string;
  note: string;
  file: UploadedFileInput;
}): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(input.documentId)) return { error: "잘못된 요청입니다." };
  const fileError = validateFile(input.file);
  if (fileError) return { error: fileError };

  const [doc] = await db.select().from(documents).where(eq(documents.id, input.documentId)).limit(1);
  if (!doc || doc.kind !== "file") return { error: "문서를 찾을 수 없습니다." };

  await db.transaction(async (tx) => {
    const [{ current }] = await tx
      .select({ current: max(documentVersions.version) })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, doc.id));
    await tx.insert(documentVersions).values({
      documentId: doc.id,
      version: (current ?? 0) + 1,
      fileName: input.file.fileName,
      mimeType: mimeFromName(input.file.fileName),
      size: Math.max(0, Math.floor(input.file.size)),
      storage: input.file.storage,
      storageKey: input.file.key,
      note: input.note.trim(),
      uploadedBy: user.id,
    });
    await tx.update(documents).set({ updatedAt: new Date() }).where(eq(documents.id, doc.id));
  });

  await logActivity({ actorId: user.id, verb: "문서의 새 버전을 올렸습니다", targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId: doc.projectId });
  revalidatePath("/", "layout");
  return {};
}

export async function updateDocument(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  // 제목은 문서 위쪽에서 바로 고치므로 이 폼에 없으면 그대로 둠
  const title = form.has("title") ? str(form, "title") : doc.title;
  if (!title) return { error: "제목을 입력하세요." };
  const url = str(form, "url");
  if (doc.kind === "figma" && !isFigmaUrl(url)) return { error: "Figma 공유 링크를 입력하세요." };
  if (doc.kind === "link" && !isHttpUrl(url)) return { error: "올바른 URL을 입력하세요." };
  const projectId = str(form, "projectId");

  await db
    .update(documents)
    .set({
      title,
      category: cleanCategory(str(form, "category")),
      description: str(form, "description"),
      projectId: isUuid(projectId) ? projectId : null,
      url: doc.kind === "figma" || doc.kind === "link" ? url : null,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, id));
  await logEditOnce(user.id, id, "문서 정보를 수정했습니다", title, isUuid(projectId) ? projectId : null);
  revalidatePath("/", "layout");
  return { ok: true, message: `자동 저장됨 · ${formatTime(new Date())}` };
}

/** 같은 팀원이 같은 문서를 연달아 고칠 때 활동은 10분에 한 번만 기록 (자동 저장으로 기록이 넘치지 않도록) */
async function logEditOnce(actorId: string, documentId: string, verb: string, title: string, projectId: string | null) {
  const [recent] = await db
    .select({ id: activities.id })
    .from(activities)
    .where(and(eq(activities.targetId, documentId), eq(activities.actorId, actorId), eq(activities.verb, verb), gte(activities.createdAt, new Date(Date.now() - 10 * 60 * 1000))))
    .limit(1);
  if (!recent) await logActivity({ actorId, verb, targetType: "document", targetId: documentId, targetTitle: title, projectId });
}

/** 문서 제목 바로 고치기 (입력하면 자동 저장) */
export async function renameDocument(id: string, rawTitle: string): Promise<{ error?: string; title?: string }> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const title = String(rawTitle ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!title) return { error: "제목을 입력하세요." };
  const [doc] = await db.update(documents).set({ title, updatedAt: new Date() }).where(eq(documents.id, id)).returning({ projectId: documents.projectId });
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  await logEditOnce(user.id, id, "문서 제목을 바꿨습니다", title, doc.projectId);
  revalidatePath("/", "layout");
  return { title };
}

export async function deleteDocument(id: string) {
  await requireUser();
  if (!isUuid(id)) return;
  const versions = await db
    .select({ storage: documentVersions.storage, key: documentVersions.storageKey })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id));
  await db.delete(documents).where(eq(documents.id, id));
  await Promise.all(versions.map((v) => deleteFile(v.storage, v.key)));
  revalidatePath("/", "layout");
  redirect("/documents");
}

const MAX_COMMENT_LENGTH = 5000;

/**
 * 코멘트 등록 — 문서 전체 의견, 실시간 문서 안 위치 코멘트(anchor), 답글(parentId)
 */
export async function postComment(input: {
  documentId: string;
  body: string;
  anchor?: string | null;
  quote?: string | null;
  parentId?: string | null;
}): Promise<{ error?: string; id?: string }> {
  const user = await requireUser();
  const body = String(input.body ?? "").trim().slice(0, MAX_COMMENT_LENGTH);
  if (!body) return { error: "내용을 입력하세요." };
  if (!isUuid(input.documentId)) return { error: "잘못된 요청입니다." };
  const [doc] = await db
    .select({ title: documents.title, projectId: documents.projectId, kind: documents.kind })
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .limit(1);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };

  let parentId: string | null = null;
  if (input.parentId) {
    if (!isUuid(input.parentId)) return { error: "잘못된 요청입니다." };
    const [parent] = await db
      .select({ id: comments.id, documentId: comments.documentId, parentId: comments.parentId })
      .from(comments)
      .where(eq(comments.id, input.parentId))
      .limit(1);
    if (!parent || parent.documentId !== input.documentId) return { error: "원 코멘트를 찾을 수 없습니다." };
    parentId = parent.parentId ?? parent.id; // 답글에 단 답글도 같은 스레드로
  }
  const anchor = !parentId && doc.kind === "live" && isPositionCode(input.anchor) ? input.anchor : null;
  const quote = anchor ? clip(String(input.quote ?? ""), 120) || null : null;

  const [row] = await db
    .insert(comments)
    .values({ documentId: input.documentId, authorId: user.id, body, parentId, anchor, quote })
    .returning({ id: comments.id });
  await logActivity({
    actorId: user.id,
    verb: parentId ? "코멘트에 답글을 남겼습니다" : anchor ? "문서에 위치 코멘트를 남겼습니다" : "문서에 의견을 남겼습니다",
    targetType: "comment",
    targetId: input.documentId,
    targetTitle: doc.title,
    projectId: doc.projectId,
  });
  revalidatePath(`/documents/${input.documentId}`);
  return { id: row.id };
}

/** 코멘트 해결 / 다시 열기 (원 코멘트만) */
export async function setCommentResolved(commentId: string, resolved: boolean): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(commentId)) return { error: "잘못된 요청입니다." };
  const [row] = await db
    .update(comments)
    .set(resolved ? { resolvedAt: new Date(), resolvedBy: user.id } : { resolvedAt: null, resolvedBy: null })
    .where(and(eq(comments.id, commentId), isNull(comments.parentId)))
    .returning({ documentId: comments.documentId });
  if (!row) return { error: "코멘트를 찾을 수 없습니다." };
  if (resolved) {
    const [doc] = await db.select({ title: documents.title, projectId: documents.projectId }).from(documents).where(eq(documents.id, row.documentId)).limit(1);
    if (doc) await logActivity({ actorId: user.id, verb: "코멘트를 해결했습니다", targetType: "comment", targetId: row.documentId, targetTitle: doc.title, projectId: doc.projectId });
  }
  revalidatePath(`/documents/${row.documentId}`);
  return {};
}

export async function deleteComment(commentId: string) {
  const user = await requireUser();
  if (!isUuid(commentId)) return;
  const [row] = await db
    .delete(comments)
    .where(and(eq(comments.id, commentId), eq(comments.authorId, user.id)))
    .returning({ documentId: comments.documentId });
  if (row) revalidatePath(`/documents/${row.documentId}`);
}

