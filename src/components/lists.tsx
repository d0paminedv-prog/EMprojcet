import Link from "next/link";
import { CheckCircle2, Circle, ExternalLink, FileText, Link2, MapPin, NotebookPen, Sparkles } from "lucide-react";
import type { ActivityRow, DocumentRow, EventRow, MeetingRow } from "@/lib/data";
import { activityHref } from "@/lib/activity";
import { DOC_CATEGORIES, EVENT_TYPES, optionColor, optionLabel } from "@/lib/constants";
import { formatDate, formatRelative, formatShortDate, formatTime, toDateKey } from "@/lib/dates";
import { cn, fileExtension, formatBytes } from "@/lib/utils";
import { Avatar, Badge, Dot, EmptyState } from "./ui";
import { FigmaLogo } from "./figma-logo";

export function DocIcon({ kind, fileName }: { kind: string; fileName?: string | null }) {
  if (kind === "figma") return <FigmaLogo />;
  if (kind === "link") return <Link2 className="h-4 w-4 text-sky-500" />;
  const ext = fileName ? fileExtension(fileName) : "";
  const color =
    ext === "docx" || ext === "doc"
      ? "text-blue-600"
      : ext === "pdf"
        ? "text-red-500"
        : ext === "pptx" || ext === "ppt"
          ? "text-orange-500"
          : ext === "xlsx" || ext === "xls" || ext === "csv"
            ? "text-emerald-600"
            : "text-gray-500";
  return <FileText className={cn("h-4 w-4", color)} />;
}

export function DocumentList({ docs, showProject = true }: { docs: DocumentRow[]; showProject?: boolean }) {
  if (!docs.length) return <EmptyState title="등록된 문서가 없습니다" description="Word 문서, PDF, Figma 링크 등을 올려 팀과 공유하세요." />;
  return (
    <ul className="divide-y divide-gray-100">
      {docs.map((d) => (
        <li key={d.id}>
          <Link href={`/documents/${d.id}`} className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-50">
              <DocIcon kind={d.kind} fileName={d.latest?.fileName} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-gray-900">{d.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                <span>{optionLabel(DOC_CATEGORIES, d.category)}</span>
                {d.latest && (
                  <span>
                    v{d.latest.version} · {fileExtension(d.latest.fileName).toUpperCase()} · {formatBytes(d.latest.size)}
                  </span>
                )}
                {d.kind === "figma" && <span>Figma</span>}
                {showProject && d.projectName && (
                  <span className="inline-flex items-center gap-1">
                    <Dot color={d.projectColor ?? "#6b7280"} />
                    {d.projectName}
                  </span>
                )}
              </span>
            </span>
            <span className="hidden shrink-0 text-right text-xs text-gray-400 sm:block">
              {d.createdByName && <span className="block">{d.createdByName}</span>}
              <span>{formatRelative(d.updatedAt)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function eventTimeLabel(e: Pick<EventRow, "startAt" | "endAt" | "allDay">): string {
  const startKey = toDateKey(e.startAt);
  const endKey = e.endAt ? toDateKey(e.endAt) : startKey;
  if (e.allDay) {
    return startKey === endKey ? `${formatShortDate(e.startAt)} 종일` : `${formatShortDate(e.startAt)} ~ ${formatShortDate(e.endAt!)}`;
  }
  if (!e.endAt) return `${formatShortDate(e.startAt)} ${formatTime(e.startAt)}`;
  if (startKey === endKey) return `${formatShortDate(e.startAt)} ${formatTime(e.startAt)} ~ ${formatTime(e.endAt)}`;
  return `${formatShortDate(e.startAt)} ${formatTime(e.startAt)} ~ ${formatShortDate(e.endAt)} ${formatTime(e.endAt)}`;
}

export function EventList({
  events,
  members,
  showProject = true,
  emptyText = "예정된 일정이 없습니다",
}: {
  events: EventRow[];
  members: { id: string; name: string; color: string }[];
  showProject?: boolean;
  emptyText?: string;
}) {
  if (!events.length) return <EmptyState title={emptyText} />;
  const byId = new Map(members.map((m) => [m.id, m]));
  return (
    <ul className="divide-y divide-gray-100">
      {events.map((e) => {
        const assignees = e.assigneeIds.map((id) => byId.get(id)).filter((m): m is NonNullable<typeof m> => !!m);
        return (
          <li key={e.id}>
            <Link href={`/schedule?month=${toDateKey(e.startAt).slice(0, 7)}&event=${e.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
              <span className="mt-1.5">
                {e.type === "task" ? (
                  e.done ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Circle className="h-4 w-4 text-gray-300" />
                ) : (
                  <Dot color={optionColor(EVENT_TYPES, e.type)} className="h-2.5 w-2.5" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm font-medium", e.done ? "text-gray-400 line-through" : "text-gray-900")}>{e.title}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                  <span>{eventTimeLabel(e)}</span>
                  <Badge color={optionColor(EVENT_TYPES, e.type)}>{optionLabel(EVENT_TYPES, e.type)}</Badge>
                  {e.location && (
                    <span className="inline-flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {e.location}
                    </span>
                  )}
                  {showProject && e.projectName && (
                    <span className="inline-flex items-center gap-1">
                      <Dot color={e.projectColor ?? "#6b7280"} />
                      {e.projectName}
                    </span>
                  )}
                </span>
              </span>
              {assignees.length > 0 && (
                <span className="flex shrink-0 -space-x-1.5">
                  {assignees.map((m) => (
                    <Avatar key={m.id} name={m.name} color={m.color} size="sm" />
                  ))}
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export const MEETING_STATUS: Record<string, { label: string; color: string }> = {
  draft: { label: "원문만 저장", color: "#6b7280" },
  summarizing: { label: "AI 정리 중", color: "#f59e0b" },
  ready: { label: "회의록 완료", color: "#10b981" },
  error: { label: "정리 실패", color: "#ef4444" },
};

export function MeetingList({ meetings, showProject = true }: { meetings: MeetingRow[]; showProject?: boolean }) {
  if (!meetings.length)
    return <EmptyState title="회의록이 없습니다" description="회의 메모를 붙여넣으면 AI가 회의록으로 정리해 드립니다." />;
  return (
    <ul className="divide-y divide-gray-100">
      {meetings.map((m) => {
        const status = MEETING_STATUS[m.status] ?? MEETING_STATUS.draft;
        return (
          <li key={m.id}>
            <Link href={`/meetings/${m.id}`} className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-gray-50">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-50">
                {m.status === "ready" ? <Sparkles className="h-4 w-4 text-violet-500" /> : <NotebookPen className="h-4 w-4 text-violet-400" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-gray-900">{m.title}</span>
                  <Badge color={status.color} className="shrink-0">
                    {status.label}
                  </Badge>
                </span>
                {m.summary && <span className="mt-0.5 line-clamp-1 block text-xs text-gray-600">{m.summary}</span>}
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                  <span>{formatDate(m.meetingDate)}</span>
                  {m.attendees.length > 0 && <span>참석 {m.attendees.length}명</span>}
                  {m.actionCount > 0 && <span>액션 {m.actionCount}건</span>}
                  {showProject && m.projectName && (
                    <span className="inline-flex items-center gap-1">
                      <Dot color={m.projectColor ?? "#6b7280"} />
                      {m.projectName}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export function ActivityFeed({ items }: { items: ActivityRow[] }) {
  if (!items.length) return <EmptyState title="아직 활동이 없습니다" />;
  return (
    <ul className="space-y-3">
      {items.map((a) => {
        const href = activityHref(a.targetType, a.targetId);
        return (
          <li key={a.id} className="flex items-start gap-2.5 text-sm">
            <Avatar name={a.actorName ?? "?"} color={a.actorColor ?? "#9ca3af"} size="sm" />
            <p className="min-w-0 flex-1 text-gray-600">
              <b className="font-medium text-gray-900">{a.actorName ?? "알 수 없음"}</b>님이 {a.verb}
              <span className="block truncate">
                {href ? (
                  <Link href={href} className="font-medium text-gray-900 hover:text-brand-600">
                    {a.targetTitle}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-900">{a.targetTitle}</span>
                )}
                <span className="ml-1.5 text-xs text-gray-400">{formatRelative(a.createdAt)}</span>
              </span>
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function ExternalLinkIcon() {
  return <ExternalLink className="h-3.5 w-3.5" />;
}
