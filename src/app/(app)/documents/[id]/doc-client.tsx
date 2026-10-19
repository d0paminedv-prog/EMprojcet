"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PenLine, Upload } from "lucide-react";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { notifyChange } from "@/components/realtime";
import { uploadFile, type StorageClientConfig } from "@/lib/upload-client";
import { fileExtension, formatBytes, type ActionState } from "@/lib/utils";
import { addDocumentVersion, renameDocument } from "../actions";
import { makeDocumentEditable } from "../live-actions";

export function VersionUploader({
  documentId,
  storage,
}: {
  documentId: string;
  storage: StorageClientConfig;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    if (!ALLOWED_UPLOAD_EXTENSIONS.includes(fileExtension(file.name))) return setError("지원하지 않는 파일 형식입니다.");
    if (file.size > MAX_UPLOAD_BYTES) return setError(`파일은 ${formatBytes(MAX_UPLOAD_BYTES)} 이하만 가능합니다.`);
    setError(null);
    setProgress(0);
    try {
      const uploaded = await uploadFile(file, storage, setProgress);
      const result = await addDocumentVersion({ documentId, note, file: uploaded });
      if (result.error) throw new Error(result.error);
      notifyChange("documents");
      setFile(null);
      setNote("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "업로드 실패");
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-gray-500">Word 등에서 수정한 파일을 새 버전으로 올리면 이전 버전도 모두 보관됩니다.</p>
      <input
        ref={inputRef}
        type="file"
        className="block w-full text-xs text-gray-600 file:mr-2 file:rounded-md file:border-0 file:bg-gray-100 file:px-2.5 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-200"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <input className="input" placeholder="변경 내용 (예: 클라이언트 피드백 반영)" value={note} onChange={(e) => setNote(e.target.value)} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      <button type="button" onClick={submit} disabled={!file || progress !== null || !storage.ready} className="btn-primary btn-sm w-full">
        <Upload className="h-3.5 w-3.5" />
        {progress !== null ? `업로드 중… ${Math.round(progress)}%` : "새 버전 업로드"}
      </button>
    </div>
  );
}

/** 업로드한 Word·텍스트 파일 → 앱에서 함께 편집하는 실시간 문서로 전환 */
export function MakeEditableButton({ documentId, fileName }: { documentId: string; fileName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = window.confirm(
      `「${fileName}」을(를) 팀원과 함께 편집하는 실시간 문서로 엽니다.\n\n· 원본 파일은 그대로 보관되어 언제든 내려받을 수 있습니다.\n· 편집한 내용은 「Word로 내보내기」로 .docx 로 받을 수 있습니다.\n· 머리글·각주 같은 복잡한 서식은 단순화될 수 있습니다.\n\n계속할까요?`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    const result = await makeDocumentEditable(documentId);
    if (result.error) {
      setBusy(false);
      return setError(result.error);
    }
    notifyChange("documents");
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button type="button" onClick={run} disabled={busy} className="btn-primary">
        <PenLine className="h-4 w-4" />
        {busy ? "편집 문서로 여는 중…" : "편집하기"}
      </button>
      {error && <p className="max-w-xs text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** 문서 정보 — 바꾸면 자동 저장 (목록은 바로, 글은 입력을 멈추면) */
export function DocumentEditForm({
  action,
  doc,
  projects,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  doc: { kind: string; url: string | null; category: string; description: string; projectId: string | null };
  projects: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 폼 제출(<form action>)로 보내면 React 가 저장 뒤 입력칸을 처음 값으로 되돌리므로, 폼 값을 직접 모아 보냄
  const saveSoon = (delay: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const form = formRef.current;
      if (form) startTransition(() => formAction(new FormData(form)));
    }, delay);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);
  useEffect(() => {
    if (state?.ok) notifyChange("documents");
  }, [state]);

  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault();
        saveSoon(0);
      }}
      className="space-y-3"
      onChange={(e) => saveSoon(e.target instanceof HTMLSelectElement ? 0 : 900)}
      // 입력칸을 벗어나면 기다리지 않고 바로 저장
      onBlur={() => timer.current && saveSoon(0)}
      data-testid="doc-info-form"
    >
      {(doc.kind === "figma" || doc.kind === "link") && (
        <div>
          <label className="label" htmlFor="doc-url">
            {doc.kind === "figma" ? "Figma 링크" : "URL"}
          </label>
          <input id="doc-url" name="url" type="url" className="input" defaultValue={doc.url ?? ""} required />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="doc-project">
            프로젝트
          </label>
          <select id="doc-project" name="projectId" className="input" defaultValue={doc.projectId ?? ""}>
            <option value="">공통 (프로젝트 없음)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="doc-category">
            분류
          </label>
          <select id="doc-category" name="category" className="input" defaultValue={doc.category}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="doc-description">
          설명
        </label>
        <textarea id="doc-description" name="description" rows={3} className="input" defaultValue={doc.description} />
      </div>
      <p className="min-h-4 text-xs" aria-live="polite" data-testid="doc-info-status">
        {pending ? (
          <span className="text-gray-500">저장 중…</span>
        ) : state?.error ? (
          <span className="text-red-600">{state.error}</span>
        ) : state?.message ? (
          <span className="text-emerald-600">{state.message}</span>
        ) : (
          <span className="text-gray-400">바꾸면 자동으로 저장됩니다</span>
        )}
      </p>
    </form>
  );
}

/** 문서 제목 — 눌러서 바로 고치고, 입력을 멈추면 자동 저장. 다른 팀원이 바꾼 제목도 바로 반영 */
export function InlineTitle({ documentId, title }: { documentId: string; title: string }) {
  const router = useRouter();
  const [value, setValue] = useState(title);
  const [synced, setSynced] = useState(title);
  const [saved, setSaved] = useState(title);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 다른 팀원이 바꾼 제목 반영 (내가 입력 중일 때는 덮어쓰지 않음)
  if (title !== synced && !editing) {
    setSynced(title);
    setSaved(title);
    setValue(title);
  }

  async function save(next: string) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const clean = next.replace(/\s+/g, " ").trim();
    if (!clean || clean === saved) return;
    setStatus("saving");
    const result = await renameDocument(documentId, clean);
    if (result.error || !result.title) {
      setStatus("error");
      setError(result.error ?? "제목을 저장하지 못했습니다.");
      return;
    }
    setSaved(result.title);
    setStatus("saved");
    setError(null);
    notifyChange("documents");
    router.refresh();
  }

  return (
    <span className="flex min-w-0 flex-1 flex-col">
      <input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          if (timer.current) clearTimeout(timer.current);
          const next = e.target.value;
          timer.current = setTimeout(() => void save(next), 700);
        }}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          if (!value.trim()) setValue(saved);
          else void save(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setValue(saved);
            if (timer.current) clearTimeout(timer.current);
            timer.current = null;
            requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
          }
        }}
        maxLength={200}
        aria-label="문서 제목 (입력하면 자동 저장)"
        title="눌러서 제목 바꾸기 — 자동 저장"
        className="-mx-1 w-full min-w-0 truncate rounded-md border border-transparent bg-transparent px-1 text-xl font-bold text-gray-900 hover:border-gray-200 focus:border-brand-300 focus:outline-none sm:text-2xl"
        data-testid="doc-title-input"
      />
      <span className="h-4 text-[11px] font-normal" aria-live="polite">
        {status === "saving" && <span className="text-gray-500">제목 저장 중…</span>}
        {status === "saved" && <span className="text-emerald-600">제목 자동 저장됨</span>}
        {status === "error" && <span className="text-red-600">{error}</span>}
      </span>
    </span>
  );
}
