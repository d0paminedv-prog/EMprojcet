import { upload } from "@vercel/blob/client";
import { fileExtension } from "./utils";

export type UploadedFile = {
  fileName: string;
  size: number;
  storage: "blob" | "local";
  key: string;
};

/** 브라우저에서 파일 업로드: Vercel Blob(직접 업로드) 또는 로컬 개발 서버 */
export async function uploadFile(
  file: File,
  mode: "blob" | "local",
  access: "private" | "public",
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> {
  if (mode === "blob") {
    const ext = fileExtension(file.name).replace(/[^a-z0-9]/g, "");
    const blob = await upload(`documents/${Date.now()}${ext ? `.${ext}` : ""}`, file, {
      access,
      handleUploadUrl: "/api/upload/blob",
      multipart: file.size > 20 * 1024 * 1024,
      onUploadProgress: (e) => onProgress?.(e.percentage),
    });
    return { fileName: file.name, size: file.size, storage: "blob", key: blob.url };
  }

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload/local", { method: "POST", body: form });
  const json = (await res.json()) as { storage?: "local"; key?: string; error?: string };
  if (!res.ok || !json.key) throw new Error(json.error ?? "업로드에 실패했습니다.");
  onProgress?.(100);
  return { fileName: file.name, size: file.size, storage: "local", key: json.key };
}
