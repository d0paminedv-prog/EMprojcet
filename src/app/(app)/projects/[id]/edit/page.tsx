import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { projects } from "@/db/schema";
import { ConfirmButton } from "@/components/form-controls";
import { PageHeader } from "@/components/ui";
import { memberOptions } from "@/lib/queries";
import { isUuid } from "@/lib/utils";
import { deleteProject, updateProject } from "../../actions";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = { title: "프로젝트 수정" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) notFound();
  const members = await memberOptions();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="프로젝트 수정"
        description={project.name}
        actions={
          <form action={deleteProject.bind(null, project.id)}>
            <ConfirmButton message="프로젝트와 연결된 문서·일정·회의록이 모두 삭제됩니다. 계속할까요?">프로젝트 삭제</ConfirmButton>
          </form>
        }
      />
      <ProjectForm action={updateProject.bind(null, project.id)} project={project} members={members} submitLabel="저장" />
    </div>
  );
}
