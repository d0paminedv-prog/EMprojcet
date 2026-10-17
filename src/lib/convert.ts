import { and, desc, eq } from "drizzle-orm";
import mammoth from "mammoth";
import { marked } from "marked";
import { db } from "@/db";
import { assets, documents, documentVersions, type Document } from "@/db/schema";
import { isEditableFile } from "./mime";
import { readFileBuffer, saveFile } from "./storage";
import { fileExtension } from "./utils";

/** 업로드 파일 → 실시간 문서(편집기) HTML 변환 */

const MAX_CONVERT_BYTES = 15 * 1024 * 1024;

/** 텍스트 파일 디코딩: UTF-8, 아니면 한국어 Windows 기본 인코딩(EUC-KR/CP949) */
export function decodeText(buffer: Buffer): string {
  try {
    // stream: 잘라 읽은 버퍼 끝의 끊긴 글자는 오류로 보지 않음
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer, { stream: true }).replace(/^﻿/, "");
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\n+$/, "")
    .split("\n")
    .map((line) => `<p>${escapeHtml(line.replace(/\t/g, "    ").replace(/^ +/, (m) => " ".repeat(m.length)))}</p>`)
    .join("");
}

/** Word(.docx) → HTML. 본문 이미지는 첨부(assets)로 저장 */
export async function docxToHtml(buffer: Buffer, userId: string): Promise<string> {
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: ["u => u", "strike => s"],
      convertImage: mammoth.images.imgElement(async (image) => {
        const data = await image.readAsBuffer();
        const ext = (image.contentType.split("/")[1] ?? "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "");
        const fileName = `image.${ext}`;
        const saved = await saveFile(data, fileName, image.contentType);
        const [asset] = await db
          .insert(assets)
          .values({ fileName, mimeType: image.contentType, size: data.length, storage: saved.storage, storageKey: saved.key, createdBy: userId })
          .returning({ id: assets.id });
        return { src: `/api/assets/${asset.id}` };
      }),
    },
  );
  return result.value;
}

async function fileToEditorHtml(buffer: Buffer, fileName: string, userId: string): Promise<string> {
  const ext = fileExtension(fileName);
  const html =
    ext === "docx"
      ? await docxToHtml(buffer, userId)
      : ext === "md"
        ? marked.parse(decodeText(buffer), { async: false, gfm: true })
        : textToHtml(decodeText(buffer));
  return html || "<p></p>";
}

/**
 * 업로드한 파일 문서를 실시간 문서로 바꿉니다. 문서 ID·의견·연결된 태스크는 그대로이고,
 * 원본 파일은 버전 기록에 남아 계속 내려받을 수 있습니다.
 */
export async function convertFileDocument(documentId: string, userId: string): Promise<{ error?: string; doc?: Document; converted?: boolean }> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return { error: "문서를 찾을 수 없습니다." };
  if (doc.kind === "live") return { doc, converted: false }; // 다른 팀원이 먼저 바꿈
  if (doc.kind !== "file") return { error: "업로드한 파일 문서만 편집 문서로 바꿀 수 있습니다." };

  const [latest] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, doc.id))
    .orderBy(desc(documentVersions.version))
    .limit(1);
  if (!latest) return { error: "업로드된 파일이 없습니다." };
  if (!isEditableFile(latest.fileName)) return { error: "Word(.docx)·텍스트(.txt, .md) 파일만 앱에서 편집할 수 있습니다." };
  if (latest.size > MAX_CONVERT_BYTES) return { error: "파일이 15MB 를 넘어 편집 문서로 바꿀 수 없습니다." };
  const buffer = await readFileBuffer(latest.storage, latest.storageKey);
  if (!buffer) return { error: "업로드한 파일을 읽지 못했습니다." };

  let html: string;
  try {
    html = await fileToEditorHtml(buffer, latest.fileName, userId);
  } catch (err) {
    console.error("편집 문서 변환 실패:", err);
    return { error: "파일을 편집 문서로 바꾸지 못했습니다. 파일이 손상되지 않았는지 확인하세요." };
  }

  const [updated] = await db
    .update(documents)
    .set({ kind: "live", initialHtml: html, content: null, contentText: "", updatedAt: new Date() })
    .where(and(eq(documents.id, doc.id), eq(documents.kind, "file")))
    .returning();
  if (!updated) return { doc: { ...doc, kind: "live" }, converted: false };
  return { doc: updated, converted: true };
}
