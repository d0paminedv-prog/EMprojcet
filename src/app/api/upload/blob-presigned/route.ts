import { issueSignedToken } from "@vercel/blob";
import { handleUploadPresigned, type HandleUploadPresignedBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";

/**
 * 브라우저 → Vercel Blob 직접 업로드용 서명 URL 발급 (OIDC 방식: BLOB_STORE_ID).
 * 2026년 6월 이후 Blob 을 연결하면 BLOB_READ_WRITE_TOKEN 없이 이 방식이 기본입니다.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadPresignedBody;
  // 업로드 완료 알림(callback)은 사용하지 않으므로 서명 URL 발급 요청만 처리
  if (body?.type !== "blob.generate-presigned-url") {
    return NextResponse.json({ error: "지원하지 않는 요청입니다." }, { status: 400 });
  }
  try {
    const json = await handleUploadPresigned({
      body,
      request,
      // SDK 필수 인자이지만 업로드 완료 알림을 쓰지 않아 실제로 검증에 쓰이지 않습니다.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || "unused-no-upload-callbacks",
      getSignedToken: async (pathname) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("입장이 필요합니다.");
        if (!/^documents\/[A-Za-z0-9._-]{1,200}$/.test(pathname)) throw new Error("잘못된 업로드 경로입니다.");
        const token = await issueSignedToken({
          pathname,
          operations: ["put"],
          maximumSizeInBytes: MAX_UPLOAD_BYTES,
          validUntil: Date.now() + 15 * 60 * 1000,
        });
        return { token, urlOptions: { maximumSizeInBytes: MAX_UPLOAD_BYTES } };
      },
    });
    return NextResponse.json(json);
  } catch (err) {
    console.error("Blob 업로드 URL 발급 실패:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "업로드 실패" }, { status: 400 });
  }
}
