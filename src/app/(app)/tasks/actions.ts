"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { tasks } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { isValidDateKey } from "@/lib/dates";
import { isFigmaUrl, isUuid, str, type ActionState } from "@/lib/utils";

function readTaskForm(form: FormData) {
  const status = str(form, "status");
  const priority = str(form, "priority");
  const dueDate = str(form, "dueDate");
  const assigneeId = str(form, "assigneeId");
  const projectId = str(form, "projectId");
  const documentId = str(form, "documentId");
  const figmaUrl = str(form, "figmaUrl");
  return {
    title: str(form, "title"),
    description: str(form, "description"),
    status: TASK_STATUSES.some((s) => s.value === status) ? status : "todo",
    priority: TASK_PRIORITIES.some((p) => p.value === priority) ? priority : "normal",
    dueDate: isValidDateKey(dueDate) ? dueDate : null,
    assigneeId: isUuid(assigneeId) ? assigneeId : null,
    projectId: isUuid(projectId) ? projectId : null,
    documentId: isUuid(documentId) ? documentId : null,
    figmaUrl: figmaUrl || null,
  };
}

function validate(data: ReturnType<typeof readTaskForm>): string | null {
  if (!data.title) return "태스크 제목을 입력하세요.";
  if (data.title.length > 200) return "제목은 200자 이내로 입력하세요.";
  if (data.figmaUrl && !isFigmaUrl(data.figmaUrl)) return "Figma 링크(https://www.figma.com/...)를 확인하세요.";
  return null;
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const data = readTaskForm(form);
  const error = validate(data);
  if (error) return { error };
  const [task] = await db
    .insert(tasks)
    .values({
      ...data,
      sortOrder: Date.now(),
      completedAt: data.status === "done" ? new Date() : null,
      createdBy: user.id,
    })
    .returning();
  await logActivity({ actorId: user.id, verb: "태스크를 만들었습니다", targetType: "task", targetId: task.id, targetTitle: task.title, projectId: task.projectId });
  refresh();
  return { ok: true, message: "추가했습니다." };
}

export async function updateTask(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const data = readTaskForm(form);
  const error = validate(data);
  if (error) return { error };
  const [before] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!before) return { error: "태스크를 찾을 수 없습니다." };
  const completedAt = data.status === "done" ? (before.completedAt ?? new Date()) : null;
  await db.update(tasks).set({ ...data, completedAt, updatedAt: new Date() }).where(eq(tasks.id, id));
  await logActivity({
    actorId: user.id,
    verb: before.status !== "done" && data.status === "done" ? "태스크를 완료했습니다" : "태스크를 수정했습니다",
    targetType: "task",
    targetId: id,
    targetTitle: data.title,
    projectId: data.projectId,
  });
  refresh();
  return { ok: true, message: "저장했습니다." };
}

/** 보드에서 끌어서 놓기: 상태 또는 담당자 변경 */
export async function moveTask(id: string, change: { status?: string; assigneeId?: string | null }): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) return { error: "태스크를 찾을 수 없습니다." };

  const patch: Partial<typeof tasks.$inferInsert> = { updatedAt: new Date(), sortOrder: Date.now() };
  if (change.status !== undefined) {
    if (!TASK_STATUSES.some((s) => s.value === change.status)) return { error: "잘못된 상태입니다." };
    patch.status = change.status;
    patch.completedAt = change.status === "done" ? (task.completedAt ?? new Date()) : null;
  }
  if (change.assigneeId !== undefined) {
    if (change.assigneeId !== null && !isUuid(change.assigneeId)) return { error: "잘못된 담당자입니다." };
    patch.assigneeId = change.assigneeId;
  }
  await db.update(tasks).set(patch).where(eq(tasks.id, id));

  if (patch.status === "done" && task.status !== "done") {
    await logActivity({ actorId: user.id, verb: "태스크를 완료했습니다", targetType: "task", targetId: id, targetTitle: task.title, projectId: task.projectId });
  } else if (change.assigneeId !== undefined && change.assigneeId !== task.assigneeId) {
    await logActivity({ actorId: user.id, verb: "태스크 담당자를 바꿨습니다", targetType: "task", targetId: id, targetTitle: task.title, projectId: task.projectId });
  }
  refresh();
  return {};
}

export async function toggleTaskDone(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  const [task] = await db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
  if (!task) return;
  const done = task.status !== "done";
  await db
    .update(tasks)
    .set({ status: done ? "done" : "todo", completedAt: done ? new Date() : null, updatedAt: new Date() })
    .where(eq(tasks.id, id));
  if (done) await logActivity({ actorId: user.id, verb: "태스크를 완료했습니다", targetType: "task", targetId: id, targetTitle: task.title, projectId: task.projectId });
  refresh();
}

export async function deleteTask(id: string) {
  await requireUser();
  if (!isUuid(id)) return;
  await db.delete(tasks).where(eq(tasks.id, id));
  refresh();
}
