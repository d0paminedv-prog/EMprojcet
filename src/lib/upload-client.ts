import { upload, uploadPresigned } from "@vercel/blob/client";
import { fileExtension } from "./utils";

/** 서버가 내려주는 업로드 설정 */
export type StorageClientConfig = {
  mode: "blob" | "local";
  access: "private" | "public";
  ready: boolean;
  /** token: BLOB_READ_WRITE_TOKEN 방식, presigned: OIDC(BLOB_STORE_ID) 방식 — 2026년 이후 Vercel 기본값 */
  flow: "token" | "presigned";
};

export type UploadedFile = {
  fileName: string;
  size: number;
  storage: "blob" | "local";
  key: string;
};

/** 브라우저에서 파일 업로드: Vercel Blob(직접 업로드) 또는 로컬 개발 서버 */
export async function uploadFile(
  file: File,
  storage: StorageClientConfig,
  onProgress?: (percent: number) => void,
): Promise<UploadedFile> {
  if (storage.mode === "blob") {
    const ext = fileExtension(file.name).replace(/[^a-z0-9]/g, "");
    const pathname = `documents/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${ext ? `.${ext}` : ""}`;
    const presigned = storage.flow === "presigned";
    const blob = await (presigned ? uploadPresigned : upload)(pathname, file, {
      access: storage.access,
      handleUploadUrl: presigned ? "/api/upload/blob-presigned" : "/api/upload/blob",
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
