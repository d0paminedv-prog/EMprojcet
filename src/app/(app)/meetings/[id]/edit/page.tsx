import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { meetings } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { memberOptions, projectOptions } from "@/lib/queries";
import { isUuid } from "@/lib/utils";
import { MinutesEditor } from "./minutes-editor";

export const metadata: Metadata = { title: "회의록 편집" };

export default async function EditMeetingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [meeting] = await db.select().from(meetings).where(eq(meetings.id, id)).limit(1);
  if (!meeting) notFound();
  const [projects, members] = await Promise.all([projectOptions(), memberOptions()]);

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="회의록 편집" description="AI가 정리한 내용을 팀 기준에 맞게 다듬으세요." />
      <MinutesEditor
        meetingId={meeting.id}
        initial={{
          title: meeting.title,
          meetingDate: meeting.meetingDate,
          projectId: meeting.projectId ?? "",
          attendees: meeting.attendees,
          rawNotes: meeting.rawNotes,
          minutes: meeting.minutes,
        }}
        projects={projects}
        members={members}
      />
    </div>
  );
}
