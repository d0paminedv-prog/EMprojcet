import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { CalendarRange, MapPin, Plus } from "lucide-react";
import { db } from "@/db";
import { documents, meetings, members, projects } from "@/db/schema";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { PROJECT_CATEGORIES, PROJECT_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { dDay, formatShortDate, todayKey } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "프로젝트" };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { status } = await searchParams;
  const rows = await db
    .select({
      project: projects,
      ownerName: members.name,
      docCount: sql<number>`(select count(*)::int from ${documents} where ${documents.projectId} = ${projects.id})`,
      meetingCount: sql<number>`(select count(*)::int from ${meetings} where ${meetings.projectId} = ${projects.id})`,
    })
    .from(projects)
    .leftJoin(members, eq(members.id, projects.ownerId))
    .where(status ? eq(projects.status, status) : undefined)
    .orderBy(desc(projects.updatedAt));
  const today = todayKey();

  return (
    <div>
      <PageHeader
        title="프로젝트"
        description="진행 중인 브랜드 체험마케팅 캠페인"
        actions={
          <Link href="/projects/new" className="btn-primary">
            <Plus className="h-4 w-4" />새 프로젝트
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-1.5">
        <Link href="/projects" className={cn("badge px-3 py-1", !status ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200")}>
          전체
        </Link>
        {PROJECT_STATUSES.map((s) => (
          <Link
            key={s.value}
            href={`/projects?status=${s.value}`}
            className={cn("badge px-3 py-1", status === s.value ? "bg-gray-900 text-white" : "bg-white text-gray-600 ring-1 ring-gray-200")}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="프로젝트가 없습니다"
          description="첫 프로젝트를 만들어 문서와 일정을 모아 보세요."
          action={
            <Link href="/projects/new" className="btn-primary">
              새 프로젝트
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(({ project: p, ownerName, docCount, meetingCount }) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="h-1.5" style={{ backgroundColor: p.color }} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-gray-500">{p.brand || "브랜드 미지정"}</p>
                    <h3 className="mt-0.5 truncate font-semibold text-gray-900 group-hover:text-brand-700">{p.name}</h3>
                  </div>
                  <Badge color={optionColor(PROJECT_STATUSES, p.status)}>{optionLabel(PROJECT_STATUSES, p.status)}</Badge>
                </div>
                <p className="mt-2 line-clamp-2 min-h-10 text-sm text-gray-600">{p.description || "개요가 없습니다."}</p>
                <div className="mt-3 space-y-1 text-xs text-gray-500">
                  <p className="flex items-center gap-1.5">
                    <CalendarRange className="h-3.5 w-3.5" />
                    {p.startDate ? `${formatShortDate(p.startDate)} ~ ${p.endDate ? formatShortDate(p.endDate) : ""}` : "일정 미정"}
                    {p.startDate && p.startDate >= today && <span className="font-semibold text-brand-600">{dDay(p.startDate)}</span>}
                  </p>
                  {p.venue && (
                    <p className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      {p.venue}
                    </p>
                  )}
                </div>
                <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
                  <span>{optionLabel(PROJECT_CATEGORIES, p.category)}</span>
                  <span>
                    문서 {docCount} · 회의록 {meetingCount}
                    {ownerName && ` · PM ${ownerName}`}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
