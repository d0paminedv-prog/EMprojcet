import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, documents, documentVersions, events, meetings, members, projects } from "@/db/schema";

// ---------- 문서 ----------

export async function listDocuments(opts: {
  projectId?: string | null;
  kind?: string;
  category?: string;
  q?: string;
  limit?: number;
} = {}) {
  const where: SQL[] = [];
  if (opts.projectId) where.push(eq(documents.projectId, opts.projectId));
  if (opts.kind) where.push(eq(documents.kind, opts.kind));
  if (opts.category) where.push(eq(documents.category, opts.category));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(documents.title, like), ilike(documents.description, like))!);
  }

  const rows = await db
    .select({
      id: documents.id,
      title: documents.title,
      kind: documents.kind,
      category: documents.category,
      url: documents.url,
      updatedAt: documents.updatedAt,
      projectId: documents.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      createdByName: members.name,
    })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .leftJoin(members, eq(members.id, documents.createdBy))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(documents.updatedAt))
    .limit(opts.limit ?? 200);

  const ids = rows.filter((r) => r.kind === "file").map((r) => r.id);
  const versions = ids.length
    ? await db
        .select({
          documentId: documentVersions.documentId,
          version: documentVersions.version,
          fileName: documentVersions.fileName,
          size: documentVersions.size,
        })
        .from(documentVersions)
        .where(inArray(documentVersions.documentId, ids))
        .orderBy(desc(documentVersions.version))
    : [];
  const latest = new Map<string, (typeof versions)[number]>();
  for (const v of versions) if (!latest.has(v.documentId)) latest.set(v.documentId, v);

  return rows.map((r) => ({ ...r, latest: latest.get(r.id) ?? null }));
}

export type DocumentRow = Awaited<ReturnType<typeof listDocuments>>[number];

// ---------- 일정 ----------

export async function listEvents(opts: {
  from?: Date;
  to?: Date;
  projectId?: string | null;
  memberId?: string | null;
  onlyOpenTasks?: boolean;
  limit?: number;
}) {
  const where: SQL[] = [];
  // 기간과 겹치는 일정 (시작 < to AND (종료 >= from 또는 시작 >= from))
  if (opts.to) where.push(lt(events.startAt, opts.to));
  if (opts.from) {
    where.push(
      or(gte(events.startAt, opts.from), and(sql`${events.endAt} is not null`, gte(events.endAt, opts.from)))!,
    );
  }
  if (opts.projectId) where.push(eq(events.projectId, opts.projectId));
  if (opts.memberId) where.push(sql`${events.assigneeIds} @> ${JSON.stringify([opts.memberId])}::jsonb`);
  if (opts.onlyOpenTasks) where.push(and(eq(events.type, "task"), eq(events.done, false))!);

  return db
    .select({
      id: events.id,
      title: events.title,
      type: events.type,
      startAt: events.startAt,
      endAt: events.endAt,
      allDay: events.allDay,
      location: events.location,
      description: events.description,
      assigneeIds: events.assigneeIds,
      done: events.done,
      meetingId: events.meetingId,
      projectId: events.projectId,
      projectName: projects.name,
      projectColor: projects.color,
    })
    .from(events)
    .leftJoin(projects, eq(projects.id, events.projectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(events.startAt))
    .limit(opts.limit ?? 500);
}

export type EventRow = Awaited<ReturnType<typeof listEvents>>[number];

// ---------- 회의록 ----------

export async function listMeetings(opts: { projectId?: string | null; limit?: number; q?: string } = {}) {
  const where: SQL[] = [];
  if (opts.projectId) where.push(eq(meetings.projectId, opts.projectId));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    where.push(or(ilike(meetings.title, like), ilike(meetings.rawNotes, like))!);
  }
  return db
    .select({
      id: meetings.id,
      title: meetings.title,
      meetingDate: meetings.meetingDate,
      attendees: meetings.attendees,
      status: meetings.status,
      summary: sql<string | null>`${meetings.minutes}->>'summary'`,
      actionCount: sql<number>`coalesce(jsonb_array_length(${meetings.minutes}->'actionItems'), 0)::int`,
      projectId: meetings.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      updatedAt: meetings.updatedAt,
    })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(meetings.meetingDate), desc(meetings.createdAt))
    .limit(opts.limit ?? 200);
}

export type MeetingRow = Awaited<ReturnType<typeof listMeetings>>[number];

// ---------- 활동 ----------

export async function listActivities(opts: { projectId?: string | null; limit?: number } = {}) {
  return db
    .select({
      id: activities.id,
      verb: activities.verb,
      targetType: activities.targetType,
      targetId: activities.targetId,
      targetTitle: activities.targetTitle,
      createdAt: activities.createdAt,
      actorName: members.name,
      actorColor: members.color,
    })
    .from(activities)
    .leftJoin(members, eq(members.id, activities.actorId))
    .where(opts.projectId ? eq(activities.projectId, opts.projectId) : undefined)
    .orderBy(desc(activities.createdAt))
    .limit(opts.limit ?? 20);
}

export type ActivityRow = Awaited<ReturnType<typeof listActivities>>[number];

