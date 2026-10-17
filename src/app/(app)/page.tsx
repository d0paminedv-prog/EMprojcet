import Link from "next/link";
import { desc, inArray } from "drizzle-orm";
import { CalendarDays, FilePlus2, ListPlus, Plus } from "lucide-react";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { ActivityFeed, DocumentList, EventList } from "@/components/lists";
import { OnlineDot } from "@/components/realtime";
import { TaskList } from "@/components/task-list";
import { Avatar, Badge, Card, EmptyState, TextLink } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { PROJECT_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { listActivities, listDocuments, listEvents, listTasks, projectProgress, type TaskRow } from "@/lib/data";
import { addDays, dDay, daysAgo, formatDate, formatShortDate, parseDateKey, todayKey } from "@/lib/dates";
import { memberOptions } from "@/lib/queries";
import { DUE_TONE_CLASS, dueInfo, isOverdue, shortDue } from "@/lib/task-utils";
import { cn } from "@/lib/utils";

function MemberCard({
  member,
  tasks,
  isMe,
}: {
  member: { id: string; name: string; color: string; role: string };
  tasks: TaskRow[];
  isMe: boolean;
}) {
  const today = todayKey();
  const weekAgo = daysAgo(7).getTime();
  const open = tasks.filter((t) => t.status !== "done");
  const doing = open.filter((t) => t.status === "doing" || t.status === "review");
  const overdue = open.filter((t) => isOverdue(t.dueDate, t.status));
  const dueToday = open.filter((t) => t.dueDate === today);
  const doneWeek = tasks.filter((t) => t.status === "done" && t.completedAt && t.completedAt.getTime() >= weekAgo);
  const next = [...open].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")).slice(0, 3);

  return (
    <Link
      href="/tasks"
      className={cn("card flex flex-col p-4 transition hover:shadow-md", isMe && "ring-2 ring-brand-100")}
      data-testid="member-card"
    >
      <div className="flex items-center gap-2.5">
        <span className="relative">
          <Avatar name={member.name} color={member.color} />
          <OnlineDot memberId={member.id} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">
            {member.name}
            {isMe && <span className="ml-1 text-xs font-normal text-brand-600">(나)</span>}
          </p>
          <p className="truncate text-xs text-gray-500">{member.role || "역할 미입력"}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-1 text-center">
        {[
          { label: "할 일", value: open.length, cls: "text-gray-900" },
          { label: "진행", value: doing.length, cls: "text-blue-600" },
          { label: "지연", value: overdue.length, cls: overdue.length ? "text-red-600" : "text-gray-300" },
          { label: "주간 완료", value: doneWeek.length, cls: "text-emerald-600" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg bg-gray-50 py-1.5">
            <p className={cn("text-base font-bold", s.cls)}>{s.value}</p>
            <p className="text-[10px] text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>
      <ul className="mt-3 space-y-1.5">
        {next.map((t) => {
          const due = dueInfo(t.dueDate);
          return (
            <li key={t.id} className="flex items-center gap-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate text-gray-700">{t.title}</span>
              <span className={cn("badge shrink-0 px-1.5", DUE_TONE_CLASS[due.tone])}>{shortDue(t.dueDate)}</span>
            </li>
          );
        })}
        {next.length === 0 && <li className="text-xs text-gray-400">남은 태스크 없음</li>}
      </ul>
      {dueToday.length > 0 && <p className="mt-2 text-[11px] font-medium text-orange-600">오늘 마감 {dueToday.length}건</p>}
    </Link>
  );
}

export default async function DashboardPage() {
  const user = await requireUser();
  const today = todayKey();
  const twoWeeksAgo = daysAgo(14);

  const [members, allTasks, activeProjects, progress, upcoming, recentDocs, activity] = await Promise.all([
    memberOptions(),
    listTasks({ doneSince: twoWeeksAgo }),
    db
      .select()
      .from(projects)
      .where(inArray(projects.status, ["planning", "preparing", "live", "wrapup"]))
      .orderBy(desc(projects.updatedAt))
      .limit(6),
    projectProgress(),
    listEvents({ from: parseDateKey(today), to: parseDateKey(addDays(today, 7)), limit: 10 }),
    listDocuments({ limit: 6 }),
    listActivities({ limit: 12 }),
  ]);

  const myOpen = allTasks.filter((t) => t.assigneeId === user.id && t.status !== "done");
  const unassigned = allTasks.filter((t) => !t.assigneeId && t.status !== "done");
  const ordered = [...members.filter((m) => m.id === user.id), ...members.filter((m) => m.id !== user.id)];

  return (
    <div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500">{formatDate(today)}</p>
          <h1 className="mt-0.5 text-xl font-bold text-gray-900 sm:text-2xl">안녕하세요, {user.name}님 👋</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/documents/new" className="btn-secondary">
            <FilePlus2 className="h-4 w-4" />
            문서 만들기
          </Link>
          <Link href={`/schedule?new=${today}`} className="btn-secondary">
            <CalendarDays className="h-4 w-4" />
            일정
          </Link>
          <Link href="/tasks?new=1" className="btn-primary">
            <ListPlus className="h-4 w-4" />
            태스크 추가
          </Link>
        </div>
      </div>

      <section className="mb-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">팀 현황</h2>
          <div className="flex items-center gap-3">
            {unassigned.length > 0 && (
              <Link href="/tasks" className="text-xs font-medium text-amber-600">
                미배정 {unassigned.length}건
              </Link>
            )}
            <TextLink href="/tasks">태스크 보드</TextLink>
          </div>
        </div>
        {members.length === 0 ? (
          <EmptyState title="팀원이 없습니다" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {ordered.map((m) => (
              <MemberCard key={m.id} member={m} tasks={allTasks.filter((t) => t.assigneeId === m.id)} isMe={m.id === user.id} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="프로젝트 진행률" action={<TextLink href="/projects">전체 보기</TextLink>}>
            {activeProjects.length === 0 ? (
              <EmptyState
                title="진행 중인 프로젝트가 없습니다"
                action={
                  <Link href="/projects/new" className="btn-primary btn-sm">
                    <Plus className="h-3.5 w-3.5" />새 프로젝트
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-4">
                {activeProjects.map((p) => {
                  const pr = progress.get(p.id) ?? { total: 0, done: 0 };
                  const pct = pr.total ? Math.round((pr.done / pr.total) * 100) : 0;
                  return (
                    <li key={p.id}>
                      <Link href={`/projects/${p.id}`} className="block rounded-lg hover:bg-gray-50">
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                            <span className="truncate text-sm font-medium text-gray-900">{p.name}</span>
                            <Badge color={optionColor(PROJECT_STATUSES, p.status)}>{optionLabel(PROJECT_STATUSES, p.status)}</Badge>
                          </span>
                          <span className="shrink-0 text-xs text-gray-500">
                            {p.startDate && `${formatShortDate(p.startDate)} `}
                            {p.startDate && p.startDate >= today && <b className="text-brand-600">{dDay(p.startDate)}</b>}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100">
                            <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: p.color }} />
                          </div>
                          <span className="w-24 text-right text-xs text-gray-500">
                            {pct}% · {pr.done}/{pr.total}
                          </span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="다가오는 7일 일정" action={<TextLink href="/schedule">캘린더</TextLink>} bodyClassName="p-2">
            <EventList events={upcoming} members={members} emptyText="7일 내 일정이 없습니다" />
          </Card>

          <Card title="최근 문서" action={<TextLink href="/documents">문서</TextLink>} bodyClassName="p-2">
            <DocumentList docs={recentDocs} />
          </Card>
        </div>

        <div className="space-y-6">
          <Card title={`내 태스크 (${myOpen.length})`} action={<TextLink href="/tasks">보드</TextLink>} bodyClassName="p-2">
            <TaskList tasks={myOpen.slice(0, 10)} />
          </Card>
          <Card title="팀 활동">
            <ActivityFeed items={activity} />
          </Card>
        </div>
      </div>
    </div>
  );
}
