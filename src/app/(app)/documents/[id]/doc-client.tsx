"use client";

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { FormError, SubmitButton } from "@/components/form-controls";
import { ALLOWED_UPLOAD_EXTENSIONS, DOC_CATEGORIES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { notifyChange } from "@/components/realtime";
import { uploadFile, type StorageClientConfig } from "@/lib/upload-client";
import { fileExtension, formatBytes, type ActionState } from "@/lib/utils";
import { addComment, addDocumentVersion } from "../actions";

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

export function CommentForm({ documentId }: { documentId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(async (prev: ActionState, form: FormData) => {
    const result = await addComment(documentId, prev, form);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, undefined);
  return (
    <form ref={formRef} action={action} className="space-y-2">
      <textarea name="body" rows={3} required className="input" placeholder="검토 의견, 수정 요청 등을 남겨 주세요" />
      <div className="flex items-center justify-between gap-2">
        <FormError state={state?.error ? state : undefined} />
        <SubmitButton className="btn-primary btn-sm ml-auto" pendingText="등록 중…">
          의견 등록
        </SubmitButton>
      </div>
    </form>
  );
}

export function DocumentEditForm({
  action,
  doc,
  projects,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  doc: { title: string; kind: string; url: string | null; category: string; description: string; projectId: string | null };
  projects: { id: string; name: string }[];
}) {
  const [state, formAction] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-3">
      <div>
        <label className="label">제목</label>
        <input name="title" className="input" defaultValue={doc.title} required />
      </div>
      {(doc.kind === "figma" || doc.kind === "link") && (
        <div>
          <label className="label">{doc.kind === "figma" ? "Figma 링크" : "URL"}</label>
          <input name="url" type="url" className="input" defaultValue={doc.url ?? ""} required />
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">프로젝트</label>
          <select name="projectId" className="input" defaultValue={doc.projectId ?? ""}>
            <option value="">공통 (프로젝트 없음)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">분류</label>
          <select name="category" className="input" defaultValue={doc.category}>
            {DOC_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="label">설명</label>
        <textarea name="description" rows={3} className="input" defaultValue={doc.description} />
      </div>
      <div className="flex items-center justify-between gap-2">
        <FormError state={state} />
        <SubmitButton className="btn-primary btn-sm ml-auto">저장</SubmitButton>
      </div>
    </form>
  );
}
