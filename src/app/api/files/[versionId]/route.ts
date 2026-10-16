import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { documentVersions } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isInlineSafe, mimeFromName } from "@/lib/mime";
import { openFile } from "@/lib/storage";
import { isUuid } from "@/lib/utils";

// 로그인한 팀원만 파일을 열람/다운로드할 수 있도록 서버를 거쳐 전달
export async function GET(request: Request, ctx: { params: Promise<{ versionId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { versionId } = await ctx.params;
  if (!isUuid(versionId)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const [version] = await db.select().from(documentVersions).where(eq(documentVersions.id, versionId)).limit(1);
  if (!version) return NextResponse.json({ error: "파일을 찾을 수 없습니다." }, { status: 404 });

  const file = await openFile(version.storage, version.storageKey);
  if (!file) return NextResponse.json({ error: "저장소에서 파일을 찾을 수 없습니다." }, { status: 404 });

  const wantsDownload = new URL(request.url).searchParams.has("download");
  const inline = !wantsDownload && isInlineSafe(version.fileName);
  const encoded = encodeURIComponent(version.fileName);
  const headers = new Headers({
    "Content-Type": mimeFromName(version.fileName),
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${encoded}"; filename*=UTF-8''${encoded}`,
    "Cache-Control": "private, max-age=300",
    "X-Content-Type-Options": "nosniff",
  });
  if (file.size != null) headers.set("Content-Length", String(file.size));
  return new Response(file.stream, { headers });
}
