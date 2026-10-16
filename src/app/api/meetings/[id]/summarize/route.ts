import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { meetings, members, projects } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { AiError, generateMinutes } from "@/lib/ai";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/utils";

// 긴 회의록 요약은 수십 초 이상 걸릴 수 있으므로 함수 실행 시간을 늘림 (Vercel Fluid compute 기준)
export const maxDuration = 300;

export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const [row] = await db
    .select({ meeting: meetings, projectName: projects.name })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .where(eq(meetings.id, id))
    .limit(1);
  if (!row) return NextResponse.json({ error: "회의록을 찾을 수 없습니다." }, { status: 404 });
  const { meeting } = row;

  if (!meeting.rawNotes.trim()) return NextResponse.json({ error: "요약할 회의 원문이 없습니다." }, { status: 400 });
  const recentlyStarted = Date.now() - meeting.updatedAt.getTime() < maxDuration * 1000;
  if (meeting.status === "summarizing" && recentlyStarted) {
    return NextResponse.json({ error: "다른 팀원이 이미 AI 정리를 실행 중입니다. 잠시 후 새로고침하세요." }, { status: 409 });
  }

  await db.update(meetings).set({ status: "summarizing", errorMessage: null, updatedAt: new Date() }).where(eq(meetings.id, id));

  try {
    const teamMembers = (await db.select({ name: members.name }).from(members)).map((m) => m.name);
    const minutes = await generateMinutes({
      title: meeting.title,
      meetingDate: meeting.meetingDate,
      projectName: row.projectName,
      attendees: meeting.attendees,
      teamMembers,
      rawNotes: meeting.rawNotes,
    });
    // 다시 정리하는 경우, 이미 일정에 등록된 액션 아이템(같은 할 일)의 연결을 유지
    const linked = new Map((meeting.minutes?.actionItems ?? []).filter((a) => a.eventId).map((a) => [a.task.trim(), a.eventId]));
    minutes.actionItems = minutes.actionItems.map((a) => ({ ...a, eventId: linked.get(a.task.trim()) ?? null }));
    await db
      .update(meetings)
      .set({
        minutes,
        title: minutes.title || meeting.title,
        status: "ready",
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, id));
    await logActivity({ actorId: user.id, verb: "AI로 회의록을 정리했습니다", targetType: "meeting", targetId: id, targetTitle: minutes.title, projectId: meeting.projectId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("회의록 요약 실패:", err);
    const message = err instanceof AiError ? err.message : "AI 정리 중 알 수 없는 오류가 발생했습니다.";
    await db
      .update(meetings)
      .set({ status: meeting.minutes ? "ready" : "error", errorMessage: message, updatedAt: new Date() })
      .where(eq(meetings.id, id));
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
