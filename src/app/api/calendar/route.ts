import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { EVENT_TYPES, optionLabel } from "@/lib/constants";
import { listEvents, listTasks } from "@/lib/data";
import { addDays, toDateKey } from "@/lib/dates";

function escape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** 팀 일정을 iCalendar(.ics)로 내보내기 → Google 캘린더/Outlook/애플 캘린더에서 가져오기 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const from = new Date(Date.now() - 90 * 86400000);
  const rows = await listEvents({ from, limit: 2000 });
  const now = utcStamp(new Date());

  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BX Hub//KO", "CALSCALE:GREGORIAN", "X-WR-CALNAME:BX Hub 팀 일정", "X-WR-TIMEZONE:Asia/Seoul"];
  for (const e of rows) {
    lines.push("BEGIN:VEVENT", `UID:${e.id}@bx-hub`, `DTSTAMP:${now}`);
    if (e.allDay) {
      const start = toDateKey(e.startAt);
      const end = addDays(e.endAt ? toDateKey(e.endAt) : start, 1);
      lines.push(`DTSTART;VALUE=DATE:${start.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${end.replace(/-/g, "")}`);
    } else {
      lines.push(`DTSTART:${utcStamp(e.startAt)}`, `DTEND:${utcStamp(e.endAt ?? new Date(e.startAt.getTime() + 3600000))}`);
    }
    const summary = `[${optionLabel(EVENT_TYPES, e.type)}] ${e.title}${e.projectName ? ` (${e.projectName})` : ""}`;
    lines.push(`SUMMARY:${escape(summary)}`);
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    lines.push("END:VEVENT");
  }
  // 마감일이 있는 미완료 태스크도 종일 항목으로 포함
  const openTasks = await listTasks({ openOnly: true });
  for (const t of openTasks) {
    if (!t.dueDate) continue;
    lines.push(
      "BEGIN:VEVENT",
      `UID:task-${t.id}@bx-hub`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${t.dueDate.replace(/-/g, "")}`,
      `DTEND;VALUE=DATE:${addDays(t.dueDate, 1).replace(/-/g, "")}`,
      `SUMMARY:${escape(`[태스크] ${t.title}${t.assigneeName ? ` - ${t.assigneeName}` : ""}`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="bx-hub-schedule.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
