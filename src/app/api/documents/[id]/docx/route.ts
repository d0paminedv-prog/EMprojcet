import { NextResponse } from "next/server";
import { loadDocumentImage } from "@/lib/doc-images";
import { downloadResponse, exportSource } from "@/lib/doc-export";
import { tiptapToDocx } from "@/lib/tiptap-docx";

/** 실시간 문서 → Word(.docx) (POST: 화면의 최종 버전, GET: 저장된 사본) */
async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const source = await exportSource(request, (await ctx.params).id);
  if (source instanceof NextResponse) return source;
  const buffer = await tiptapToDocx(source.content, source.doc.title, loadDocumentImage);
  return downloadResponse(buffer, source.doc.title, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

export const GET = handle;
export const POST = handle;
