import Link from "next/link";
import { after } from "next/server";
import type { DocumentRow } from "@/lib/data";
import { formatRelative } from "@/lib/dates";
import { refreshFigmaDocs } from "@/lib/figma";
import { FigmaLogo } from "./figma-logo";
import { EmptyState } from "./ui";

/** 프로젝트의 Figma 디자인 모아보기 (FIGMA_TOKEN 이 있으면 썸네일·수정 시각 표시) */
export function FigmaGallery({ docs }: { docs: DocumentRow[] }) {
  after(() => refreshFigmaDocs(docs));
  if (!docs.length) return <EmptyState title="연결된 Figma 디자인이 없습니다" description="Figma 공유 링크를 등록하면 여기에서 시안을 모아 볼 수 있습니다." />;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {docs.map((d) => (
        <Link key={d.id} href={`/documents/${d.id}`} className="group overflow-hidden rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm">
          <div className="flex aspect-[16/10] items-center justify-center overflow-hidden bg-gray-50">
            {d.figmaMeta?.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.figmaMeta.thumbnailUrl} alt="" className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
            ) : (
              <FigmaLogo className="h-8 w-8 opacity-80" />
            )}
          </div>
          <div className="p-2.5">
            <p className="truncate text-sm font-medium text-gray-900">{d.title}</p>
            <p className="truncate text-[11px] text-gray-500">
              {d.figmaMeta?.lastModified ? `Figma 수정 ${formatRelative(new Date(d.figmaMeta.lastModified))}` : d.figmaMeta?.name || "Figma"}
            </p>
          </div>
        </Link>
      ))}
    </div>
  );
}
