"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-tiptap/styles.css";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ClientSideSuspense, RoomProvider } from "@liveblocks/react";
import { useOthers, useSyncStatus } from "@liveblocks/react/suspense";
import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Placeholder } from "@tiptap/extensions";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Columns3,
  FileDown,
  Highlighter,
  History,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Loader2,
  Minus,
  Quote,
  Redo2,
  Rows3,
  Save,
  Strikethrough,
  Table2,
  Trash2,
  Underline,
  Undo2,
} from "lucide-react";
import { Avatar } from "@/components/ui";
import { notifyChange, useRealtime } from "@/components/realtime";
import { uploadFile, type StorageClientConfig } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { createAsset, createSnapshot, getSnapshotContent, saveLiveContent } from "../live-actions";

type Snapshot = { id: string; label: string; createdAt: string; createdByName: string | null };

type Props = {
  documentId: string;
  roomId: string;
  initialHtml: string | null;
  lastSavedAt: string | null;
  snapshots: Snapshot[];
  storage: StorageClientConfig;
};

const SAVE_DELAY = 1500;

type LiveblocksStorage = {
  doc: { getMap: (name: string) => { get: (key: string) => unknown; set: (key: string, value: unknown) => void } };
  provider: { getStatus: () => string; on: (event: "status", cb: () => void) => void; off: (event: "status", cb: () => void) => void };
};

function isRemoteChange(transaction: { getMeta: (key: string) => unknown }): boolean {
  const meta = transaction.getMeta("y-sync$") as { isChangeOrigin?: boolean } | undefined;
  return !!meta?.isChangeOrigin;
}

/** 편집기 JSON → 일반 객체 (ProseMirror 속성 객체는 프로토타입이 없어 서버 액션 전송 시 누락되므로 복제) */
function plainJson(editor: Editor): Record<string, unknown> {
  return JSON.parse(JSON.stringify(editor.getJSON())) as Record<string, unknown>;
}

function formatClock(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

// ---------------- 툴바 ----------------

function ToolButton({ onClick, active, disabled, label, children }: { onClick: () => void; active?: boolean; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30",
        active && "bg-brand-50 text-brand-700",
      )}
    >
      {children}
    </button>
  );
}

function Sep() {
  return <span className="mx-0.5 h-5 w-px shrink-0 bg-gray-200" />;
}

function Toolbar({ editor, onImage }: { editor: Editor; onImage: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      block: e.isActive("heading", { level: 1 }) ? "h1" : e.isActive("heading", { level: 2 }) ? "h2" : e.isActive("heading", { level: 3 }) ? "h3" : "p",
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      highlight: e.isActive("highlight"),
      link: e.isActive("link"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      left: e.isActive({ textAlign: "left" }),
      center: e.isActive({ textAlign: "center" }),
      right: e.isActive({ textAlign: "right" }),
      table: e.isActive("table"),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-white px-2 py-1.5" role="toolbar" aria-label="서식 도구">
      <ToolButton label="실행 취소" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="다시 실행" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>
      <Sep />
      <select
        aria-label="문단 스타일"
        className="h-8 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">본문</option>
        <option value="h1">제목 1</option>
        <option value="h2">제목 2</option>
        <option value="h3">제목 3</option>
      </select>
      <Sep />
      <ToolButton label="굵게" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="기울임" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="밑줄" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <Underline className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="취소선" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="형광펜" active={s.highlight} onClick={() => chain().toggleHighlight().run()}>
        <Highlighter className="h-4 w-4" />
      </ToolButton>
      <ToolButton
        label="링크"
        active={s.link}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = window.prompt("링크 주소 (비우면 링크 해제)", prev ?? "https://");
          if (url === null) return;
          if (!url.trim() || url.trim() === "https://") chain().extendMarkRange("link").unsetLink().run();
          else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
        }}
      >
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <Sep />
      <ToolButton label="글머리 기호 목록" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="번호 목록" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="체크리스트" active={s.task} onClick={() => chain().toggleTaskList().run()}>
        <ListChecks className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="인용" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote className="h-4 w-4" />
      </ToolButton>
      <Sep />
      <ToolButton label="왼쪽 정렬" active={s.left} onClick={() => chain().setTextAlign("left").run()}>
        <AlignLeft className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="가운데 정렬" active={s.center} onClick={() => chain().setTextAlign("center").run()}>
        <AlignCenter className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="오른쪽 정렬" active={s.right} onClick={() => chain().setTextAlign("right").run()}>
        <AlignRight className="h-4 w-4" />
      </ToolButton>
      <Sep />
      <ToolButton label="표 넣기" onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table2 className="h-4 w-4" />
      </ToolButton>
      {s.table && (
        <>
          <ToolButton label="아래에 행 추가" onClick={() => chain().addRowAfter().run()}>
            <Rows3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="오른쪽에 열 추가" onClick={() => chain().addColumnAfter().run()}>
            <Columns3 className="h-4 w-4" />
          </ToolButton>
          <ToolButton label="행 삭제" onClick={() => chain().deleteRow().run()}>
            <span className="text-[11px] font-semibold">행−</span>
          </ToolButton>
          <ToolButton label="열 삭제" onClick={() => chain().deleteColumn().run()}>
            <span className="text-[11px] font-semibold">열−</span>
          </ToolButton>
          <ToolButton label="표 삭제" onClick={() => chain().deleteTable().run()}>
            <Trash2 className="h-4 w-4" />
          </ToolButton>
        </>
      )}
      <ToolButton label="이미지 넣기" onClick={onImage}>
        <ImagePlus className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="구분선" onClick={() => chain().setHorizontalRule().run()}>
        <Minus className="h-4 w-4" />
      </ToolButton>
    </div>
  );
}

// ---------------- 접속자 / 동기화 상태 ----------------

function Collaborators() {
  const others = useOthers();
  const unique = new Map<string, { name: string; color: string }>();
  for (const o of others) if (o.id && o.info) unique.set(o.id, o.info);
  const list = [...unique.entries()];
  return (
    <div className="flex items-center gap-2" data-testid="doc-collaborators">
      <span className="flex -space-x-1.5">
        {list.map(([id, info]) => (
          <Avatar key={id} name={info.name} color={info.color} size="sm" />
        ))}
      </span>
      <span className="text-xs text-gray-500">{list.length ? `${list.map(([, i]) => i.name).join(", ")} 함께 편집 중` : "혼자 편집 중"}</span>
    </div>
  );
}

function SyncBadge({ saving, savedAt, error }: { saving: boolean; savedAt: string | null; error: string | null }) {
  const sync = useSyncStatus({ smooth: true });
  if (error) return <span className="text-xs text-red-600">{error}</span>;
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500" data-testid="sync-status">
      <span className={cn("h-1.5 w-1.5 rounded-full", sync === "synchronized" ? "bg-emerald-500" : "bg-amber-400")} />
      {sync === "synchronized" ? "실시간 저장됨" : "동기화 중…"}
      {saving ? " · 사본 저장 중" : savedAt ? ` · 사본 ${formatClock(savedAt)}` : ""}
    </span>
  );
}

// ---------------- 편집기 ----------------

function CollaborativeEditor({ documentId, initialHtml, lastSavedAt, snapshots, storage }: Omit<Props, "roomId">) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(lastSavedAt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const imageInput = useRef<HTMLInputElement>(null);

  const liveblocks = useLiveblocksExtension({ comments: false, mentions: false });

  const flush = useCallback(async () => {
    const editor = editorRef.current;
    if (timer.current) clearTimeout(timer.current);
    if (!editor || !dirty.current) return;
    dirty.current = false;
    setSaving(true);
    const result = await saveLiveContent(documentId, { json: plainJson(editor), text: editor.getText() });
    setSaving(false);
    if (result.error) setError(result.error);
    else {
      setError(null);
      setSavedAt(result.savedAt ?? null);
    }
  }, [documentId]);

  // 확장·속성 객체를 처음 한 번만 만들어 고정 — 매 렌더마다 새로 만들면 Tiptap 이 편집기 상태를 다시 적용하면서
  // 방금 클릭한 커서 위치를 덮어써, 다른 팀원이 입력하는 동안 클릭이 무시되는 문제가 생깁니다.
  const [extensions] = useState(() => [
    liveblocks,
    StarterKit.configure({ undoRedo: false, link: { openOnClick: false, autolink: true } }),
    TableKit.configure({ table: { resizable: false } }),
    Image,
    Highlight,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: "여기에 내용을 입력하세요. 팀원이 같은 문서를 열면 함께 편집됩니다." }),
  ]);
  const [editorProps] = useState(() => ({ attributes: { class: "bx-editor", "aria-label": "문서 본문", "data-testid": "editor" } }));

  const editor = useEditor({
    immediatelyRender: false,
    extensions,
    editorProps,
    onUpdate: ({ transaction }) => {
      if (isRemoteChange(transaction)) return;
      dirty.current = true;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_DELAY);
    },
  });

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // 새 문서의 첫 내용(템플릿/Word 불러오기)을 서버 동기화가 끝난 뒤 한 번만 넣음 (여러 명이 동시에 열어도 중복 없음)
  useEffect(() => {
    if (!editor || !initialHtml) return;
    const storage = (editor.storage as unknown as Record<string, LiveblocksStorage | undefined>).liveblocksExtension;
    if (!storage?.provider) return;
    const apply = () => {
      if (storage.provider.getStatus() !== "synchronized") return false;
      const config = storage.doc.getMap("liveblocks_config");
      if (!config.get("hasContentSet")) {
        config.set("hasContentSet", true);
        if (!editor.getText().trim()) editor.commands.setContent(initialHtml);
      }
      return true;
    };
    if (apply()) return;
    const onStatus = () => {
      if (apply()) storage.provider.off("status", onStatus);
    };
    storage.provider.on("status", onStatus);
    return () => storage.provider.off("status", onStatus);
  }, [editor, initialHtml]);

  // 페이지를 떠나거나 탭을 숨길 때 남은 변경분 저장
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      void flush();
    };
  }, [flush]);

  async function insertImage(file: File | undefined) {
    if (!file || !editor) return;
    setBusy("이미지 올리는 중…");
    try {
      const uploaded = await uploadFile(file, storage);
      const result = await createAsset(uploaded);
      if (result.error || !result.url) throw new Error(result.error ?? "이미지 등록 실패");
      editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
    } catch (err) {
      setError(err instanceof Error ? err.message : "이미지 업로드 실패");
    } finally {
      setBusy(null);
      if (imageInput.current) imageInput.current.value = "";
    }
  }

  async function saveVersion() {
    if (!editor) return;
    const label = window.prompt("버전 이름 (예: 클라이언트 1차 보고본)", "");
    if (label === null) return;
    setBusy("버전 저장 중…");
    const result = await createSnapshot(documentId, { label, json: plainJson(editor), text: editor.getText() });
    setBusy(null);
    if (result.error) setError(result.error);
    else {
      setShowVersions(true);
      router.refresh();
    }
  }

  async function restore(snapshot: Snapshot) {
    if (!editor) return;
    if (!window.confirm(`「${snapshot.label}」 버전으로 되돌릴까요? 지금 내용은 모든 팀원 화면에서 바뀝니다. (먼저 현재 내용을 버전으로 저장해 두는 것을 권장)`)) return;
    setBusy("복원 중…");
    const result = await getSnapshotContent(snapshot.id);
    setBusy(null);
    if (result.error || !result.json) return setError(result.error ?? "복원 실패");
    editor.commands.setContent(result.json);
  }

  async function exportWord() {
    setBusy("Word 파일 만드는 중…");
    dirty.current = true;
    await flush();
    setBusy(null);
    notifyChange("documents");
    const link = document.createElement("a");
    link.href = `/api/documents/${documentId}/docx`;
    link.download = "";
    link.click();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Collaborators />
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </span>
          ) : (
            <SyncBadge saving={saving} savedAt={savedAt} error={error} />
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowVersions((v) => !v)}>
            <History className="h-3.5 w-3.5" />
            버전 기록 ({snapshots.length})
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={saveVersion} disabled={!editor}>
            <Save className="h-3.5 w-3.5" />
            버전 저장
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={exportWord} disabled={!editor}>
            <FileDown className="h-3.5 w-3.5" />
            Word로 내보내기
          </button>
        </div>
      </div>

      {showVersions && (
        <div className="card p-3" data-testid="version-panel">
          {snapshots.length === 0 ? (
            <p className="text-sm text-gray-500">저장된 버전이 없습니다. 30분마다 자동으로 저장되고, 「버전 저장」으로 직접 남길 수도 있습니다.</p>
          ) : (
            <ul className="max-h-60 divide-y divide-gray-100 overflow-y-auto">
              {snapshots.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-gray-900">{s.label}</span>
                    <span className="ml-2 text-xs text-gray-500">
                      {s.createdByName ?? "알 수 없음"} · {new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(s.createdAt))}
                    </span>
                  </span>
                  <button type="button" className="btn-ghost btn-sm shrink-0" onClick={() => restore(s)}>
                    이 버전으로 복원
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        {editor ? <Toolbar editor={editor} onImage={() => imageInput.current?.click()} /> : <div className="h-11 border-b border-gray-200" />}
        <div className="bg-gray-50/60 px-2 py-4 sm:px-6 sm:py-8">
          <div className="mx-auto min-h-[60vh] max-w-[820px] bg-white px-5 py-6 shadow-sm ring-1 ring-gray-200/70 sm:px-12 sm:py-10">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
      <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => insertImage(e.target.files?.[0])} />
    </div>
  );
}

function EditorLoading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center rounded-xl border border-gray-200 bg-white text-sm text-gray-500">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      실시간 문서에 연결하는 중…
    </div>
  );
}

export function LiveEditor(props: Props) {
  const { enabled } = useRealtime();
  if (!enabled) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        실시간 문서를 편집하려면 LIVEBLOCKS_SECRET_KEY 환경변수가 필요합니다. (README의 Liveblocks 설정 참고)
      </div>
    );
  }
  const { roomId, ...rest } = props;
  return (
    <RoomProvider id={roomId} initialPresence={{ page: null }}>
      <ClientSideSuspense fallback={<EditorLoading />}>
        <CollaborativeEditor {...rest} />
      </ClientSideSuspense>
    </RoomProvider>
  );
}
