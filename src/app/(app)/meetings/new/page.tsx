import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { aiConfigured } from "@/lib/ai";
import { todayKey } from "@/lib/dates";
import { memberOptions, projectOptions } from "@/lib/queries";
import { NewMeetingForm } from "./new-meeting-form";

export const metadata: Metadata = { title: "새 회의록" };

export default async function NewMeetingPage({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
  const { project } = await searchParams;
  const [projects, members] = await Promise.all([projectOptions(), memberOptions()]);
  return (
    <div>
      <PageHeader title="새 회의록" description="정리되지 않은 회의 메모를 붙여넣으면 AI가 공유용 회의록으로 정리합니다." />
      <NewMeetingForm
        projects={projects}
        members={members}
        defaultProjectId={projects.some((p) => p.id === project) ? project! : ""}
        today={todayKey()}
        aiReady={aiConfigured()}
      />
    </div>
  );
}
