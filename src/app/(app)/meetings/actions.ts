"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { documents, documentVersions, events, meetings, members, projects, type Minutes } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { aiConfigured } from "@/lib/ai";
import { requireUser } from "@/lib/auth";
import { addDays, isValidDateKey, parseDateKey, todayKey } from "@/lib/dates";
import { buildMinutesDocx } from "@/lib/minutes-docx";
import { mimeFromName } from "@/lib/mime";
import { saveFile } from "@/lib/storage";
import { isUuid, str, type ActionState } from "@/lib/utils";

const MAX_NOTES = 200_000;

function parseAttendees(form: FormData): string[] {
  const fromMembers = form.getAll("attendees").filter((v): v is string => typeof v === "string" && !!v.trim());
  const external = str(form, "externalAttendees")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return Array.from(new Set([...fromMembers, ...external])).slice(0, 50);
}

export async function createMeeting(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const rawNotes = String(form.get("rawNotes") ?? "").replace(/\r\n?/g, "\n").trim();
  if (!rawNotes) return { error: "회의 내용을 붙여넣거나 파일을 불러오세요." };
  if (rawNotes.length > MAX_NOTES) return { error: `회의 원문은 ${MAX_NOTES.toLocaleString()}자 이하로 입력하세요.` };
  const meetingDate = str(form, "meetingDate");
  const projectId = str(form, "projectId");

  const [meeting] = await db
    .insert(meetings)
    .values({
      title: str(form, "title") || "제목 없는 회의",
      meetingDate: isValidDateKey(meetingDate) ? meetingDate : todayKey(),
      projectId: isUuid(projectId) ? projectId : null,
      attendees: parseAttendees(form),
      rawNotes,
      status: "draft",
      createdBy: user.id,
    })
    .returning();

  await logActivity({ actorId: user.id, verb: "회의 내용을 올렸습니다", targetType: "meeting", targetId: meeting.id, targetTitle: meeting.title, projectId: meeting.projectId });
  revalidatePath("/", "layout");
  redirect(`/meetings/${meeting.id}${aiConfigured() ? "?generate=1" : ""}`);
}

const MinutesInputSchema = z.object({
  title: z.string().trim().min(1, "회의록 제목을 입력하세요.").max(200),
  summary: z.string().max(5000),
  agenda: z.array(z.string().max(500)).max(50),
  discussions: z.array(z.object({ topic: z.string().max(300), points: z.array(z.string().max(2000)).max(50) })).max(30),
  decisions: z.array(z.string().max(1000)).max(50),
  actionItems: z
    .array(
      z.object({
        task: z.string().max(500),
        owner: z.string().max(100),
        dueDate: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
        eventId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(100),
  openIssues: z.array(z.string().max(1000)).max(50),
  nextMeeting: z.string().max(1000),
});

export async function saveMeeting(
  id: string,
  input: {
    title: string;
    meetingDate: string;
    projectId: string;
    attendees: string[];
    rawNotes: string;
    minutes: Minutes | null;
  },
): Promise<{ error?: string }> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  if (!input.title.trim()) return { error: "회의 제목을 입력하세요." };
  if (!isValidDateKey(input.meetingDate)) return { error: "회의 날짜를 확인하세요." };
  if (input.rawNotes.length > MAX_NOTES) return { error: "회의 원문이 너무 깁니다." };

  let minutes: Minutes | null = null;
  if (input.minutes) {
    const parsed = MinutesInputSchema.safeParse(input.minutes);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "회의록 형식이 올바르지 않습니다." };
    minutes = {
      ...parsed.data,
      agenda: parsed.data.agenda.filter(Boolean),
      decisions: parsed.data.decisions.filter(Boolean),
      openIssues: parsed.data.openIssues.filter(Boolean),
      discussions: parsed.data.discussions.filter((d) => d.topic || d.points.length),
      actionItems: parsed.data.actionItems.filter((a) => a.task.trim()).map((a) => ({ ...a, eventId: a.eventId ?? null })),
    };
  }

  const [meeting] = await db
    .update(meetings)
    .set({
      title: input.title.trim(),
      meetingDate: input.meetingDate,
      projectId: isUuid(input.projectId) ? input.projectId : null,
      attendees: input.attendees.map((a) => a.trim()).filter(Boolean).slice(0, 50),
      rawNotes: input.rawNotes.replace(/\r\n?/g, "\n"),
      ...(minutes ? { minutes, status: "ready" } : {}),
      updatedAt: new Date(),
    })
    .where(eq(meetings.id, id))
    .returning();
  if (!meeting) return { error: "회의록을 찾을 수 없습니다." };

  await logActivity({ actorId: user.id, verb: "회의록을 수정했습니다", targetType: "meeting", targetId: id, targetTitle: meeting.title, projectId: meeting.projectId });
  revalidatePath("/", "layout");
  return {};
}

export async function deleteMeeting(id: string) {
  await requireUser();
  if (!isUuid(id)) return;
  await db.delete(meetings).where(eq(meetings.id, id));
  revalidatePath("/", "layout");
  redirect("/meetings");
}

/** 담당자 이름을 팀원과 매칭 ("김민지 매니저" → 김민지) */
function matchMember(owner: string, list: { id: string; name: string }[]): string | null {
  const o = owner.replace(/\s/g, "");
  if (!o) return null;
  const exact = list.find((m) => m.name.replace(/\s/g, "") === o);
  if (exact) return exact.id;
  const partial = list.find((m) => o.includes(m.name.replace(/\s/g, "")) || m.name.replace(/\s/g, "").includes(o));
  return partial?.id ?? null;
}

/** 회의록의 액션 아이템을 일정(할 일)으로 등록. index 생략 시 미등록 항목 전체 */
export async function addActionItemsToSchedule(meetingId: string, index?: number) {
  const user = await requireUser();
  if (!isUuid(meetingId)) return;
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, meetingId)).limit(1);
  if (!meeting?.minutes) return;
  const memberList = await db.select({ id: members.id, name: members.name }).from(members);

  const items = [...meeting.minutes.actionItems];
  let added = 0;
  for (let i = 0; i < items.length; i++) {
    if (index !== undefined && i !== index) continue;
    const item = items[i];
    if (item.eventId || !item.task.trim()) continue;
    const due = isValidDateKey(item.dueDate) ? item.dueDate : null;
    const assignee = matchMember(item.owner, memberList);
    const [event] = await db
      .insert(events)
      .values({
        title: item.task,
        type: "task",
        allDay: true,
        startAt: parseDateKey(due ?? addDays(meeting.meetingDate, 7)),
        projectId: meeting.projectId,
        assigneeIds: assignee ? [assignee] : [],
        description: `회의록 「${meeting.minutes.title}」(${meeting.meetingDate})의 액션 아이템${item.owner ? `\n담당: ${item.owner}` : ""}${due ? "" : "\n※ 기한 미정 — 회의일 + 7일로 임시 지정"}`,
        meetingId: meeting.id,
        createdBy: user.id,
      })
      .returning({ id: events.id });
    items[i] = { ...item, eventId: event.id };
    added++;
  }

  if (added) {
    await db
      .update(meetings)
      .set({ minutes: { ...meeting.minutes, actionItems: items }, updatedAt: new Date() })
      .where(eq(meetings.id, meeting.id));
    await logActivity({
      actorId: user.id,
      verb: `액션 아이템 ${added}건을 일정에 등록했습니다`,
      targetType: "meeting",
      targetId: meeting.id,
      targetTitle: meeting.minutes.title,
      projectId: meeting.projectId,
    });
  }
  revalidatePath("/", "layout");
}

/** 회의록을 Word(.docx)로 만들어 문서함에 저장 */
export async function saveMinutesToDocuments(meetingId: string) {
  const user = await requireUser();
  if (!isUuid(meetingId)) return;
  const [row] = await db
    .select({ meeting: meetings, projectName: projects.name, authorName: members.name })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(members, eq(members.id, meetings.createdBy))
    .where(eq(meetings.id, meetingId))
    .limit(1);
  if (!row?.meeting.minutes) return;
  const { meeting } = row;

  const buffer = await buildMinutesDocx(meeting.minutes!, {
    meetingDate: meeting.meetingDate,
    projectName: row.projectName,
    attendees: meeting.attendees,
    author: row.authorName,
  });
  const fileName = `${meeting.meetingDate}_${meeting.minutes!.title}.docx`.replace(/[\\/:*?"<>|]/g, "_");
  const saved = await saveFile(buffer, fileName, mimeFromName(fileName));

  const doc = await db.transaction(async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({
        title: `[회의록] ${meeting.minutes!.title}`,
        kind: "file",
        category: "minutes",
        description: meeting.minutes!.summary,
        projectId: meeting.projectId,
        createdBy: user.id,
      })
      .returning();
    await tx.insert(documentVersions).values({
      documentId: doc.id,
      version: 1,
      fileName,
      mimeType: mimeFromName(fileName),
      size: buffer.length,
      storage: saved.storage,
      storageKey: saved.key,
      note: "회의록에서 자동 생성",
      uploadedBy: user.id,
    });
    return doc;
  });

  await logActivity({ actorId: user.id, verb: "회의록을 문서함에 저장했습니다", targetType: "document", targetId: doc.id, targetTitle: doc.title, projectId: doc.projectId });
  revalidatePath("/", "layout");
  redirect(`/documents/${doc.id}`);
}
