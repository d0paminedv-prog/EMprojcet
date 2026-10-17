import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { del, get, put } from "@vercel/blob";
import type { StorageClientConfig } from "./upload-client";
import { fileExtension } from "./utils";

/**
 * 파일 저장소
 * - Vercel 배포: Vercel Blob (BLOB_STORE_ID 또는 BLOB_READ_WRITE_TOKEN 이 있으면 자동 사용)
 * - 로컬 개발: .data/uploads 폴더
 */
export type StorageMode = "blob" | "local";

/**
 * Vercel Blob 인증 방식
 * - token: BLOB_READ_WRITE_TOKEN (예전 방식)
 * - oidc : BLOB_STORE_ID + Vercel 자동 인증(OIDC) — 2026년 6월 이후 Blob 을 연결하면 기본값
 */
export function blobAuthKind(): "token" | "oidc" | null {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "token";
  if (process.env.BLOB_STORE_ID) return "oidc";
  return null;
}

export function storageMode(): StorageMode {
  return blobAuthKind() ? "blob" : "local";
}

/** 업무 문서이므로 기본은 비공개(private) Blob. 공개 스토어를 쓰는 경우 BLOB_ACCESS=public */
export function blobAccess(): "private" | "public" {
  return process.env.BLOB_ACCESS === "public" ? "public" : "private";
}

export function storageReady(): boolean {
  return storageMode() === "blob" || !process.env.VERCEL;
}

/** 브라우저 업로드 컴포넌트에 넘길 설정 */
export function storageClientConfig(): StorageClientConfig {
  return { mode: storageMode(), access: blobAccess(), ready: storageReady(), flow: blobAuthKind() === "token" ? "token" : "presigned" };
}

const LOCAL_DIR = path.join(process.cwd(), ".data", "uploads");

export function isValidStorageKey(storage: string, key: string): boolean {
  if (storage === "local") return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,200}$/.test(key);
  if (storage === "blob") {
    try {
      const u = new URL(key);
      return u.protocol === "https:" && u.hostname.endsWith(".blob.vercel-storage.com");
    } catch {
      return false;
    }
  }
  return false;
}

function safeLocalKey(fileName: string): string {
  const ext = fileExtension(fileName).replace(/[^a-z0-9]/g, "");
  return `${Date.now()}-${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;
}

/** 서버에서 직접 파일 저장 (로컬 업로드 또는 서버 생성 파일) */
export async function saveFile(
  data: Buffer,
  fileName: string,
  contentType: string,
): Promise<{ storage: StorageMode; key: string }> {
  if (storageMode() === "blob") {
    const ext = fileExtension(fileName).replace(/[^a-z0-9]/g, "");
    const blob = await put(`documents/${Date.now()}${ext ? `.${ext}` : ""}`, data, {
      access: blobAccess(),
      addRandomSuffix: true,
      contentType,
    });
    return { storage: "blob", key: blob.url };
  }
  if (process.env.VERCEL) {
    throw new Error("Vercel Blob 스토어가 연결되지 않았습니다. Storage 탭에서 Blob을 연결하세요.");
  }
  await mkdir(LOCAL_DIR, { recursive: true });
  const key = safeLocalKey(fileName);
  await writeFile(path.join(LOCAL_DIR, key), data);
  return { storage: "local", key };
}

export type StoredFile = { stream: ReadableStream<Uint8Array>; size: number | null };

export async function openFile(storage: string, key: string): Promise<StoredFile | null> {
  if (!isValidStorageKey(storage, key)) return null;
  if (storage === "blob") {
    const result = await get(key, { access: blobAccess() });
    if (!result || result.statusCode !== 200) return null;
    return { stream: result.stream, size: result.blob.size };
  }
  const filePath = path.join(LOCAL_DIR, key);
  try {
    const info = await stat(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream<Uint8Array>;
    return { stream, size: info.size };
  } catch {
    return null;
  }
}

export async function readFileBuffer(storage: string, key: string): Promise<Buffer | null> {
  if (!isValidStorageKey(storage, key)) return null;
  if (storage === "local") {
    try {
      return await readFile(path.join(LOCAL_DIR, key));
    } catch {
      return null;
    }
  }
  const file = await openFile(storage, key);
  if (!file) return null;
  return Buffer.from(await new Response(file.stream).arrayBuffer());
}

export async function deleteFile(storage: string, key: string): Promise<void> {
  if (!isValidStorageKey(storage, key)) return;
  try {
    if (storage === "blob") await del(key);
    else await unlink(path.join(LOCAL_DIR, key));
  } catch (err) {
    console.warn("파일 삭제 실패:", err);
  }
}
