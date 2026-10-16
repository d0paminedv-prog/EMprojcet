import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { meetings, members, projects } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { buildMinutesDocx } from "@/lib/minutes-docx";
import { isUuid } from "@/lib/utils";

/** 회의록 Word(.docx) 다운로드 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });

  const [row] = await db
    .select({ meeting: meetings, projectName: projects.name, authorName: members.name })
    .from(meetings)
    .leftJoin(projects, eq(projects.id, meetings.projectId))
    .leftJoin(members, eq(members.id, meetings.createdBy))
    .where(eq(meetings.id, id))
    .limit(1);
  if (!row?.meeting.minutes) return NextResponse.json({ error: "정리된 회의록이 없습니다." }, { status: 404 });

  const { meeting } = row;
  const buffer = await buildMinutesDocx(meeting.minutes!, {
    meetingDate: meeting.meetingDate,
    projectName: row.projectName,
    attendees: meeting.attendees,
    author: row.authorName,
  });
  const fileName = encodeURIComponent(`${meeting.meetingDate}_${meeting.minutes!.title}.docx`.replace(/[\\/:*?"<>|]/g, "_"));
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`,
      "Cache-Control": "no-store",
    },
  });
}
