import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

// 브라우저 → Vercel Blob 직접 업로드용 토큰 발급 (서버 함수 4.5MB 본문 제한 회피)
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;
  try {
    const json = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("로그인이 필요합니다.");
        if (!pathname.startsWith("documents/")) throw new Error("잘못된 업로드 경로입니다.");
        return { maximumSizeInBytes: MAX_UPLOAD_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "업로드 실패" }, { status: 400 });
  }
}
