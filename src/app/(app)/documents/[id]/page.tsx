import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import mammoth from "mammoth";
import { Download, ExternalLink, Pencil } from "lucide-react";
import { db } from "@/db";
import { comments, documentSnapshots, documents, documentVersions, members, projects, type DocumentVersion } from "@/db/schema";
import { ConfirmButton } from "@/components/form-controls";
import { HereNow } from "@/components/realtime";
import { DocIcon } from "@/components/lists";
import { Badge, Card, Dot, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { DOC_CATEGORIES, optionLabel } from "@/lib/constants";
import { formatDateTime, formatRelative } from "@/lib/dates";
import { decodeText } from "@/lib/convert";
import { isEditableFile, previewKind } from "@/lib/mime";
import { linkedDocumentTitles, projectOptions } from "@/lib/queries";
import { readFileBuffer, storageClientConfig } from "@/lib/storage";
import { figmaEmbedUrl, formatBytes, isUuid } from "@/lib/utils";
import { deleteDocument, updateDocument } from "../actions";
import { CommentsPanel, type CommentView } from "./comments-panel";
import { DocumentEditForm, InlineTitle, MakeEditableButton, VersionUploader } from "./doc-client";
import { PdfPageLink, ShareLinkButton } from "@/components/share-link";
import { isPositionCode, parsePageNumber } from "@/lib/links";
import { siteOrigin } from "@/lib/site";
import { DocEditor } from "./doc-editor";
import { after } from "next/server";
import { docRoomId } from "@/lib/liveblocks";
import { soloInfoOf } from "@/lib/solo";
import { figmaConfigured, refreshFigmaDocs } from "@/lib/figma";

/** 코멘트를 해결한 팀원 */
const resolver = alias(members, "resolver");

async function getDoc(id: string) {
  if (!isUuid(id)) return null;
  const [row] = await db
    .select({ doc: documents, projectName: projects.name, projectColor: projects.color, createdByName: members.name })
    .from(documents)
    .leftJoin(projects, eq(projects.id, documents.projectId))
    .leftJoin(members, eq(members.id, documents.createdBy))
    .where(eq(documents.id, id))
    .limit(1);
  return row ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: (await getDoc(id))?.doc.title ?? "문서" };
}

const PREVIEW_STYLE = `
  body{font-family:"Malgun Gothic","Apple SD Gothic Neo",sans-serif;line-height:1.7;color:#111827;max-width:820px;margin:0 auto;padding:32px 28px;font-size:14px}
  h1,h2,h3{line-height:1.35} table{border-collapse:collapse;width:100%;margin:12px 0} td,th{border:1px solid #d1d5db;padding:6px 8px;vertical-align:top}
  img{max-width:100%;height:auto} p{margin:0 0 10px}
`;

async function DocxPreview({ version }: { version: DocumentVersion }) {
  if (version.size > 15 * 1024 * 1024) return <Notice>파일이 커서 미리보기를 생략했습니다. 다운로드해서 확인하세요.</Notice>;
  const buffer = await readFileBuffer(version.storage, version.storageKey);
  if (!buffer) return <Notice tone="error">파일을 불러오지 못했습니다.</Notice>;
  let body: string;
  try {
    body = (await mammoth.convertToHtml({ buffer })).value || "<p>(내용 없음)</p>";
  } catch {
    return <Notice tone="warn">Word 문서를 미리보기로 변환하지 못했습니다. 다운로드해서 확인하세요.</Notice>;
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PREVIEW_STYLE}</style></head><body>${body}</body></html>`;
  // sandbox="" : 문서 안의 스크립트/폼/링크 이동을 모두 차단
  return <iframe title="Word 미리보기" srcDoc={html} sandbox="" className="h-[75vh] w-full rounded-lg border border-gray-200 bg-white" />;
}

async function TextPreview({ version }: { version: DocumentVersion }) {
  const buffer = await readFileBuffer(version.storage, version.storageKey);
  if (!buffer) return <Notice tone="error">파일을 불러오지 못했습니다.</Notice>;
  const text = decodeText(buffer.subarray(0, 300_000));
  return <pre className="max-h-[75vh] overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">{text}</pre>;
}

function FilePreview({ version, documentId, title, page }: { version: DocumentVersion; documentId: string; title: string; page: number | null }) {
  const src = `/api/files/${version.id}`;
  switch (previewKind(version.fileName)) {
    case "pdf":
      return (
        <>
          <PdfPageLink documentId={documentId} title={title} initialPage={page} />
          {/* 브라우저 PDF 보기의 #page= 로 해당 쪽부터 표시 */}
          <iframe key={page ?? 0} title="PDF 미리보기" src={page ? `${src}#page=${page}` : src} className="h-[75vh] w-full rounded-lg border border-gray-200" />
        </>
      );
    case "image":
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={src} alt={version.fileName} className="mx-auto max-h-[75vh] rounded-lg border border-gray-200" />;
    case "video":
      return <video src={src} controls className="max-h-[75vh] w-full rounded-lg bg-black" />;
    case "text":
      return <TextPreview version={version} />;
    case "docx":
      return <DocxPreview version={version} />;
    default:
      return (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-200 py-16 text-center">
          <DocIcon kind="file" fileName={version.fileName} />
          <p className="mt-2 text-sm font-medium text-gray-800">{version.fileName}</p>
          <p className="mt-1 text-sm text-gray-500">이 형식은 브라우저 미리보기를 지원하지 않습니다. 다운로드해서 여세요.</p>
          <a href={`${src}?download=1`} className="btn-primary mt-4">
            <Download className="h-4 w-4" />
            다운로드
          </a>
        </div>
      );
  }
}

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ at?: string; page?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const focusAt = isPositionCode(sp.at) ? sp.at : null;
  const pdfPage = parsePageNumber(sp.page);
  const user = await requireUser();
  const row = await getDoc(id);
  if (!row) notFound();
  const { doc } = row;

  const [versions, commentRows, projectList] = await Promise.all([
    db
      .select({ version: documentVersions, uploaderName: members.name })
      .from(documentVersions)
      .leftJoin(members, eq(members.id, documentVersions.uploadedBy))
      .where(eq(documentVersions.documentId, doc.id))
      .orderBy(desc(documentVersions.version)),
    db
      .select({ comment: comments, authorName: members.name, authorColor: members.color, resolverName: resolver.name })
      .from(comments)
      .leftJoin(members, eq(members.id, comments.authorId))
      .leftJoin(resolver, eq(resolver.id, comments.resolvedBy))
      .where(eq(comments.documentId, doc.id))
      .orderBy(asc(comments.createdAt)),
    projectOptions(),
  ]);
  const latest = versions[0]?.version;
  const storage = storageClientConfig();
  const origin = await siteOrigin();
  const linkTitles = await linkedDocumentTitles(commentRows.map((c) => c.comment.body), origin);
  if (doc.kind === "figma") after(() => refreshFigmaDocs([{ id: doc.id, url: doc.url, figmaMeta: doc.figmaMeta }]));

  const breadcrumb = (
    <div className="mb-2 text-sm text-gray-500">
      <Link href="/documents" className="hover:text-gray-900">
        문서
      </Link>
      {row.projectName && doc.projectId && (
        <>
          {" / "}
          <Link href={`/projects/${doc.projectId}`} className="inline-flex items-center gap-1 hover:text-gray-900">
            <Dot color={row.projectColor ?? "#6b7280"} />
            {row.projectName}
          </Link>
        </>
      )}
    </div>
  );

  // 코멘트 스레드 (원 코멘트 + 답글)
  const toView = ({ comment, authorName, authorColor, resolverName }: (typeof commentRows)[number]): CommentView => ({
    id: comment.id,
    authorId: comment.authorId,
    authorName: authorName ?? "알 수 없음",
    authorColor: authorColor ?? "#9ca3af",
    body: comment.body,
    createdLabel: formatDateTime(comment.createdAt),
    anchor: comment.anchor,
    quote: comment.quote,
    resolved: !!comment.resolvedAt,
    resolvedByName: resolverName,
    replies: [],
  });
  const threads = commentRows.filter((c) => !c.comment.parentId).map(toView);
  const byId = new Map(threads.map((t) => [t.id, t]));
  for (const c of commentRows) if (c.comment.parentId) byId.get(c.comment.parentId)?.replies.push(toView(c));

  const commentsCard = (
    <CommentsPanel documentId={doc.id} currentUserId={user.id} threads={threads} origin={origin} linkTitles={linkTitles} live={doc.kind === "live"} />
  );

  const infoCard = (
    <Card title={<span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />문서 정보 (자동 저장)</span>}>
      <DocumentEditForm
        action={updateDocument.bind(null, doc.id)}
        doc={{ kind: doc.kind, url: doc.url, category: doc.category, description: doc.description, projectId: doc.projectId }}
        projects={projectList}
      />
      <form action={deleteDocument.bind(null, doc.id)} className="mt-4 border-t border-gray-100 pt-4">
        <ConfirmButton message="문서와 모든 버전, 의견이 삭제됩니다. 계속할까요?" className="btn-danger btn-sm w-full">
          문서 삭제
        </ConfirmButton>
      </form>
    </Card>
  );

  if (doc.kind === "live") {
    const snapshots = await db
      .select({ id: documentSnapshots.id, label: documentSnapshots.label, createdAt: documentSnapshots.createdAt, createdByName: members.name })
      .from(documentSnapshots)
      .leftJoin(members, eq(members.id, documentSnapshots.createdBy))
      .where(eq(documentSnapshots.documentId, doc.id))
      .orderBy(desc(documentSnapshots.createdAt))
      .limit(50);
    const [editor] = doc.lastEditedBy ? await db.select({ name: members.name }).from(members).where(eq(members.id, doc.lastEditedBy)).limit(1) : [];
    return (
      <div>
        {breadcrumb}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
              <DocIcon kind="live" />
              <InlineTitle documentId={doc.id} title={doc.title} />
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
              <Badge className="bg-brand-50 text-brand-700">실시간 문서</Badge>
              <Badge className="bg-gray-100 text-gray-700">{optionLabel(DOC_CATEGORIES, doc.category)}</Badge>
              <span>
                {row.createdByName ?? "알 수 없음"} 작성
                {doc.lastEditedAt && ` · ${editor?.name ?? "알 수 없음"} ${formatRelative(doc.lastEditedAt)} 편집`}
              </span>
              {latest && (
                <a href={`/api/files/${latest.id}?download=1`} className="inline-flex items-center gap-1 text-brand-600 hover:underline" title="편집 문서로 열기 전 업로드한 원본 파일">
                  <Download className="h-3 w-3" />
                  원본 파일 {latest.fileName}
                </a>
              )}
            </div>
            {doc.description && <p className="mt-2 text-sm text-gray-600">{doc.description}</p>}
          </div>
          <ShareLinkButton documentId={doc.id} title={doc.title} className="shrink-0 self-start" />
        </div>
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-5">
          <DocEditor
            documentId={doc.id}
            title={doc.title}
            focusAt={focusAt}
            roomId={docRoomId(doc.id)}
            initialHtml={doc.content ? null : doc.initialHtml}
            lastSavedAt={doc.lastEditedAt?.toISOString() ?? null}
            snapshots={snapshots.map((s) => ({ id: s.id, label: s.label, createdAt: s.createdAt.toISOString(), createdByName: s.createdByName }))}
            storage={storage}
            commentAnchors={threads.filter((t) => t.anchor && !t.resolved).map((t) => ({ id: t.id, anchor: t.anchor! }))}
            solo={await soloInfoOf(doc)}
          />
          {/* 넓은 화면: 편집기 옆에 코멘트 고정 / 좁은 화면: 편집기 아래 */}
          <aside className="mt-6 xl:sticky xl:top-4 xl:mt-0 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">{commentsCard}</aside>
        </div>
        <div className="mt-6 max-w-2xl">{infoCard}</div>
      </div>
    );
  }

  return (
    <div>
      {breadcrumb}

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 sm:text-2xl">
            <DocIcon kind={doc.kind} fileName={latest?.fileName} />
            <InlineTitle documentId={doc.id} title={doc.title} />
          </h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
            <Badge className="bg-gray-100 text-gray-700">{optionLabel(DOC_CATEGORIES, doc.category)}</Badge>
            {latest && <span>v{latest.version} · {latest.fileName} · {formatBytes(latest.size)}</span>}
            <span>
              {row.createdByName ?? "알 수 없음"} 등록 · {formatRelative(doc.updatedAt)} 수정
            </span>
            <HereNow />
          </div>
          {doc.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{doc.description}</p>}
          {doc.kind === "figma" && (
            <p className="mt-2 text-xs text-gray-500">
              {doc.figmaMeta?.lastModified
                ? `Figma 파일 「${doc.figmaMeta.name}」 · 최종 수정 ${formatRelative(new Date(doc.figmaMeta.lastModified))}`
                : figmaConfigured()
                  ? "Figma 파일 정보를 불러오는 중이거나 접근 권한이 없습니다."
                  : "보려면 Figma에서 이 파일에 대한 열람 권한이 필요합니다."}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-start gap-2">
          {doc.kind === "file" && latest && isEditableFile(latest.fileName) && <MakeEditableButton documentId={doc.id} fileName={latest.fileName} />}
          <ShareLinkButton documentId={doc.id} title={doc.title} />
          {latest && (
            <a href={`/api/files/${latest.id}?download=1`} className={doc.kind === "file" && isEditableFile(latest.fileName) ? "btn-secondary" : "btn-primary"}>
              <Download className="h-4 w-4" />
              다운로드
            </a>
          )}
          {doc.url && (
            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
              <ExternalLink className="h-4 w-4" />
              {doc.kind === "figma" ? "Figma에서 열기" : "새 탭에서 열기"}
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-6">
          <section className="card p-3">
            {doc.kind === "figma" && doc.url && (
              <iframe
                title="Figma 미리보기"
                src={figmaEmbedUrl(doc.url)}
                allowFullScreen
                className="h-[75vh] w-full rounded-lg border border-gray-200 bg-gray-50"
              />
            )}
            {doc.kind === "link" && doc.url && (
              <div className="p-4">
                <p className="text-sm text-gray-500">외부 링크</p>
                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all font-medium text-brand-600 hover:underline">
                  {doc.url}
                </a>
              </div>
            )}
            {doc.kind === "file" && (latest ? <FilePreview version={latest} documentId={doc.id} title={doc.title} page={pdfPage} /> : <Notice tone="warn">업로드된 파일이 없습니다.</Notice>)}
          </section>

          {commentsCard}
        </div>

        <aside className="space-y-6">
          {doc.kind === "file" && (
            <Card title={`버전 기록 (${versions.length})`}>
              <ul className="mb-4 space-y-3">
                {versions.map(({ version: v, uploaderName }) => (
                  <li key={v.id} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">
                        v{v.version}
                        {v.id === latest?.id && <span className="ml-1.5 text-xs font-normal text-emerald-600">최신</span>}
                      </span>
                      <a href={`/api/files/${v.id}?download=1`} className="text-xs text-brand-600 hover:underline">
                        다운로드
                      </a>
                    </div>
                    <p className="truncate text-xs text-gray-500" title={v.fileName}>
                      {v.fileName} · {formatBytes(v.size)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {uploaderName ?? "알 수 없음"} · {formatDateTime(v.createdAt)}
                    </p>
                    {v.note && <p className="mt-0.5 text-xs text-gray-700">“{v.note}”</p>}
                  </li>
                ))}
              </ul>
              <VersionUploader documentId={doc.id} storage={storage} />
            </Card>
          )}

          {infoCard}
        </aside>
      </div>
    </div>
  );
}
