import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isInlineSafe, mimeFromName } from "@/lib/mime";
import { openFile } from "@/lib/storage";
import { isUuid } from "@/lib/utils";

/** 문서 본문 이미지 등 첨부 파일 (입장한 팀원만) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  if (!asset) return NextResponse.json({ error: "없음" }, { status: 404 });
  const file = await openFile(asset.storage, asset.storageKey);
  if (!file) return NextResponse.json({ error: "저장소에서 찾을 수 없습니다." }, { status: 404 });
  const encoded = encodeURIComponent(asset.fileName);
  const headers = new Headers({
    "Content-Type": mimeFromName(asset.fileName),
    "Content-Disposition": `${isInlineSafe(asset.fileName) ? "inline" : "attachment"}; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, max-age=86400, immutable",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size != null) headers.set("Content-Length", String(file.size));
  return new Response(file.stream, { headers });
}
