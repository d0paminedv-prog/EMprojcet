import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/** 팀원 (최대 5명 내외의 소규모 팀을 가정) */
export const members = pgTable("members", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  role: text("role").notNull().default(""),
  email: text("email").notNull().default(""),
  color: text("color").notNull().default("#6366f1"),
  passwordHash: text("password_hash"),
  /** 비밀번호 변경/초기화 시 증가시켜 기존 세션을 무효화 */
  sessionVersion: integer("session_version").notNull().default(1),
  createdAt: createdAt(),
});

/** 브랜드 체험마케팅 프로젝트 (팝업스토어, 샘플링, 체험단 등) */
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

/** 공유 문서: 업로드 파일(Word/PDF/이미지 등), Figma 링크, 일반 링크 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    kind: text("kind").notNull(), // file | figma | link
    category: text("category").notNull().default("etc"),
    url: text("url"),
    description: text("description").notNull().default(""),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("documents_project_idx").on(t.projectId)],
);

/** 업로드 파일의 버전 이력 (Word 문서를 수정해 새 버전으로 올리는 흐름) */
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

export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => members.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("comments_doc_idx").on(t.documentId)],
);

/** 일정: 회의, 마감, 행사일, 촬영, 할 일 등 */
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
    done: boolean("done").notNull().default(false),
    meetingId: uuid("meeting_id"),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("events_start_idx").on(t.startAt), index("events_project_idx").on(t.projectId)],
);

export type MinutesActionItem = {
  task: string;
  owner: string;
  dueDate: string; // YYYY-MM-DD 또는 ""
  eventId?: string | null; // 일정으로 등록된 경우
};

export type Minutes = {
  title: string;
  summary: string;
  agenda: string[];
  discussions: { topic: string; points: string[] }[];
  decisions: string[];
  actionItems: MinutesActionItem[];
  openIssues: string[];
  nextMeeting: string;
};

/** 회의록: 정리되지 않은 원문 + AI가 구조화한 회의록 */
export const meetings = pgTable(
  "meetings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    meetingDate: date("meeting_date").notNull(),
    attendees: jsonb("attendees").$type<string[]>().notNull().default([]),
    rawNotes: text("raw_notes").notNull().default(""),
    minutes: jsonb("minutes").$type<Minutes>(),
    status: text("status").notNull().default("draft"), // draft | summarizing | ready | error
    errorMessage: text("error_message"),
    createdBy: uuid("created_by").references(() => members.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meetings_project_idx").on(t.projectId)],
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

export type Member = typeof members.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type Comment = typeof comments.$inferSelect;
export type CalendarEvent = typeof events.$inferSelect;
export type Meeting = typeof meetings.$inferSelect;
export type Activity = typeof activities.$inferSelect;
