import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documents, type Document } from "@/db/schema";
import { getCurrentUser } from "./auth";
import type { PMNode } from "./tiptap-docx";
import { isUuid } from "./utils";

/** Word·PDF 내보내기 공용 */

const MAX_CONTENT_BYTES = 3_000_000;

export type ExportSource = {
  doc: Document;
  content: PMNode | null;
  /** 이 시각 기준의 최종본 */
  finalAt: Date;
};

/**
 * 내보낼 문서와 본문.
 * POST: 편집기 화면의 최신 본문(동기화가 끝난 최종 버전)을 받아 그대로 사용
 * GET: 서버에 저장된 마지막 사본 사용 (직접 링크용)
 */
export async function exportSource(request: Request, id: string): Promise<ExportSource | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.kind !== "live") return NextResponse.json({ error: "실시간 문서를 찾을 수 없습니다." }, { status: 404 });

  if (request.method !== "POST") {
    return { doc, content: (doc.content as PMNode | null) ?? null, finalAt: doc.lastEditedAt ?? doc.updatedAt };
  }
  const raw = await request.text();
  if (raw.length > MAX_CONTENT_BYTES) return NextResponse.json({ error: "문서가 너무 커서 파일로 만들지 못했습니다." }, { status: 413 });
  let json: unknown;
  try {
    json = (JSON.parse(raw) as { json?: unknown }).json;
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!json || typeof json !== "object" || (json as PMNode).type !== "doc") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  return { doc, content: json as PMNode, finalAt: new Date() };
}

/** 내려받기 응답 (파일 이름 = 문서 제목) */
export function downloadResponse(data: Buffer, title: string, ext: "pdf" | "docx", contentType: string): Response {
  const fileName = encodeURIComponent(`${title.replace(/[\\/:*?"<>|]/g, "_")}.${ext}`);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
