"use server";

import { and, eq, max } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { refreshFigmaDocs } from "@/lib/figma";
import { db } from "@/db";
import { comments, documents, documentVersions } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES } from "@/lib/constants";
import { mimeFromName } from "@/lib/mime";
import { deleteFile, isValidStorageKey } from "@/lib/storage";
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
}): Promise<{ error?: string; id?: string }> {
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

  await logActivity({ actorId: user.id, verb: "문서를 올렸습니다", targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId });
  revalidatePath("/", "layout");
  return { id: doc.id };
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
  const title = str(form, "title");
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
  await logActivity({ actorId: user.id, verb: "문서 정보를 수정했습니다", targetType: "document", targetId: id, targetTitle: title, projectId: isUuid(projectId) ? projectId : null });
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했습니다." };
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

export async function addComment(documentId: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const body = str(form, "body");
  if (!body) return { error: "내용을 입력하세요." };
  if (!isUuid(documentId)) return { error: "잘못된 요청입니다." };
  const [doc] = await db.select({ title: documents.title, projectId: documents.projectId }).from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  await db.insert(comments).values({ documentId, authorId: user.id, body });
  await logActivity({ actorId: user.id, verb: "문서에 의견을 남겼습니다", targetType: "comment", targetId: documentId, targetTitle: doc.title, projectId: doc.projectId });
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
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

