import { and, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { activities, documents, documentVersions, events, members, projects, tasks } from "@/db/schema";

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
      figmaMeta: documents.figmaMeta,
      lastEditedAt: documents.lastEditedAt,
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

// ---------- 태스크 ----------

export async function listTasks(opts: {
  assigneeId?: string | null;
  projectId?: string | null;
  status?: string;
  openOnly?: boolean;
  doneSince?: Date;
  dueBefore?: string;
  dueFrom?: string;
  limit?: number;
} = {}) {
  const where: SQL[] = [];
  if (opts.assigneeId) where.push(eq(tasks.assigneeId, opts.assigneeId));
  if (opts.projectId) where.push(eq(tasks.projectId, opts.projectId));
  if (opts.status) where.push(eq(tasks.status, opts.status));
  if (opts.openOnly) where.push(sql`${tasks.status} <> 'done'`);
  if (opts.doneSince) where.push(or(sql`${tasks.status} <> 'done'`, gte(tasks.completedAt, opts.doneSince))!);
  if (opts.dueBefore) where.push(sql`${tasks.dueDate} < ${opts.dueBefore}`);
  if (opts.dueFrom) where.push(sql`${tasks.dueDate} >= ${opts.dueFrom}`);

  return db
    .select({
      id: tasks.id,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      figmaUrl: tasks.figmaUrl,
      documentId: tasks.documentId,
      documentTitle: documents.title,
      assigneeId: tasks.assigneeId,
      assigneeName: members.name,
      assigneeColor: members.color,
      projectId: tasks.projectId,
      projectName: projects.name,
      projectColor: projects.color,
      sortOrder: tasks.sortOrder,
      completedAt: tasks.completedAt,
      updatedAt: tasks.updatedAt,
    })
    .from(tasks)
    .leftJoin(members, eq(members.id, tasks.assigneeId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .leftJoin(documents, eq(documents.id, tasks.documentId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(sql`${tasks.dueDate} asc nulls last`, asc(tasks.sortOrder), asc(tasks.createdAt))
    .limit(opts.limit ?? 1000);
}

export type TaskRow = Awaited<ReturnType<typeof listTasks>>[number];

/** 프로젝트별 태스크 진행률 */
export async function projectProgress(): Promise<Map<string, { total: number; done: number }>> {
  const rows = await db
    .select({
      projectId: tasks.projectId,
      total: sql<number>`count(*)::int`,
      done: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(tasks)
    .groupBy(tasks.projectId);
  return new Map(rows.filter((r) => r.projectId).map((r) => [r.projectId!, { total: r.total, done: r.done }]));
}

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

