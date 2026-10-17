import { fileExtension } from "./utils";

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
  hwp: "application/x-hwp",
  hwpx: "application/hwp+zip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  zip: "application/zip",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

/** 브라우저 안에서 바로 보여줘도 안전한 형식 (스크립트 실행 불가) */
const INLINE_SAFE = new Set(["pdf", "png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "txt", "md", "csv"]);

export function mimeFromName(name: string): string {
  return MIME[fileExtension(name)] ?? "application/octet-stream";
}

export function isInlineSafe(name: string): boolean {
  return INLINE_SAFE.has(fileExtension(name));
}

export type PreviewKind = "pdf" | "image" | "video" | "text" | "docx" | "none";

export function previewKind(name: string): PreviewKind {
  const ext = fileExtension(name);
  if (ext === "pdf") return "pdf";
  if (["png", "jpg", "jpeg", "gif", "webp"].includes(ext)) return "image";
  if (["mp4", "mov"].includes(ext)) return "video";
  if (["txt", "md", "csv"].includes(ext)) return "text";
  if (ext === "docx") return "docx";
  return "none";
}
