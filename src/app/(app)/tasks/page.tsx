import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { CheckCircle2, Circle, ExternalLink, FileText, LayoutGrid, List, Users, X } from "lucide-react";
import { db } from "@/db";
import { documents, tasks } from "@/db/schema";
import { ConfirmButton, NotifyAfterSubmit } from "@/components/form-controls";
import { EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { TASK_STATUSES, optionColor, optionLabel } from "@/lib/constants";
import { listTasks } from "@/lib/data";
import { daysAgo } from "@/lib/dates";
import { memberOptions, projectOptions } from "@/lib/queries";
import { DUE_TONE_CLASS, dueInfo } from "@/lib/task-utils";
import { cn, isUuid } from "@/lib/utils";
import { createTask, deleteTask, toggleTaskDone, updateTask } from "./actions";
import { TaskBoard, type BoardTask } from "./task-board";
import { QuickAddTask, TaskForm, type TaskFormValues } from "./task-form";

export const metadata: Metadata = { title: "태스크" };

type SP = { view?: string; project?: string; task?: string; new?: string; assignee?: string; status?: string };

const VIEWS = [
  { value: "members", label: "팀원별", icon: Users },
  { value: "status", label: "상태별", icon: LayoutGrid },
  { value: "list", label: "목록", icon: List },
] as const;

export default async function TasksPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const view = sp.view === "status" || sp.view === "list" ? sp.view : "members";
  const projectId = isUuid(sp.project) ? sp.project : undefined;

  const baseParams = new URLSearchParams();
  if (view !== "members") baseParams.set("view", view);
  if (projectId) baseParams.set("project", projectId);
  const baseQuery = baseParams.toString();
  const closeHref = `/tasks${baseQuery ? `?${baseQuery}` : ""}`;

  const twoWeeksAgo = daysAgo(14);
  const [rows, members, projects, docs, selected] = await Promise.all([
    listTasks({ projectId, doneSince: twoWeeksAgo }),
    memberOptions(),
    projectOptions(),
    db.select({ id: documents.id, title: documents.title }).from(documents).orderBy(desc(documents.updatedAt)).limit(300),
    isUuid(sp.task) ? db.select().from(tasks).where(eq(tasks.id, sp.task)).limit(1) : Promise.resolve([]),
  ]);
  const selectedTask = selected[0];

  const boardTasks: BoardTask[] = rows.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    assigneeId: t.assigneeId,
    assigneeName: t.assigneeName,
    assigneeColor: t.assigneeColor,
    projectName: t.projectName,
    projectColor: t.projectColor,
    figmaUrl: t.figmaUrl,
    documentId: t.documentId,
    completedAt: t.completedAt?.toISOString() ?? null,
  }));

  const presetAssignee = sp.assignee === "none" ? "" : isUuid(sp.assignee) ? sp.assignee : user.id;
  const newValues: TaskFormValues | null =
    sp.new === "1"
      ? {
          title: "",
          description: "",
          status: TASK_STATUSES.some((s) => s.value === sp.status) ? sp.status! : "todo",
          priority: "normal",
          dueDate: "",
          assigneeId: presetAssignee,
          projectId: projectId ?? "",
          documentId: "",
          figmaUrl: "",
        }
      : null;

  const memberList = members.map((m) => ({ id: m.id, name: m.name }));
  const projectList = projects.map((p) => ({ id: p.id, name: p.name }));

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">태스크</h1>
          <p className="mt-1 text-sm text-gray-500">팀원 5명이 각자 무엇을 하고 있는지 한눈에 봅니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 p-1">
            {VIEWS.map((v) => {
              const params = new URLSearchParams(baseParams);
              if (v.value === "members") params.delete("view");
              else params.set("view", v.value);
              const qs = params.toString();
              return (
                <Link
                  key={v.value}
                  href={`/tasks${qs ? `?${qs}` : ""}`}
                  className={cn("flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium", view === v.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500")}
                >
                  <v.icon className="h-3.5 w-3.5" />
                  {v.label}
                </Link>
              );
            })}
          </div>
          <form className="flex items-center gap-1">
            {view !== "members" && <input type="hidden" name="view" value={view} />}
            <select name="project" defaultValue={projectId ?? ""} className="input w-auto py-1.5 text-xs" aria-label="프로젝트 필터">
              <option value="">모든 프로젝트</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button type="submit" className="btn-secondary btn-sm">
              적용
            </button>
          </form>
        </div>
      </div>

      <QuickAddTask action={createTask} members={memberList} projects={projectList} defaultAssigneeId={user.id} defaultProjectId={projectId ?? ""} />

      {view === "list" ? (
        <div className="card overflow-x-auto">
          {rows.length === 0 ? (
            <div className="p-4">
              <EmptyState title="태스크가 없습니다" description="위 입력칸에 할 일을 적고 Enter를 누르세요." />
            </div>
          ) : (
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500">
                  <th className="w-10 px-3 py-2.5" />
                  <th className="px-2 py-2.5 font-medium">태스크</th>
                  <th className="w-24 px-2 py-2.5 font-medium">상태</th>
                  <th className="w-24 px-2 py-2.5 font-medium">담당</th>
                  <th className="w-40 px-2 py-2.5 font-medium">마감</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rows.map((t) => {
                  const due = dueInfo(t.dueDate, t.status === "done");
                  return (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <form action={toggleTaskDone.bind(null, t.id)}>
              <NotifyAfterSubmit />
                          <button type="submit" aria-label={t.status === "done" ? "완료 취소" : "완료"} className="text-gray-300 hover:text-emerald-500">
                            {t.status === "done" ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" /> : <Circle className="h-4.5 w-4.5" />}
                          </button>
                        </form>
                      </td>
                      <td className="px-2 py-2">
                        <Link href={`/tasks?${baseQuery}${baseQuery ? "&" : ""}task=${t.id}`} scroll={false} className={cn("font-medium text-gray-900 hover:text-brand-600", t.status === "done" && "text-gray-400 line-through")}>
                          {t.title}
                        </Link>
                        {t.projectName && <span className="ml-2 text-xs text-gray-500">{t.projectName}</span>}
                      </td>
                      <td className="px-2 py-2">
                        <span className="badge" style={{ backgroundColor: `${optionColor(TASK_STATUSES, t.status)}1a`, color: optionColor(TASK_STATUSES, t.status) }}>
                          {optionLabel(TASK_STATUSES, t.status)}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-gray-700">{t.assigneeName ?? <span className="text-gray-400">미배정</span>}</td>
                      <td className="px-2 py-2">
                        <span className={cn("badge", DUE_TONE_CLASS[due.tone])}>{due.label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      ) : (
        <TaskBoard tasks={boardTasks} members={members} view={view} baseQuery={baseQuery} />
      )}

      {(newValues || selectedTask) && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <Link href={closeHref} scroll={false} className="absolute inset-0 bg-gray-900/20" aria-label="닫기" />
          <aside className="relative z-10 h-full w-full max-w-md overflow-y-auto bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">{newValues ? "새 태스크" : "태스크"}</h2>
              <Link href={closeHref} scroll={false} className="btn-ghost btn-sm" aria-label="닫기">
                <X className="h-4 w-4" />
              </Link>
            </div>
            {newValues && (
              <TaskForm action={createTask} values={newValues} members={memberList} projects={projectList} documents={docs} submitLabel="태스크 추가" doneHref={closeHref} />
            )}
            {selectedTask && (
              <>
                {(selectedTask.documentId || selectedTask.figmaUrl) && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {selectedTask.documentId && (
                      <Link href={`/documents/${selectedTask.documentId}`} className="btn-secondary btn-sm">
                        <FileText className="h-3.5 w-3.5" />
                        연결 문서 열기
                      </Link>
                    )}
                    {selectedTask.figmaUrl && (
                      <a href={selectedTask.figmaUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                        <ExternalLink className="h-3.5 w-3.5" />
                        Figma 열기
                      </a>
                    )}
                  </div>
                )}
                <TaskForm
                  key={selectedTask.id}
                  action={updateTask.bind(null, selectedTask.id)}
                  values={{
                    title: selectedTask.title,
                    description: selectedTask.description,
                    status: selectedTask.status,
                    priority: selectedTask.priority,
                    dueDate: selectedTask.dueDate ?? "",
                    assigneeId: selectedTask.assigneeId ?? "",
                    projectId: selectedTask.projectId ?? "",
                    documentId: selectedTask.documentId ?? "",
                    figmaUrl: selectedTask.figmaUrl ?? "",
                  }}
                  members={memberList}
                  projects={projectList}
                  documents={docs}
                  submitLabel="저장"
                  doneHref={closeHref}
                />
                <form action={deleteTask.bind(null, selectedTask.id)} className="mt-3">
                  <ConfirmButton message="이 태스크를 삭제할까요?" className="btn-danger btn-sm w-full">
                    태스크 삭제
                  </ConfirmButton>
                </form>
              </>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
