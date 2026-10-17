import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { projectOptions } from "@/lib/queries";
import { blobAccess, storageMode, storageReady } from "@/lib/storage";
import { docTemplates } from "@/lib/templates";
import { NewDocumentForm } from "./new-document-form";

export const metadata: Metadata = { title: "새 문서" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ project?: string; kind?: string }> }) {
  const { project, kind } = await searchParams;
  const projects = await projectOptions();
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="새 문서" description="팀이 함께 편집하는 실시간 문서를 만들거나, 파일·Figma 링크를 공유하세요." />
      <NewDocumentForm
        projects={projects}
        defaultProjectId={projects.some((p) => p.id === project) ? project! : ""}
        defaultKind={kind === "figma" || kind === "link" || kind === "file" ? kind : "live"}
        templates={docTemplates().map(({ id, label, category }) => ({ id, label, category }))}
        storage={{ mode: storageMode(), access: blobAccess(), ready: storageReady() }}
      />
    </div>
  );
}
