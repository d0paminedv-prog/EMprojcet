import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { projectOptions } from "@/lib/queries";
import { blobAccess, storageMode, storageReady } from "@/lib/storage";
import { NewDocumentForm } from "./new-document-form";

export const metadata: Metadata = { title: "문서 추가" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ project?: string; kind?: string }> }) {
  const { project, kind } = await searchParams;
  const projects = await projectOptions();
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="문서 추가" description="Word·PDF 파일을 올리거나 Figma 디자인 링크를 공유하세요." />
      <NewDocumentForm
        projects={projects}
        defaultProjectId={projects.some((p) => p.id === project) ? project! : ""}
        defaultKind={kind === "figma" || kind === "link" ? kind : "file"}
        storage={{ mode: storageMode(), access: blobAccess(), ready: storageReady() }}
      />
    </div>
  );
}
