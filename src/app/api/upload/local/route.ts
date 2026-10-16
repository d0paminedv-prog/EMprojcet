import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { saveFile, storageMode } from "@/lib/storage";

// 로컬 개발 모드 업로드 (Vercel Blob 미연결 시)
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (storageMode() !== "local") return NextResponse.json({ error: "Blob 업로드를 사용하세요." }, { status: 400 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "파일이 너무 큽니다." }, { status: 413 });

  try {
    const saved = await saveFile(Buffer.from(await file.arrayBuffer()), file.name, file.type);
    return NextResponse.json(saved);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "저장 실패" }, { status: 500 });
  }
}
