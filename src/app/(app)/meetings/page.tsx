import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { MeetingList } from "@/components/lists";
import { Card, PageHeader } from "@/components/ui";
import { listMeetings } from "@/lib/data";
import { projectOptions } from "@/lib/queries";
import { isUuid } from "@/lib/utils";

export const metadata: Metadata = { title: "회의록" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ project?: string; q?: string }> }) {
  const sp = await searchParams;
  const projectId = isUuid(sp.project) ? sp.project : undefined;
  const q = sp.q?.trim().slice(0, 100) || undefined;
  const [rows, projects] = await Promise.all([listMeetings({ projectId, q }), projectOptions()]);

  return (
    <div>
      <PageHeader
        title="회의록"
        description="회의 메모 → AI 요약 → Word 회의록 · 액션 아이템 일정 등록"
        actions={
          <Link href={`/meetings/new${projectId ? `?project=${projectId}` : ""}`} className="btn-primary">
            <Plus className="h-4 w-4" />새 회의록
          </Link>
        }
      />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-[1fr_220px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="제목·회의 내용 검색" />
        </div>
        <select name="project" defaultValue={projectId ?? ""} className="input">
          <option value="">모든 프로젝트</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-secondary">
          검색
        </button>
      </form>
      <Card bodyClassName="p-2">
        <MeetingList meetings={rows} />
      </Card>
    </div>
  );
}
