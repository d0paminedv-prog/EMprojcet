"use client";

import { useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Flag, FileText, Plus } from "lucide-react";
import { FigmaLogo } from "@/components/figma-logo";
import { notifyChange } from "@/components/realtime";
import { TASK_PRIORITIES, TASK_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { DUE_TONE_CLASS, dueInfo, isOverdue } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { moveTask } from "./actions";

export type BoardTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeColor: string | null;
  projectName: string | null;
  projectColor: string | null;
  figmaUrl: string | null;
  documentId: string | null;
  completedAt: string | null;
};

type Member = { id: string; name: string; color: string; role: string };
type Column = { id: string; title: string; color: string; subtitle?: string; match: (t: BoardTask) => boolean; change: { status?: string; assigneeId?: string | null } };

function TaskCard({ task, view, href, dragging }: { task: BoardTask; view: "members" | "status"; href: string; dragging?: boolean }) {
  const due = dueInfo(task.dueDate, task.status === "done");
  return (
    <div
      className={cn(
        "rounded-lg border bg-white p-2.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.05)] transition",
        dragging ? "rotate-1 border-brand-300 shadow-lg" : "border-gray-200 hover:border-gray-300",
        task.status === "done" && "opacity-60",
        isOverdue(task.dueDate, task.status) && "border-l-4 border-l-red-400",
      )}
      data-href={href}
    >
      <div className="flex items-start gap-1.5">
        {task.priority === "high" && <Flag className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-500" aria-label="우선순위 높음" />}
        <p className={cn("text-sm font-medium leading-snug text-gray-900", task.status === "done" && "line-through")}>{task.title}</p>
      </div>
      {task.projectName && (
        <p className="mt-1 flex min-w-0 items-center gap-1 text-[11px] text-gray-500">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: task.projectColor ?? "#9ca3af" }} />
          <span className="truncate">{task.projectName}</span>
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <span className={cn("badge", DUE_TONE_CLASS[due.tone])}>{due.label}</span>
        {view === "members" ? (
          <span className="badge" style={{ backgroundColor: `${optionColor(TASK_STATUSES, task.status)}1a`, color: optionColor(TASK_STATUSES, task.status) }}>
            {optionLabel(TASK_STATUSES, task.status)}
          </span>
        ) : (
          <span className="badge bg-gray-100 text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: task.assigneeColor ?? "#9ca3af" }} />
            {task.assigneeName ?? "미배정"}
          </span>
        )}
        {task.figmaUrl && <FigmaLogo className="ml-auto h-3.5 w-3.5" />}
        {task.documentId && <FileText className={cn("h-3.5 w-3.5 text-blue-500", !task.figmaUrl && "ml-auto")} aria-label="연결된 문서" />}
      </div>
    </div>
  );
}

function DraggableCard({ task, view, href, onOpen }: { task: BoardTask; view: "members" | "status"; href: string; onOpen: (href: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id });
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      role="button"
      aria-label={`${task.title} 열기`}
      onClick={() => onOpen(href)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(href);
      }}
      className={cn("cursor-grab touch-manipulation active:cursor-grabbing", isDragging && "opacity-30")}
    >
      <TaskCard task={task} view={view} href={href} />
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  view,
  hrefFor,
  newHref,
  onOpen,
}: {
  column: Column;
  tasks: BoardTask[];
  view: "members" | "status";
  hrefFor: (id: string) => string;
  newHref: string;
  onOpen: (href: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const open = tasks.filter((t) => t.status !== "done");
  const done = tasks.filter((t) => t.status === "done");
  const overdue = open.filter((t) => isOverdue(t.dueDate, t.status)).length;
  const doing = open.filter((t) => t.status === "doing" || t.status === "review").length;
  const shown = view === "status" ? tasks : open;

  return (
    <section
      ref={setNodeRef}
      data-column={column.title}
      className={cn("flex w-[260px] shrink-0 flex-col rounded-xl border bg-gray-50/80 sm:w-[240px] lg:flex-1 lg:basis-0 lg:min-w-[168px]", isOver ? "border-brand-400 bg-brand-50/60" : "border-gray-200")}
    >
      <header className="flex items-center gap-2 border-b border-gray-200/70 px-3 py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-gray-900">{column.title}</p>
          <p className="text-[11px] text-gray-500">
            {view === "members" ? (
              <>
                남은 {open.length} · 진행 {doing}
                {overdue > 0 && <span className="font-semibold text-red-500"> · 지연 {overdue}</span>}
              </>
            ) : (
              <>{tasks.length}건</>
            )}
          </p>
        </div>
        <Link href={newHref} scroll={false} className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700" aria-label={`${column.title}에 태스크 추가`}>
          <Plus className="h-4 w-4" />
        </Link>
      </header>
      <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
        {shown.map((t) => (
          <DraggableCard key={t.id} task={t} view={view} href={hrefFor(t.id)} onOpen={onOpen} />
        ))}
        {shown.length === 0 && <p className="py-6 text-center text-xs text-gray-400">{isOver ? "여기에 놓기" : "태스크 없음"}</p>}
        {view === "members" && done.length > 0 && (
          <details className="mt-1">
            <summary className="cursor-pointer px-1 text-[11px] text-gray-500">최근 완료 {done.length}건</summary>
            <div className="mt-2 flex flex-col gap-2">
              {done.map((t) => (
                <DraggableCard key={t.id} task={t} view={view} href={hrefFor(t.id)} onOpen={onOpen} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

export function TaskBoard({
  tasks,
  members,
  view,
  baseQuery,
}: {
  tasks: BoardTask[];
  members: Member[];
  view: "members" | "status";
  baseQuery: string;
}) {
  const router = useRouter();
  // 드래그 결과를 서버 반영 전에 먼저 화면에 보여 주고, 새 데이터가 오면 자동으로 맞춰짐
  const [items, applyMove] = useOptimistic(tasks, (state, move: { id: string; patch: Partial<BoardTask> }) =>
    state.map((t) => (t.id === move.id ? { ...t, ...move.patch } : t)),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const justDragged = useRef(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const columns: Column[] = useMemo(() => {
    if (view === "status") {
      return TASK_STATUSES.map((s) => ({ id: `s:${s.value}`, title: s.label, color: s.color!, match: (t: BoardTask) => t.status === s.value, change: { status: s.value } }));
    }
    return [
      ...members.map((m) => ({
        id: `m:${m.id}`,
        title: m.name,
        subtitle: m.role,
        color: m.color,
        match: (t: BoardTask) => t.assigneeId === m.id,
        change: { assigneeId: m.id },
      })),
      { id: "m:none", title: "미배정", color: "#d1d5db", match: (t: BoardTask) => !t.assigneeId || !members.some((m) => m.id === t.assigneeId), change: { assigneeId: null } },
    ];
  }, [members, view]);

  const sep = baseQuery ? "&" : "";
  const hrefFor = (id: string) => `/tasks?${baseQuery}${sep}task=${id}`;
  const newHrefFor = (col: Column) => {
    const preset = col.change.status ? `status=${col.change.status}` : col.change.assigneeId ? `assignee=${col.change.assigneeId}` : "assignee=none";
    return `/tasks?${baseQuery}${sep}new=1&${preset}`;
  };

  function onOpen(href: string) {
    if (justDragged.current) return;
    router.push(href, { scroll: false });
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    setError(null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 150);
    const column = columns.find((c) => c.id === e.over?.id);
    const task = items.find((t) => t.id === e.active.id);
    if (!column || !task || column.match(task)) return;

    const member = column.change.assigneeId ? members.find((m) => m.id === column.change.assigneeId) : null;
    const patch: Partial<BoardTask> = {
      ...(column.change.status ? { status: column.change.status } : {}),
      ...("assigneeId" in column.change
        ? { assigneeId: column.change.assigneeId ?? null, assigneeName: member?.name ?? null, assigneeColor: member?.color ?? null }
        : {}),
    };
    startTransition(async () => {
      applyMove({ id: task.id, patch });
      const result = await moveTask(task.id, column.change);
      if (result.error) setError(result.error);
      else notifyChange("tasks");
      router.refresh();
    });
  }

  const active = items.find((t) => t.id === activeId);

  return (
    <div>
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:mx-0 sm:px-0" data-testid="task-board">
          {columns.map((col) => (
            <BoardColumn
              key={col.id}
              column={col}
              tasks={items.filter(col.match)}
              view={view}
              hrefFor={hrefFor}
              newHref={newHrefFor(col)}
              onOpen={onOpen}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>{active ? <TaskCard task={active} view={view} href="" dragging /> : null}</DragOverlay>
      </DndContext>
      <p className="mt-1 text-xs text-gray-400">
        카드를 끌어서 다른 {view === "members" ? "팀원 칸에 놓으면 담당자가" : "상태 칸에 놓으면 상태가"} 바뀝니다. · {optionLabel(TASK_PRIORITIES, "high")} 우선순위는 깃발로 표시됩니다.
      </p>
    </div>
  );
}
