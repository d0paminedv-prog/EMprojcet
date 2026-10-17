import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { memberOptions } from "@/lib/queries";
import { createProject } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "새 프로젝트" };

export default async function NewProjectPage() {
  const user = await requireUser();
  const members = await memberOptions();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="새 프로젝트" description="브랜드 체험마케팅 캠페인을 등록하고 문서·일정·회의록을 한곳에서 관리하세요." />
      <ProjectForm action={createProject} members={members} defaultOwnerId={user.id} submitLabel="프로젝트 만들기" />
    </div>
  );
}
