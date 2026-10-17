import { db } from "@/db";
import { activities } from "@/db/schema";

export async function logActivity(input: {
  actorId: string;
  verb: string;
  targetType: "project" | "document" | "event" | "task" | "comment" | "member";
  targetId?: string | null;
  targetTitle?: string;
  projectId?: string | null;
}) {
  try {
    await db.insert(activities).values({
      actorId: input.actorId,
      verb: input.verb,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      targetTitle: input.targetTitle ?? "",
      projectId: input.projectId ?? null,
    });
  } catch (err) {
    // 활동 기록 실패가 본 작업을 막지 않도록
    console.warn("활동 기록 실패:", err);
  }
}

export function activityHref(targetType: string, targetId: string | null): string | null {
  if (!targetId) return null;
  switch (targetType) {
    case "project":
      return `/projects/${targetId}`;
    case "document":
    case "comment":
      return `/documents/${targetId}`;
    case "task":
      return `/tasks?task=${targetId}`;
    case "event":
      return `/schedule?event=${targetId}`;
    default:
      return null;
  }
}
