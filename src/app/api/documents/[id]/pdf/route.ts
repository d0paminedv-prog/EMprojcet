import { NextResponse } from "next/server";
import { loadDocumentImage } from "@/lib/doc-images";
import { downloadResponse, exportSource } from "@/lib/doc-export";
import { tiptapToPdf } from "@/lib/tiptap-pdf";

/** 실시간 문서 → PDF (POST: 화면의 최종 버전, GET: 저장된 사본) */
async function handle(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const source = await exportSource(request, (await ctx.params).id);
  if (source instanceof NextResponse) return source;
  const buffer = await tiptapToPdf(source.content, source.doc.title, loadDocumentImage, { finalAt: source.finalAt });
  return downloadResponse(buffer, source.doc.title, "pdf", "application/pdf");
}

export const GET = handle;
export const POST = handle;
