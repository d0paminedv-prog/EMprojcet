import mammoth from "mammoth";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { fileExtension } from "@/lib/utils";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel 함수 요청 본문 한도(4.5MB) 이내

/** 회의 메모 파일(.docx/.txt/.md)에서 텍스트 추출 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "4MB 이하 파일만 불러올 수 있습니다." }, { status: 413 });

  const ext = fileExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (ext === "docx") {
      const { value } = await mammoth.extractRawText({ buffer });
      return NextResponse.json({ text: value.replace(/\n{3,}/g, "\n\n").trim() });
    }
    if (["txt", "md", "csv", "vtt", "srt"].includes(ext)) {
      return NextResponse.json({ text: buffer.toString("utf8").trim() });
    }
    return NextResponse.json({ error: "Word(.docx) 또는 텍스트(.txt, .md) 파일만 지원합니다. (.doc는 Word에서 .docx로 저장 후 올려 주세요)" }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "파일에서 텍스트를 읽지 못했습니다." }, { status: 400 });
  }
}
