"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, FileText, FileUp, Link2, PenLine, UploadCloud, X } from "lucide-react";
import { DocIcon } from "@/components/doc-icon";
import { FigmaLogo } from "@/components/figma-logo";
import { FormError, SubmitButton } from "@/components/form-controls";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { announceActivity, notifyChange } from "@/components/realtime";
import { isEditableFile } from "@/lib/mime";
import { uploadFile, type StorageClientConfig } from "@/lib/upload-client";
import { cn, fileExtension, formatBytes, isUuid } from "@/lib/utils";
import { createFileDocument, createLinkDocument } from "../actions";
import { createLiveDocument, importDocx } from "../live-actions";

type Props = {
  projects: { id: string; name: string }[];
  defaultProjectId: string;
  defaultKind: "live" | "file" | "figma" | "link";
  templates: { id: string; label: string; category: string }[];
  storage: StorageClientConfig;
};

const TABS = [
  { value: "live", label: "실시간 문서", icon: PenLine },
  { value: "file", label: "파일 업로드", icon: FileUp },
  { value: "figma", label: "Figma 링크", icon: null },
  { value: "link", label: "웹 링크", icon: Link2 },
] as const;

function ProjectAndCategory({
  projects,
  defaultProjectId,
  defaultCategory,
  autoCategory,
}: {
  projects: Props["projects"];
  defaultProjectId: string;
  defaultCategory: string;
  /** 「파일 형식에 따라 자동」 선택지 추가 (value="auto") */
  autoCategory?: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="label" htmlFor="projectId">
          프로젝트
        </label>
        <select id="projectId" name="projectId" className="input" defaultValue={defaultProjectId}>
          <option value="">공통 (프로젝트 없음)</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="label" htmlFor="category">
          분류
        </label>
        <select id="category" name="category" className="input" defaultValue={defaultCategory} key={defaultCategory}>
          {autoCategory && <option value="auto">파일 형식에 따라 자동</option>}
          {DOC_CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

const MAX_BATCH = 20;
const UPLOAD_CONCURRENCY = 3;

type QueueItem = {
  key: string;
  file: File;
  title: string;
  status: "ready" | "uploading" | "saving" | "done" | "error";
  progress: number;
  error?: string;
  warning?: string;
  docId?: string;
};

/** 분류 「자동」일 때 파일 형식으로 추정 */
function guessCategory(fileName: string): string {
  const ext = fileExtension(fileName);
  if (["pdf", "ppt", "pptx", "doc", "docx", "hwp", "hwpx", "key"].includes(ext)) return "proposal";
  if (["png", "jpg", "jpeg", "gif", "webp", "ai", "psd", "fig", "svg"].includes(ext)) return "design";
  return "etc";
}

function QueueStatus({ item }: { item: QueueItem }) {
  switch (item.status) {
    case "ready":
      return <span className="text-gray-400">대기</span>;
    case "uploading":
      return (
        <span className="flex w-full items-center gap-2 sm:w-32">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
            <span className="block h-full bg-brand-500 transition-all" style={{ width: `${Math.max(5, item.progress)}%` }} />
          </span>
          <span className="w-9 text-right tabular-nums text-gray-600">{Math.round(item.progress)}%</span>
        </span>
      );
    case "saving":
      return <span className="text-gray-600">등록 중…</span>;
    case "done":
      return (
        <Link href={`/documents/${item.docId}`} className="inline-flex items-center gap-1 font-medium text-emerald-600 hover:underline">
          <CheckCircle2 className="h-3.5 w-3.5" />
          완료 · 열기
        </Link>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          실패
        </span>
      );
  }
}

function FileUploadForm({ projects, defaultProjectId, storage }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [editable, setEditable] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const [batch, setBatch] = useState({ finished: 0, total: 0 });

  const patch = (key: string, value: Partial<QueueItem>) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...value } : it)));
  const pending = items.filter((it) => it.status !== "done");
  const failed = items.filter((it) => it.status === "error");
  const hasEditable = items.some((it) => isEditableFile(it.file.name));

  // 업로드 중에 창을 닫으려 하면 경고
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  function add(files: FileList | null | undefined) {
    if (!files?.length) return;
    const skipped: string[] = [];
    const next: QueueItem[] = [];
    for (const f of Array.from(files)) {
      if (!ALLOWED_UPLOAD_EXTENSIONS.includes(fileExtension(f.name))) {
        skipped.push(`${f.name} — 지원하지 않는 형식`);
        continue;
      }
      if (f.size > MAX_UPLOAD_BYTES) {
        skipped.push(`${f.name} — ${formatBytes(MAX_UPLOAD_BYTES)} 초과`);
        continue;
      }
      const same = (it: QueueItem) => it.file.name === f.name && it.file.size === f.size && it.file.lastModified === f.lastModified;
      if (items.some(same) || next.some(same)) continue;
      if (items.length + next.length >= MAX_BATCH) {
        skipped.push(`${f.name} — 한 번에 최대 ${MAX_BATCH}개까지 올릴 수 있습니다`);
        continue;
      }
      next.push({ key: `f${seq.current++}`, file: f, title: f.name.replace(/\.[^.]+$/, ""), status: "ready", progress: 0 });
    }
    setRejected(skipped);
    if (next.length) setItems((list) => [...list, ...next]);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const queue = items.filter((it) => it.status === "ready" || it.status === "error");
    if (!queue.length) return setRejected(["올릴 파일을 선택하세요."]);
    const form = new FormData(e.currentTarget);
    const projectId = String(form.get("projectId") ?? "");
    const category = String(form.get("category") ?? "auto");
    const description = String(form.get("description") ?? "");
    setRunning(true);
    setRejected([]);
    setBatch({ finished: 0, total: queue.length });

    let cursor = 0;
    let finished = 0;
    const outcomes: { ok: boolean; docId?: string; warning?: string }[] = [];
    announceActivity(`파일 ${queue.length}개 올리는 중`);

    async function worker() {
      while (cursor < queue.length) {
        const item = queue[cursor++];
        patch(item.key, { status: "uploading", progress: 0, error: undefined, warning: undefined });
        try {
          const uploaded = await uploadFile(item.file, storage, (p) => patch(item.key, { progress: p }));
          patch(item.key, { status: "saving", progress: 100 });
          const result = await createFileDocument({
            title: item.title,
            projectId,
            category: category === "auto" ? guessCategory(item.file.name) : category,
            description,
            file: uploaded,
            editable,
          });
          if (result.error || !result.id) throw new Error(result.error ?? "등록에 실패했습니다.");
          patch(item.key, { status: "done", docId: result.id, warning: result.warning });
          outcomes.push({ ok: true, docId: result.id, warning: result.warning });
        } catch (err) {
          patch(item.key, { status: "error", error: err instanceof Error ? err.message : "업로드에 실패했습니다." });
          outcomes.push({ ok: false });
        }
        finished++;
        setBatch({ finished, total: queue.length });
        if (finished < queue.length) announceActivity(`파일 ${queue.length}개 올리는 중 (${finished}/${queue.length})`);
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
    announceActivity(null);
    setRunning(false);

    const succeeded = outcomes.filter((o) => o.ok);
    if (succeeded.length) notifyChange("documents");
    if (succeeded.length === outcomes.length && !succeeded.some((o) => o.warning)) {
      const total = items.filter((it) => it.status === "done").length + succeeded.length;
      router.push(total === 1 && succeeded[0].docId ? `/documents/${succeeded[0].docId}` : `/documents${isUuid(projectId) ? `?project=${projectId}` : ""}`);
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!running) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!running) add(e.dataTransfer.files);
        }}
        onClick={() => !running && inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition",
          dragging ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
          running && "cursor-not-allowed opacity-60",
        )}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-gray-400" />
        <p className="text-sm font-medium text-gray-700">{items.length ? "파일 더 추가하기 (끌어다 놓거나 클릭)" : "파일을 끌어다 놓거나 클릭해서 선택 — 여러 개 가능"}</p>
        <p className="mt-1 text-xs text-gray-500">
          Word(.docx), PDF, PPT, Excel, 한글(.hwp), 이미지 등 · 파일당 최대 {formatBytes(MAX_UPLOAD_BYTES)} · 한 번에 {MAX_BATCH}개까지
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {rejected.length > 0 && (
        <ul className="space-y-0.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {rejected.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="label mb-0">
              선택한 파일 {items.length}개 <span className="font-normal text-gray-500">· 제목은 바로 고칠 수 있습니다</span>
            </span>
            {!running && (
              <button type="button" className="text-xs text-gray-500 hover:text-gray-800" onClick={() => setItems((list) => list.filter((it) => it.status === "done"))}>
                대기 중인 파일 모두 빼기
              </button>
            )}
          </div>
          <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200" data-testid="upload-queue">
            {items.map((it) => (
              <li key={it.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-2.5">
                  <span className="mt-2">
                    <DocIcon kind="file" fileName={it.file.name} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <input
                      className="input py-1.5"
                      value={it.title}
                      aria-label={`${it.file.name} 제목`}
                      disabled={running || it.status === "done"}
                      onChange={(e) => patch(it.key, { title: e.target.value })}
                    />
                    <p className="mt-1 truncate text-xs text-gray-500" title={it.file.name}>
                      {it.file.name} · {formatBytes(it.file.size)}
                      {editable && isEditableFile(it.file.name) && <span className="text-brand-600"> · 편집 문서로</span>}
                    </p>
                    {it.error && <p className="mt-0.5 text-xs text-red-600">{it.error}</p>}
                    {it.warning && <p className="mt-0.5 text-xs text-amber-700">{it.warning}</p>}
                  </div>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-2 pl-7 text-xs sm:w-40 sm:justify-end sm:pl-0">
                  <QueueStatus item={it} />
                  {!running && it.status !== "done" && (
                    <button type="button" className="btn-ghost btn-sm" aria-label={`${it.file.name} 빼기`} onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}>
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasEditable && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-brand-100 bg-brand-50/60 p-3">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={editable} disabled={running} onChange={(e) => setEditable(e.target.checked)} />
          <span className="text-sm">
            <b className="font-medium text-gray-900">Word(.docx)·텍스트(.txt, .md) 파일은 바로 편집 문서로 만들기</b>
            <span className="mt-0.5 block text-xs text-gray-600">
              팀원과 함께 앱에서 편집하고 Word로 내보낼 수 있습니다. 원본 파일도 그대로 보관됩니다. (나중에 문서 화면의 「편집하기」로도 바꿀 수 있어요)
            </span>
          </span>
        </label>
      )}

      <ProjectAndCategory projects={projects} defaultProjectId={defaultProjectId} defaultCategory="auto" autoCategory />
      <div>
        <label className="label" htmlFor="description">
          설명 (선택{items.length > 1 ? " · 모든 파일에 적용" : ""})
        </label>
        <textarea id="description" name="description" rows={2} className="input" placeholder="문서 용도, 검토 요청 사항 등" />
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end">
        {items.some((it) => it.status === "done") && !running && (
          <Link href="/documents" className="btn-secondary">
            문서 목록 보기
          </Link>
        )}
        <button type="submit" className="btn-primary" disabled={!pending.length || running || !storage.ready}>
          {running
            ? `올리는 중… (${batch.finished}/${batch.total})`
            : failed.length && failed.length === pending.length
              ? `실패한 ${failed.length}개 다시 시도`
              : pending.length
                ? `${pending.length}개 업로드`
                : "업로드"}
        </button>
      </div>
    </form>
  );
}

function LinkForm({ kind, projects, defaultProjectId }: { kind: "figma" | "link"; projects: Props["projects"]; defaultProjectId: string }) {
  const [state, action] = useActionState(createLinkDocument, undefined);
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="kind" value={kind} />
      <div>
        <label className="label" htmlFor="url">
          {kind === "figma" ? "Figma 공유 링크" : "URL"}
        </label>
        <input
          id="url"
          name="url"
          type="url"
          required
          className="input"
          placeholder={kind === "figma" ? "https://www.figma.com/design/..." : "https://"}
        />
        {kind === "figma" && (
          <p className="mt-1.5 text-xs text-gray-500">
            Figma에서 <b>Share → Copy link</b>로 복사한 링크를 붙여넣으세요. 디자인·프로토타입·FigJam 모두 미리보기로 임베드됩니다. (보려면 팀원도 해당 파일 접근 권한이 필요)
          </p>
        )}
      </div>
      <div>
        <label className="label" htmlFor="title">
          제목
        </label>
        <input id="title" name="title" required className="input" placeholder={kind === "figma" ? "예) 팝업 공간 디자인 시안 v2" : "예) 레퍼런스 - OO 브랜드 팝업 기사"} />
      </div>
      <ProjectAndCategory projects={projects} defaultProjectId={defaultProjectId} defaultCategory={kind === "figma" ? "design" : "reference"} />
      <div>
        <label className="label" htmlFor="description">
          설명 (선택)
        </label>
        <textarea id="description" name="description" rows={3} className="input" />
      </div>
      <div className="flex items-center justify-between gap-3">
        <FormError state={state} />
        <SubmitButton className="btn-primary ml-auto">등록</SubmitButton>
      </div>
    </form>
  );
}

const TEMPLATE_HINT: Record<string, string> = {
  blank: "빈 페이지에서 시작",
  minutes: "일시·참석자·안건·결정·할 일",
  proposal: "개요·KPI·타깃·프로그램·운영",
  report: "성과 표·인사이트·개선점",
};

function LiveDocForm({ projects, defaultProjectId, templates, storage }: Props) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState("blank");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const docxRef = useRef<HTMLInputElement>(null);
  const selected = templates.find((t) => t.id === templateId) ?? templates[0];

  function formValues() {
    const form = new FormData(formRef.current ?? undefined);
    return { projectId: String(form.get("projectId") ?? ""), category: String(form.get("category") ?? "etc") };
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy("문서 만드는 중…");
    setError(null);
    const result = await createLiveDocument({ title, templateId, ...formValues() });
    if (result.error || !result.id) {
      setBusy(null);
      return setError(result.error ?? "문서를 만들지 못했습니다.");
    }
    notifyChange("documents");
    router.push(`/documents/${result.id}`);
  }

  async function importWord(file: File | undefined) {
    if (!file) return;
    if (fileExtension(file.name) !== "docx") return setError("Word(.docx) 파일만 불러올 수 있습니다. (.doc 은 Word에서 .docx 로 저장 후 올려 주세요)");
    setBusy("Word 파일을 실시간 문서로 바꾸는 중…");
    setError(null);
    try {
      const uploaded = await uploadFile(file, storage);
      const result = await importDocx({ ...formValues(), file: uploaded });
      if (result.error || !result.id) throw new Error(result.error ?? "가져오기 실패");
      notifyChange("documents");
      router.push(`/documents/${result.id}`);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "가져오기 실패");
    } finally {
      if (docxRef.current) docxRef.current.value = "";
    }
  }

  return (
    <form ref={formRef} onSubmit={create} className="space-y-5">
      <div>
        <span className="label">템플릿</span>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTemplateId(t.id)}
              className={cn(
                "rounded-lg border p-3 text-left transition",
                templateId === t.id ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100" : "border-gray-200 hover:border-gray-300",
              )}
            >
              <FileText className="mb-1.5 h-4 w-4 text-brand-600" />
              <span className="block text-sm font-medium text-gray-900">{t.label}</span>
              <span className="block text-[11px] leading-snug text-gray-500">{TEMPLATE_HINT[t.id] ?? ""}</span>
            </button>
          ))}
        </div>
      </div>
      <div>
        <label className="label" htmlFor="live-title">
          문서 제목
        </label>
        <input id="live-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={selected.id === "blank" ? "예) 팝업 운영 체크리스트" : selected.label} />
      </div>
      <ProjectAndCategory projects={projects} defaultProjectId={defaultProjectId} defaultCategory={selected.category} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <button type="button" className="btn-secondary" onClick={() => docxRef.current?.click()} disabled={!!busy || !storage.ready}>
            <FileUp className="h-4 w-4" />
            Word(.docx) 불러와서 시작
          </button>
          <input ref={docxRef} type="file" accept=".docx" className="hidden" onChange={(e) => importWord(e.target.files?.[0])} />
        </div>
        <button type="submit" className="btn-primary" disabled={!!busy}>
          {busy ?? "실시간 문서 만들기"}
        </button>
      </div>
      <p className="text-xs text-gray-500">실시간 문서는 팀원이 동시에 열어 함께 편집할 수 있고, 언제든 Word(.docx)로 내보낼 수 있습니다.</p>
    </form>
  );
}

export function NewDocumentForm(props: Props) {
  const [kind, setKind] = useState<Props["defaultKind"]>(props.defaultKind);
  return (
    <div className="card p-5">
      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1 sm:grid-cols-4">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setKind(t.value)}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition",
              kind === t.value ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700",
            )}
          >
            {t.icon ? <t.icon className="h-4 w-4" /> : <FigmaLogo className="h-3.5 w-3.5" />}
            {t.label}
          </button>
        ))}
      </div>
      {kind === "file" && !props.storage.ready && (
        <p className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Vercel Blob 저장소가 연결되지 않아 파일을 올릴 수 없습니다. Vercel → Storage 탭에서 Blob 스토어를 연결하세요.
        </p>
      )}
      {kind === "live" ? (
        <LiveDocForm {...props} />
      ) : kind === "file" ? (
        <FileUploadForm {...props} />
      ) : (
        <LinkForm kind={kind} projects={props.projects} defaultProjectId={props.defaultProjectId} key={kind} />
      )}
    </div>
  );
}
