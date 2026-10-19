import { eq } from "drizzle-orm";
import { db } from "@/db";
import { assets } from "@/db/schema";
import { readFileBuffer } from "./storage";
import { imageSize, type ImageLoader } from "./tiptap-docx";

/** 문서 본문 이미지(/api/assets/<id>) 읽기 — Word·PDF 내보내기 공용 */
export const loadDocumentImage: ImageLoader = async (src) => {
  const m = src.match(/^\/api\/assets\/([0-9a-f-]{36})$/i);
  if (!m) return null;
  const [asset] = await db.select().from(assets).where(eq(assets.id, m[1])).limit(1);
  if (!asset) return null;
  const data = await readFileBuffer(asset.storage, asset.storageKey);
  if (!data) return null;
  const size = imageSize(data);
  return size ? { data, ...size } : null;
};
