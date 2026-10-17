import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { documents, members, projects } from "@/db/schema";
import { findUrls, parseAppLink } from "./links";

export async function projectOptions() {
  return db
    .select({ id: projects.id, name: projects.name, color: projects.color, status: projects.status })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
}

export async function memberOptions() {
  return db
    .select({ id: members.id, name: members.name, color: members.color, role: members.role })
    .from(members)
    .orderBy(asc(members.createdAt), asc(members.name));
}

export type ProjectOption = Awaited<ReturnType<typeof projectOptions>>[number];
export type MemberOption = Awaited<ReturnType<typeof memberOptions>>[number];

/** 글 속 앱 문서 링크의 문서 제목 (ID → 제목) */
export async function linkedDocumentTitles(texts: string[], origin: string): Promise<Record<string, string>> {
  const ids = new Set<string>();
  for (const text of texts) {
    for (const found of findUrls(text)) {
      const link = parseAppLink(found.url, origin);
      if (link?.documentId) ids.add(link.documentId);
    }
  }
  if (!ids.size) return {};
  const rows = await db.select({ id: documents.id, title: documents.title }).from(documents).where(inArray(documents.id, [...ids]));
  return Object.fromEntries(rows.map((r) => [r.id, r.title]));
}
