"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { events } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { EVENT_TYPES } from "@/lib/constants";
import { isValidDateKey, parseDateKey, parseDateTimeInput, toDateKey } from "@/lib/dates";
import { isUuid, str, type ActionState } from "@/lib/utils";

function readEventForm(form: FormData): { error: string } | { data: Omit<typeof events.$inferInsert, "createdBy"> } {
  const title = str(form, "title");
  if (!title) return { error: "일정 제목을 입력하세요." };
  const type = str(form, "type");
  const allDay = form.get("allDay") === "on";
  const startDate = str(form, "startDate");
  const endDate = str(form, "endDate") || startDate;
  const startTime = str(form, "startTime") || "10:00";
  const endTime = str(form, "endTime");
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate)) return { error: "날짜를 확인하세요." };
  if (!/^\d{2}:\d{2}$/.test(startTime) || (endTime && !/^\d{2}:\d{2}$/.test(endTime))) return { error: "시간을 확인하세요." };

  let startAt: Date;
  let endAt: Date | null;
  if (allDay) {
    startAt = parseDateKey(startDate);
    endAt = endDate > startDate ? parseDateKey(endDate) : null;
  } else {
    startAt = parseDateTimeInput(`${startDate}T${startTime}`);
    endAt = endTime ? parseDateTimeInput(`${endDate}T${endTime}`) : endDate > startDate ? parseDateTimeInput(`${endDate}T${startTime}`) : null;
  }
  if (endAt && endAt < startAt) return { error: "종료 시점이 시작보다 빠릅니다." };

  const projectId = str(form, "projectId");
  const assigneeIds = form.getAll("assigneeIds").filter((v): v is string => typeof v === "string" && isUuid(v));
  return {
    data: {
      title,
      type: EVENT_TYPES.some((t) => t.value === type) ? type : "etc",
      allDay,
      startAt,
      endAt,
      location: str(form, "location"),
      description: str(form, "description"),
      projectId: isUuid(projectId) ? projectId : null,
      assigneeIds,
      done: form.get("done") === "on",
    },
  };
}

function backTo(form: FormData, date: Date) {
  const month = toDateKey(date).slice(0, 7);
  const project = str(form, "filterProject");
  return `/schedule?month=${month}${isUuid(project) ? `&project=${project}` : ""}`;
}

export async function createEvent(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const parsed = readEventForm(form);
  if ("error" in parsed) return { error: parsed.error };
  const [event] = await db.insert(events).values({ ...parsed.data, createdBy: user.id }).returning();
  await logActivity({ actorId: user.id, verb: "일정을 등록했습니다", targetType: "event", targetId: event.id, targetTitle: event.title, projectId: event.projectId });
  revalidatePath("/", "layout");
  redirect(backTo(form, event.startAt));
}

export async function updateEvent(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const parsed = readEventForm(form);
  if ("error" in parsed) return { error: parsed.error };
  const [event] = await db.update(events).set({ ...parsed.data, updatedAt: new Date() }).where(eq(events.id, id)).returning();
  if (!event) return { error: "일정을 찾을 수 없습니다." };
  await logActivity({ actorId: user.id, verb: "일정을 수정했습니다", targetType: "event", targetId: event.id, targetTitle: event.title, projectId: event.projectId });
  revalidatePath("/", "layout");
  redirect(backTo(form, event.startAt));
}

export async function deleteEvent(id: string, form: FormData) {
  await requireUser();
  if (!isUuid(id)) return;
  const [event] = await db.delete(events).where(eq(events.id, id)).returning();
  revalidatePath("/", "layout");
  redirect(backTo(form, event?.startAt ?? new Date()));
}

/** 할 일 완료 체크 토글 */
export async function toggleEventDone(id: string) {
  const user = await requireUser();
  if (!isUuid(id)) return;
  const [event] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!event) return;
  await db.update(events).set({ done: !event.done, updatedAt: new Date() }).where(eq(events.id, id));
  if (!event.done) {
    await logActivity({ actorId: user.id, verb: "할 일을 완료했습니다", targetType: "event", targetId: event.id, targetTitle: event.title, projectId: event.projectId });
  }
  revalidatePath("/", "layout");
}


