import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assets, documents } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { readFileBuffer } from "@/lib/storage";
import { imageSize, tiptapToDocx, type PMNode } from "@/lib/tiptap-docx";
import { isUuid } from "@/lib/utils";

/** 실시간 문서 → Word(.docx) 다운로드 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const [doc] = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  if (!doc || doc.kind !== "live") return NextResponse.json({ error: "실시간 문서를 찾을 수 없습니다." }, { status: 404 });

  const buffer = await tiptapToDocx((doc.content as PMNode | null) ?? null, doc.title, async (src) => {
    const m = src.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
    if (!m) return null;
    const [asset] = await db.select().from(assets).where(eq(assets.id, m[1])).limit(1);
    if (!asset) return null;
    const data = await readFileBuffer(asset.storage, asset.storageKey);
    if (!data) return null;
    const size = imageSize(data);
    return size ? { data, ...size } : null;
  });

  const fileName = encodeURIComponent(`${doc.title.replace(/[\\/:*?"<>|]/g, "_")}.docx`);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
