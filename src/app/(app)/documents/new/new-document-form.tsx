"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUp, Link2, UploadCloud } from "lucide-react";
import { FigmaLogo } from "@/components/figma-logo";
import { FormError, SubmitButton } from "@/components/form-controls";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { uploadFile } from "@/lib/upload-client";
import { cn, fileExtension, formatBytes } from "@/lib/utils";
import { createFileDocument, createLinkDocument } from "../actions";

type Props = {
  projects: { id: string; name: string }[];
  defaultProjectId: string;
  defaultKind: "file" | "figma" | "link";
  storage: { mode: "blob" | "local"; access: "private" | "public"; ready: boolean };
};

const TABS = [
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

export function NewDocumentForm(props: Props) {
  const [kind, setKind] = useState<Props["defaultKind"]>(props.defaultKind);
  return (
    <div className="card p-5">
      <div className="mb-5 flex gap-1 rounded-lg bg-gray-100 p-1">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setKind(t.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium transition",
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
      {kind === "file" ? <FileUploadForm {...props} /> : <LinkForm kind={kind} projects={props.projects} defaultProjectId={props.defaultProjectId} key={kind} />}
    </div>
  );
}
