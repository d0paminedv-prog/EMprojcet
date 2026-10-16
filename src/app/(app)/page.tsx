import Link from "next/link";
import { count, desc, inArray } from "drizzle-orm";
import { CalendarDays, CheckSquare, FileText, FolderKanban, NotebookPen, Plus } from "lucide-react";
import { db } from "@/db";
import { documents, projects } from "@/db/schema";
import { ActivityFeed, DocumentList, EventList, MeetingList } from "@/components/lists";
import { TaskList } from "@/components/task-list";
import { Badge, Card, EmptyState, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PROJECT_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { listActivities, listDocuments, listEvents, listMeetings } from "@/lib/data";
import { addDays, dDay, formatDate, formatShortDate, parseDateKey, todayKey } from "@/lib/dates";
import { memberOptions } from "@/lib/queries";

function Stat({ icon: Icon, label, value, href, color }: { icon: typeof FileText; label: string; value: number; href: string; color: string }) {
  return (
    <Link href={href} className="card flex items-center gap-3 p-4 transition hover:shadow-md">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ backgroundColor: `${color}1a`, color }}>
        <Icon className="h-5 w-5" />
      </span>
      <span>
        <span className="block text-xs text-gray-500">{label}</span>
        <span className="block text-xl font-bold text-gray-900">{value}</span>
      </span>
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayKey();
  const from = parseDateKey(today);

  const [activeProjects, [{ docCount }], upcoming, myTasks, recentDocs, recentMeetings, activity, members] = await Promise.all([
    db
      .select()
      .from(projects)
      .where(inArray(projects.status, ["planning", "preparing", "live", "wrapup"]))
      .orderBy(desc(projects.updatedAt))
      .limit(6),
    db.select({ docCount: count() }).from(documents),
    listEvents({ from, to: parseDateKey(addDays(today, 7)), limit: 12 }),
    listEvents({ onlyOpenTasks: true, memberId: user.id, limit: 10 }),
    listDocuments({ limit: 6 }),
    listMeetings({ limit: 5 }),
    listActivities({ limit: 12 }),
    memberOptions(),
  ]);
  const weekEvents = upcoming.filter((e) => e.type !== "task" || !e.done);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{formatDate(today)}</p>
          <h1 className="mt-0.5 text-xl font-bold text-gray-900 sm:text-2xl">안녕하세요, {user.name}님 👋</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/documents/new" className="btn-secondary">
            <Plus className="h-4 w-4" />
            문서
          </Link>
          <Link href={`/schedule?new=${today}`} className="btn-secondary">
            <Plus className="h-4 w-4" />
            일정
          </Link>
          <Link href="/meetings/new" className="btn-primary">
            <NotebookPen className="h-4 w-4" />
            회의록 정리
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={FolderKanban} label="진행 중 프로젝트" value={activeProjects.length} href="/projects" color="#6366f1" />
        <Stat icon={CalendarDays} label="이번 주 일정" value={weekEvents.length} href="/schedule" color="#10b981" />
        <Stat icon={CheckSquare} label="내 할 일" value={myTasks.length} href={`/schedule?member=${user.id}`} color="#f59e0b" />
        <Stat icon={FileText} label="공유 문서" value={docCount} href="/documents" color="#ec4899" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="진행 중 프로젝트" action={<TextLink href="/projects">전체 보기</TextLink>}>
            {activeProjects.length === 0 ? (
              <EmptyState
                title="진행 중인 프로젝트가 없습니다"
                action={
                  <Link href="/projects/new" className="btn-primary btn-sm">
                    새 프로젝트
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {activeProjects.map((p) => (
                  <Link key={p.id} href={`/projects/${p.id}`} className="flex gap-3 rounded-lg border border-gray-100 p-3 hover:border-gray-200 hover:bg-gray-50">
                    <span className="w-1 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-semibold text-gray-900">{p.name}</span>
                        <Badge color={optionColor(PROJECT_STATUSES, p.status)}>{optionLabel(PROJECT_STATUSES, p.status)}</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-gray-500">
                        {p.brand || "브랜드 미지정"}
                        {p.startDate && ` · ${formatShortDate(p.startDate)}${p.endDate ? ` ~ ${formatShortDate(p.endDate)}` : ""}`}
                        {p.startDate && p.startDate >= today && <b className="ml-1 text-brand-600">{dDay(p.startDate)}</b>}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card title="다가오는 7일 일정" action={<TextLink href="/schedule">캘린더</TextLink>} bodyClassName="p-2">
            <EventList events={weekEvents} members={members} emptyText="7일 내 일정이 없습니다" />
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card title="최근 문서" action={<TextLink href="/documents">문서함</TextLink>} bodyClassName="p-2">
              <DocumentList docs={recentDocs} />
            </Card>
            <Card title="최근 회의록" action={<TextLink href="/meetings">전체</TextLink>} bodyClassName="p-2">
              <MeetingList meetings={recentMeetings} />
            </Card>
          </div>
        </div>

        <div className="space-y-6">
          <Card title="내 할 일" action={<TextLink href={`/schedule?member=${user.id}`}>더보기</TextLink>} bodyClassName="p-2">
            <TaskList tasks={myTasks} />
          </Card>
          <Card title="팀 활동">
            <ActivityFeed items={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}
