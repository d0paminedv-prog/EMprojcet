"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, FileUp, Link2, PenLine, UploadCloud } from "lucide-react";
import { FigmaLogo } from "@/components/figma-logo";
import { FormError, SubmitButton } from "@/components/form-controls";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { notifyChange } from "@/components/realtime";
import { uploadFile } from "@/lib/upload-client";
import { cn, fileExtension, formatBytes } from "@/lib/utils";
import { createFileDocument, createLinkDocument } from "../actions";
import { createLiveDocument, importDocx } from "../live-actions";

type Props = {
  projects: { id: string; name: string }[];
  defaultProjectId: string;
  defaultKind: "live" | "file" | "figma" | "link";
  templates: { id: string; label: string; category: string }[];
  storage: { mode: "blob" | "local"; access: "private" | "public"; ready: boolean };
};

const TABS = [
  { value: "live", label: "실시간 문서", icon: PenLine },
  { value: "file", label: "파일 업로드", icon: FileUp },
  { value: "figma", label: "Figma 링크", icon: null },
  { value: "link", label: "웹 링크", icon: Link2 },
] as const;

function ProjectAndCategory({ projects, defaultProjectId, defaultCategory }: { projects: Props["projects"]; defaultProjectId: string; defaultCategory: string }) {
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

function FileUploadForm({ projects, defaultProjectId, storage }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pick(f: File | undefined) {
    if (!f) return;
    setError(null);
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(fileExtension(f.name))) {
      setError(`지원하지 않는 형식입니다. (${ALLOWED_UPLOAD_EXTENSIONS.join(", ")})`);
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(`파일은 ${formatBytes(MAX_UPLOAD_BYTES)} 이하만 올릴 수 있습니다.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!file) return setError("파일을 선택하세요.");
    const form = new FormData(e.currentTarget);
    setError(null);
    setProgress(0);
    try {
      const uploaded = await uploadFile(file, storage.mode, storage.access, setProgress);
      const result = await createFileDocument({
        title,
        projectId: String(form.get("projectId") ?? ""),
        category: String(form.get("category") ?? "etc"),
        description: String(form.get("description") ?? ""),
        file: uploaded,
      });
      if (result.error || !result.id) throw new Error(result.error ?? "등록에 실패했습니다.");
      notifyChange("documents");
      router.push(`/documents/${result.id}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드에 실패했습니다.");
      setProgress(null);
    }
  }

  const ext = file ? fileExtension(file.name) : "";
  const defaultCategory = ext === "pdf" || ext === "pptx" || ext === "docx" ? "proposal" : ["png", "jpg", "jpeg", "ai", "psd", "fig", "svg"].includes(ext) ? "design" : "etc";

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          pick(e.dataTransfer.files[0]);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-10 text-center transition",
          dragging ? "border-brand-500 bg-brand-50" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
        )}
      >
        <UploadCloud className="mb-2 h-8 w-8 text-gray-400" />
        {file ? (
          <>
            <p className="text-sm font-medium text-gray-900">{file.name}</p>
            <p className="text-xs text-gray-500">{formatBytes(file.size)} · 다른 파일을 선택하려면 클릭</p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">파일을 끌어다 놓거나 클릭해서 선택</p>
            <p className="mt-1 text-xs text-gray-500">Word(.docx), PDF, PPT, Excel, 한글(.hwp), 이미지 등 · 최대 {formatBytes(MAX_UPLOAD_BYTES)}</p>
          </>
        )}
        <input ref={inputRef} type="file" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
      </div>

      <div>
        <label className="label" htmlFor="title">
          문서 제목
        </label>
        <input id="title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="예) 성수 팝업 운영 기획안" />
      </div>
      <ProjectAndCategory projects={projects} defaultProjectId={defaultProjectId} defaultCategory={defaultCategory} />
      <div>
        <label className="label" htmlFor="description">
          설명 (선택)
        </label>
        <textarea id="description" name="description" rows={3} className="input" placeholder="문서 용도, 검토 요청 사항 등" />
      </div>

      {progress !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-brand-500 transition-all" style={{ width: `${Math.max(5, progress)}%` }} />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" className="btn-primary" disabled={!file || progress !== null || !storage.ready}>
          {progress !== null ? `업로드 중… ${Math.round(progress)}%` : "업로드"}
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
      const uploaded = await uploadFile(file, storage.mode, storage.access);
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
