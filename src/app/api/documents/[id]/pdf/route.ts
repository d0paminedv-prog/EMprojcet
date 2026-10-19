import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { loadDocumentImage } from "@/lib/doc-images";
import type { PMNode } from "@/lib/tiptap-docx";
import { tiptapToPdf } from "@/lib/tiptap-pdf";
import { isUuid } from "@/lib/utils";

/** 실시간 문서 → PDF 다운로드 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.kind !== "live") return NextResponse.json({ error: "실시간 문서를 찾을 수 없습니다." }, { status: 404 });

  const buffer = await tiptapToPdf((doc.content as PMNode | null) ?? null, doc.title, loadDocumentImage);

  const fileName = encodeURIComponent(`${doc.title.replace(/[\\/:*?"<>|]/g, "_")}.pdf`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
