import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** 팀원 — 입장 코드 확인 후 본인 이름을 입력하면 생성/선택됩니다. */
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  role: text("role").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: createdAt(),
});

/** 브랜드 체험마케팅 프로젝트 */
export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  brand: text("brand").notNull().default(""),
  category: text("category").notNull().default("popup"),
  status: text("status").notNull().default("planning"),
  startDate: date("start_date"),
  endDate: date("end_date"),
  venue: text("venue").notNull().default(""),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  ownerId: uuid("owner_id").references(() => members.id, { onDelete: "set null" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export type FigmaMeta = {
  name: string;
  lastModified: string | null;
  thumbnailUrl: string | null;
  fetchedAt: string;
};

/**
 * 문서
 * - live : 실시간 공동 편집 문서 (본문은 Liveblocks에 저장되고, 최신 사본을 content 에 보관)
 * - file : 업로드 파일 (Word/PDF/이미지 등, 버전 관리)
 * - figma: Figma 공유 링크
 * - link : 일반 링크
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull(),
    category: text("category").notNull().default("etc"),
    url: text("url"),
    description: text("description").notNull().default(""),
    figmaMeta: jsonb("figma_meta").$type<FigmaMeta>(),
    content: jsonb("content").$type<Record<string, unknown>>(),
    contentText: text("content_text").notNull().default(""),
    initialHtml: text("initial_html"),
    lastEditedBy: uuid("last_edited_by").references(() => members.id, { onDelete: "set null" }),
    lastEditedAt: timestamp("last_edited_at", { withTimezone: true }),
    /** 단독 편집 모드(실시간 연결이 안 될 때 한 명씩 편집): 지금 편집 권한을 가진 팀원과 만료 시각 */
    soloBy: uuid("solo_by").references(() => members.id, { onDelete: "set null" }),
    soloUntil: timestamp("solo_until", { withTimezone: true }),
    /** 단독 편집한 내용이 아직 실시간 문서에 반영되지 않음 (다음에 실시간으로 연 사람이 반영) */
    soloEditedAt: timestamp("solo_edited_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("documents_project_idx").on(t.projectId)],
);

/** 업로드 파일의 버전 이력 */
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull().default("application/octet-stream"),
    size: integer("size").notNull().default(0),
    storage: text("storage").notNull(), // blob | local
    storageKey: text("storage_key").notNull(),
    note: text("note").notNull().default(""),
    uploadedBy: uuid("uploaded_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("document_versions_doc_idx").on(t.documentId)],
);

/** 실시간 문서의 저장 버전(스냅샷) */
export const documentSnapshots = pgTable(
  "document_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    label: text("label").notNull().default(""),
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    contentText: text("content_text").notNull().default(""),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("document_snapshots_doc_idx").on(t.documentId)],
);

/** 문서 본문에 들어가는 이미지 등 첨부 파일 */
export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull().default(0),
  storage: text("storage").notNull(),
  storageKey: text("storage_key").notNull(),
  createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
  createdAt: createdAt(),
});

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => members.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    /** 답글이면 원 코멘트 */
    parentId: uuid("parent_id").references((): AnyPgColumn => comments.id, { onDelete: "cascade" }),
    /** 실시간 문서 안 위치 코드 (선택한 글에 단 코멘트). 없으면 문서 전체 의견 */
    anchor: text("anchor"),
    /** 코멘트를 단 글 (앞부분) */
    quote: text("quote"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("comments_doc_idx").on(t.documentId), index("comments_parent_idx").on(t.parentId)],
);

/** 팀원별 할 일(태스크) */
export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("todo"), // todo | doing | review | done
    priority: text("priority").notNull().default("normal"), // low | normal | high
    assigneeId: uuid("assignee_id").references(() => members.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    figmaUrl: text("figma_url"),
    documentId: uuid("document_id").references(() => documents.id, { onDelete: "set null" }),
    sortOrder: doublePrecision("sort_order").notNull().default(0),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("tasks_assignee_idx").on(t.assigneeId), index("tasks_project_idx").on(t.projectId)],
);

/** 일정: 회의, 마감, 행사 운영, 촬영, 설치·철수 등 */
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    type: text("type").notNull().default("meeting"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    location: text("location").notNull().default(""),
    description: text("description").notNull().default(""),
    assigneeIds: jsonb("assignee_ids").$type<string[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_start_idx").on(t.startAt), index("events_project_idx").on(t.projectId)],
);

/** 팀 활동 피드 */
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: uuid("actor_id").references(() => members.id, { onDelete: "set null" }),
    verb: text("verb").notNull(),
    targetType: text("target_type").notNull(),
    targetId: uuid("target_id"),
    targetTitle: text("target_title").notNull().default(""),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("activities_created_idx").on(t.createdAt)],
);

/**
 * 팀원 실시간 활동 — 열린 탭마다 한 줄. 탭이 20초마다 보내는 신호로 갱신(앱 서버, Liveblocks 미사용).
 * 접속 표시용이라 하루 지난 줄은 지움
 */
export const presence = pgTable(
  "presence",
  {
    tabId: text("tab_id").primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => members.id, { onDelete: "cascade" }),
    /** 화면·제목·하는 일·입력 중·자리 비움·문서 안 위치 (TeamPresence) */
    state: jsonb("state").$type<Record<string, unknown>>().notNull(),
    updatedAt: updatedAt(),
    /** 이 탭에서 데이터를 마지막으로 바꾼 시각 — 다른 탭은 이보다 오래된 화면이면 새로고침 */
    changedAt: timestamp("changed_at", { withTimezone: true }),
    /** 탭을 닫음 */
    goneAt: timestamp("gone_at", { withTimezone: true }),
  },
  (t) => [index("presence_updated_idx").on(t.updatedAt)],
);

/** 입장 코드 연속 실패 제한 (IP 기준) */
export const entryAttempts = pgTable("entry_attempts", {
  key: text("key").primaryKey(),
  failures: integer("failures").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
});

export type Member = typeof members.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type DocumentSnapshot = typeof documentSnapshots.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type Task = typeof tasks.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Activity = typeof activities.$inferSelect;
