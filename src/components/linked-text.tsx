import Link from "next/link";
import { ExternalLink, FileText } from "lucide-react";
import { findUrls, parseAppLink, type AppLink } from "@/lib/links";

/** 문서 ID → 제목 (글 속 앱 링크를 제목으로 보여 주기 위해 서버에서 미리 조회) */
export type DocTitles = Record<string, string>;

function appLinkLabel(link: AppLink, titles: DocTitles): string {
  if (!link.documentId) return link.path;
  const title = titles[link.documentId];
  if (!title) return "삭제되었거나 없는 문서";
  return `${title}${link.at ? " › 공유 위치" : link.page ? ` · ${link.page}쪽` : ""}`;
}

/** 글 속 주소를 누를 수 있는 링크로. 이 앱의 문서 주소는 문서 제목으로 표시 */
export function LinkedText({ text, origin, titles }: { text: string; origin: string; titles: DocTitles }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const found of findUrls(text)) {
    if (found.start > last) parts.push(text.slice(last, found.start));
    const app = parseAppLink(found.url, origin);
    parts.push(
      app ? (
        <Link key={found.start} href={app.path} className="inline-flex max-w-full items-center gap-0.5 rounded bg-brand-50 px-1 align-baseline text-brand-700 hover:underline" data-testid="app-link">
          <FileText className="h-3 w-3 shrink-0" />
          <span className="truncate">{appLinkLabel(app, titles)}</span>
        </Link>
      ) : (
        <a key={found.start} href={found.url} target="_blank" rel="noopener noreferrer" className="break-all text-brand-600 underline">
          {found.url}
        </a>
      ),
    );
    last = found.end;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** 글 속 링크만 버튼으로 모아 보여 줌 (태스크 설명처럼 입력칸 안에 있는 글용) */
export function LinkChips({ text, origin, titles }: { text: string; origin: string; titles: DocTitles }) {
  const links = findUrls(text);
  if (!links.length) return null;
  return (
    <div className="mb-4" data-testid="link-chips">
      <p className="mb-1.5 text-xs font-medium text-gray-500">설명 속 링크</p>
      <div className="flex flex-wrap gap-1.5">
        {links.map((found) => {
          const app = parseAppLink(found.url, origin);
          return app ? (
            <Link key={found.start} href={app.path} className="btn-secondary btn-sm max-w-full">
              <FileText className="h-3.5 w-3.5 shrink-0 text-blue-500" />
              <span className="truncate">{appLinkLabel(app, titles)}</span>
            </Link>
          ) : (
            <a key={found.start} href={found.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm max-w-full">
              <ExternalLink className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{found.url.replace(/^https?:\/\//, "")}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
