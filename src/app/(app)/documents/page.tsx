import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { DocumentList } from "@/components/lists";
import { Card, PageHeader } from "@/components/ui";
import { DOC_CATEGORIES, DOC_KINDS } from "@/lib/constants";
import { listDocuments } from "@/lib/data";
import { projectOptions } from "@/lib/queries";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "문서" };

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string; kind?: string; category?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const projectId = isUuid(sp.project) ? sp.project : undefined;
  const kind = DOC_KINDS.some((k) => k.value === sp.kind) ? sp.kind : undefined;
  const category = DOC_CATEGORIES.some((c) => c.value === sp.category) ? sp.category : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;

  const [docs, projects] = await Promise.all([listDocuments({ projectId, kind, category, q }), projectOptions()]);

  return (
    <div>
      <PageHeader
        title="문서"
        description="함께 편집하는 실시간 문서와 기획서·디자인 시안·계약서 파일"
        actions={
          <>
            <Link href={`/documents/new?kind=file${projectId ? `&project=${projectId}` : ""}`} className="btn-secondary">
              파일 업로드
            </Link>
            <Link href={`/documents/new?kind=figma${projectId ? `&project=${projectId}` : ""}`} className="btn-secondary">
              Figma 링크
            </Link>
            <Link href={`/documents/new${projectId ? `?project=${projectId}` : ""}`} className="btn-primary">
              <Plus className="h-4 w-4" />새 실시간 문서
            </Link>
          </>
        }
      />

      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_180px_140px_150px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="제목·설명 검색" />
        </div>
        <select name="project" defaultValue={projectId ?? ""} className="input">
          <option value="">모든 프로젝트</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select name="kind" defaultValue={kind ?? ""} className="input">
          <option value="">모든 형식</option>
          {DOC_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <select name="category" defaultValue={category ?? ""} className="input">
          <option value="">모든 분류</option>
          {DOC_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>

      <Card bodyClassName="p-2">
        <DocumentList docs={docs} />
      </Card>
    </div>
  );
}
