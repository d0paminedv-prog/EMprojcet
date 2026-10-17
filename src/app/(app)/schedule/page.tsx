import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { CalendarArrowDown, CheckSquare, ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { db } from "@/db";
import { events } from "@/db/schema";
import { ConfirmButton } from "@/components/form-controls";
import { EventList, eventTimeLabel } from "@/components/lists";
import { TaskList } from "@/components/task-list";
import { Card, Dot, PageHeader } from "@/components/ui";
import { EVENT_TYPES, optionColor } from "@/lib/constants";
import { listEvents, listTasks, type EventRow, type TaskRow } from "@/lib/data";
import {
  addDays,
  formatDate,
  isValidDateKey,
  kstParts,
  monthGrid,
  monthKey,
  parseDateKey,
  parseMonthKey,
  shiftMonth,
  toDateKey,
  todayKey,
} from "@/lib/dates";
import { memberOptions, projectOptions } from "@/lib/queries";
import { cn, isUuid } from "@/lib/utils";
import { createEvent, deleteEvent, updateEvent } from "./actions";
import { EventForm, type EventFormValues } from "./event-form";

export const metadata: Metadata = { title: "일정" };

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type SP = { month?: string; project?: string; member?: string; new?: string; event?: string };

function href(base: SP, patch: Partial<SP>): string {
  const merged = { ...base, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/schedule?${qs}` : "/schedule";
}

function eventDays(e: EventRow): { start: string; end: string } {
  const start = toDateKey(e.startAt);
  if (!e.endAt) return { start, end: start };
  // 종료가 자정 정각이면(종일이 아닌 경우) 전날까지로 표시
  const p = kstParts(e.endAt);
  const endKey = toDateKey(e.endAt);
  const end = !e.allDay && p.hour === 0 && p.minute === 0 && endKey > start ? addDays(endKey, -1) : endKey;
  return { start, end: end < start ? start : end };
}

function toFormValues(e: typeof events.$inferSelect): EventFormValues {
  const startKey = toDateKey(e.startAt);
  const sp = kstParts(e.startAt);
  const ep = e.endAt ? kstParts(e.endAt) : null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    title: e.title,
    type: e.type,
    allDay: e.allDay,
    startDate: startKey,
    startTime: `${pad(sp.hour)}:${pad(sp.minute)}`,
    endDate: e.endAt ? toDateKey(e.endAt) : startKey,
    endTime: ep && !e.allDay ? `${pad(ep.hour)}:${pad(ep.minute)}` : "",
    location: e.location,
    description: e.description,
    projectId: e.projectId ?? "",
    assigneeIds: e.assigneeIds,
  };
}

export default async function SchedulePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { year, month } = parseMonthKey(sp.month);
  const projectId = isUuid(sp.project) ? sp.project : undefined;
  const memberId = isUuid(sp.member) ? sp.member : undefined;
  const base: SP = { month: monthKey(year, month), project: projectId, member: memberId };

  const grid = monthGrid(year, month);
  const from = parseDateKey(grid[0]);
  const to = parseDateKey(addDays(grid[grid.length - 1], 1));
  const today = todayKey();

  const [monthEvents, projects, members, upcoming, openTasks, selected, monthTasks] = await Promise.all([
    listEvents({ from, to, projectId, memberId }),
    projectOptions(),
    memberOptions(),
    listEvents({ from: parseDateKey(today), to: parseDateKey(addDays(today, 14)), projectId, memberId, limit: 20 }),
    listTasks({ openOnly: true, projectId, assigneeId: memberId, dueBefore: addDays(today, 15), limit: 30 }),
    isUuid(sp.event) ? db.select().from(events).where(eq(events.id, sp.event)).limit(1) : Promise.resolve([]),
    listTasks({ projectId, assigneeId: memberId, dueFrom: grid[0], dueBefore: addDays(grid[41], 1) }),
  ]);
  const selectedEvent = selected[0];

  const byDay = new Map<string, EventRow[]>();
  for (const e of monthEvents) {
    const { start, end } = eventDays(e);
    for (let d = start < grid[0] ? grid[0] : start; d <= end && d <= grid[41]; d = addDays(d, 1)) {
      const list = byDay.get(d) ?? [];
      list.push(e);
      byDay.set(d, list);
    }
  }

  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const monthPrefix = monthKey(year, month);
  const newDate = isValidDateKey(sp.new) ? sp.new : null;
  const panelOpen = !!newDate || !!selectedEvent;

  const newValues: EventFormValues | null = newDate
    ? {
        title: "",
        type: "meeting",
        allDay: false,
        startDate: newDate,
        startTime: "10:00",
        endDate: newDate,
        endTime: "11:00",
        location: "",
        description: "",
        projectId: projectId ?? "",
        assigneeIds: [],
      }
    : null;

  const tasksByDay = new Map<string, TaskRow[]>();
  for (const t of monthTasks) {
    if (!t.dueDate) continue;
    tasksByDay.set(t.dueDate, [...(tasksByDay.get(t.dueDate) ?? []), t]);
  }

  return (
    <div>
      <PageHeader
        title="일정"
        description="회의, 마감, 행사 운영, 촬영, 설치·철수 일정을 팀이 함께 관리합니다."
        actions={
          <>
            <a href="/api/calendar" className="btn-secondary" title="Google 캘린더·Outlook 등으로 가져오기">
              <CalendarArrowDown className="h-4 w-4" />
              .ics 내보내기
            </a>
            <Link href={href(base, { new: today, event: undefined })} className="btn-primary">
              <Plus className="h-4 w-4" />
              일정 추가
            </Link>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="flex items-center gap-1">
              <Link href={href(base, { month: monthKey(prev.year, prev.month), new: undefined, event: undefined })} className="btn-ghost btn-sm" aria-label="이전 달">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <h2 className="min-w-28 text-center text-base font-semibold text-gray-900">
                {year}년 {month}월
              </h2>
              <Link href={href(base, { month: monthKey(next.year, next.month), new: undefined, event: undefined })} className="btn-ghost btn-sm" aria-label="다음 달">
                <ChevronRight className="h-4 w-4" />
              </Link>
              <Link href={href(base, { month: today.slice(0, 7), new: undefined, event: undefined })} className="btn-secondary btn-sm ml-1">
                오늘
              </Link>
            </div>
            <form className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="month" value={base.month} />
              <select name="project" defaultValue={projectId ?? ""} className="input w-auto py-1.5 text-xs">
                <option value="">모든 프로젝트</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select name="member" defaultValue={memberId ?? ""} className="input w-auto py-1.5 text-xs">
                <option value="">모든 담당자</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <button className="btn-secondary btn-sm" type="submit">
                적용
              </button>
            </form>
          </div>

          <div className="card overflow-hidden">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50 text-center text-xs font-medium text-gray-500">
              {WEEKDAYS.map((w, i) => (
                <div key={w} className={cn("py-2", i === 0 && "text-red-500", i === 6 && "text-blue-500")}>
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {grid.map((day, i) => {
                const inMonth = day.startsWith(monthPrefix);
                const dayEvents = byDay.get(day) ?? [];
                const dayTasks = tasksByDay.get(day) ?? [];
                const isToday = day === today;
                return (
                  <div
                    key={day}
                    className={cn(
                      "group relative min-h-16 border-b border-r border-gray-100 p-1 sm:min-h-28 sm:p-1.5",
                      i % 7 === 6 && "border-r-0",
                      !inMonth && "bg-gray-50/60",
                      newDate === day && "bg-brand-50/60",
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={cn(
                          "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs",
                          isToday ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-gray-800" : "text-gray-400",
                          !isToday && i % 7 === 0 && inMonth && "text-red-500",
                        )}
                      >
                        {Number(day.slice(8))}
                      </span>
                      <Link
                        href={href(base, { new: day, event: undefined })}
                        className="hidden h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 group-hover:flex"
                        aria-label={`${day} 일정 추가`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    {/* 모바일: 점 표시 */}
                    <div className="mt-1 flex flex-wrap gap-0.5 sm:hidden">
                      {dayEvents.slice(0, 4).map((e) => (
                        <Link key={e.id} href={href(base, { event: e.id, new: undefined })}>
                          <Dot color={e.projectColor ?? optionColor(EVENT_TYPES, e.type)} />
                        </Link>
                      ))}
                      {dayTasks.length > 0 && <span className="text-[9px] font-semibold text-sky-600">✓{dayTasks.length}</span>}
                    </div>
                    {/* 데스크톱: 일정 칩 */}
                    <div className="mt-1 hidden space-y-0.5 sm:block">
                      {dayEvents.slice(0, 3).map((e) => {
                        const color = optionColor(EVENT_TYPES, e.type);
                        return (
                          <Link
                            key={e.id}
                            href={href(base, { event: e.id, new: undefined })}
                            title={`${e.title} · ${eventTimeLabel(e)}`}
                            className={cn(
                              "flex items-center gap-1 truncate rounded px-1.5 py-0.5 text-[11px] leading-4 hover:brightness-95",
                              sp.event === e.id && "ring-2 ring-gray-900",
                            )}
                            style={{ backgroundColor: `${color}1f`, color }}
                          >
                            {e.projectColor && <Dot color={e.projectColor} className="h-1.5 w-1.5" />}
                            <span className="truncate">{e.title}</span>
                          </Link>
                        );
                      })}
                      {dayEvents.length > 3 && <p className="px-1 text-[11px] text-gray-500">+{dayEvents.length - 3}건</p>}
                      {dayTasks.slice(0, 2).map((t) => (
                        <Link
                          key={t.id}
                          href={`/tasks?task=${t.id}`}
                          title={`태스크 마감: ${t.title} (${t.assigneeName ?? "미배정"})`}
                          className={cn("flex items-center gap-1 truncate rounded border border-dashed border-sky-300 px-1.5 py-0.5 text-[11px] leading-4 text-sky-700 hover:bg-sky-50", t.status === "done" && "line-through opacity-50")}
                        >
                          <CheckSquare className="h-3 w-3 shrink-0" />
                          <span className="truncate">{t.title}</span>
                        </Link>
                      ))}
                      {dayTasks.length > 2 && <p className="px-1 text-[11px] text-sky-600">태스크 +{dayTasks.length - 2}</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-3 text-xs text-gray-500">
            {EVENT_TYPES.map((t) => (
              <span key={t.value} className="inline-flex items-center gap-1">
                <Dot color={t.color!} />
                {t.label}
              </span>
            ))}
            <span className="inline-flex items-center gap-1 text-sky-600">
              <CheckSquare className="h-3 w-3" />
              태스크 마감
            </span>
          </div>

          {/* 모바일에서는 이번 달 목록을 함께 표시 */}
          <Card title={`${month}월 일정`} className="sm:hidden" bodyClassName="p-2">
            <EventList events={monthEvents.filter((e) => toDateKey(e.startAt).startsWith(monthPrefix))} members={members} emptyText="이번 달 일정이 없습니다" />
          </Card>
        </div>

        <aside className="space-y-6">
          {panelOpen && (
            <Card
              title={newDate ? `새 일정 · ${formatDate(newDate, { month: "long", day: "numeric", weekday: "short" })}` : "일정 상세"}
              action={
                <Link href={href(base, { new: undefined, event: undefined })} className="btn-ghost btn-sm" aria-label="닫기">
                  <X className="h-4 w-4" />
                </Link>
              }
              className="ring-2 ring-brand-100"
            >
              {newValues && (
                <EventForm action={createEvent} values={newValues} projects={projects} members={members} filterProject={projectId} submitLabel="일정 등록" />
              )}
              {selectedEvent && (
                <>
                  <EventForm
                    key={selectedEvent.id}
                    action={updateEvent.bind(null, selectedEvent.id)}
                    values={toFormValues(selectedEvent)}
                    projects={projects}
                    members={members}
                    filterProject={projectId}
                    submitLabel="저장"
                  />
                  <form action={deleteEvent.bind(null, selectedEvent.id)} className="mt-3">
                    <input type="hidden" name="filterProject" value={projectId ?? ""} />
                    <ConfirmButton message="이 일정을 삭제할까요?" className="btn-danger btn-sm w-full">
                      일정 삭제
                    </ConfirmButton>
                  </form>
                </>
              )}
            </Card>
          )}

          <Card title="앞으로 2주" bodyClassName="p-2">
            <EventList events={upcoming} members={members} />
          </Card>
          <Card title={`2주 내 마감 태스크 (${openTasks.length})`} bodyClassName="p-2">
            <TaskList tasks={openTasks} showAssignee />
          </Card>
        </aside>
      </div>
    </div>
  );
}
