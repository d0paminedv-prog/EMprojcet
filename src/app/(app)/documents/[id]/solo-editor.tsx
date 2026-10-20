"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { FileDown, History, Loader2, Lock, RefreshCw, Save } from "lucide-react";
import { announceActivity, notifyChange } from "@/components/realtime";
import { Toast } from "@/components/share-link";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { IDLE_MS, SOLO_MARK } from "@/lib/presence";
import type { SoloState } from "@/lib/solo";
import { uploadFile } from "@/lib/upload-client";
import { cn, formatBytes } from "@/lib/utils";
import { createAsset, createSnapshot, getSnapshotContent } from "../live-actions";
import { IMAGE_FILES_EVENT, type ImageFilesDetail } from "./editor-images";
import {
  appHeaderHeight,
  editorExtensions,
  formatClock,
  LINK_MENU_OPTIONS,
  LinkMenu,
  plainJson,
  SAVE_DELAY,
  showLinkMenu,
  subscribeAppHeader,
  Toolbar,
  VersionPanel,
  type DocEditorProps,
  type Snapshot,
} from "./live-editor";
import { acquireSolo, fetchSoloState, leaveSolo, saveSolo } from "./solo-client";

type Json = Record<string, unknown>;

/** 편집 권한 연장 간격 (권한은 90초짜리) */
const RENEW_MS = 30_000;
/** 보기만 할 때 서버 사본 확인 간격 */
const VIEW_POLL_MS = 15_000;

type Access =
  | { kind: "loading" }
  | { kind: "edit" }
  /** locked: 다른 팀원이 단독 편집 중 · live: 다른 팀원이 실시간 편집기로 보고 있음 · free: 편집 권한이 비었음 · offline: 서버 연결 안 됨 */
  | { kind: "view"; reason: "locked" | "live" | "free" | "offline"; names: string[] };

type Props = Pick<DocEditorProps, "documentId" | "title" | "lastSavedAt" | "snapshots" | "storage"> & {
  /** 실시간 연결이 끊긴 동안 내가 쓴 내용 (편집 권한을 받으면 이어서, 못 받으면 버전으로 보관) */
  carry: Json | null;
  /** off: 실시간 동시 편집 미설정 · down: 실시간 연결 안 됨 */
  reason: "off" | "down";
  /** 실시간 다시 연결 (설정돼 있을 때만) */
  onRetryLive?: () => void;
};

/** JSON 본문에서 글자만 (버전 검색용) */
function jsonText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: unknown; content?: unknown };
  const own = typeof n.text === "string" ? n.text : "";
  const children = Array.isArray(n.content) ? n.content.map(jsonText).join(n.content.length > 1 ? "\n" : "") : "";
  return own + children;
}

/**
 * 단독 편집 모드 편집기 — 실시간 연결(Liveblocks)이 안 될 때 서버 사본을 한 번에 한 명만 편집.
 * 편집 권한을 받은 사람만 고칠 수 있고(자동 저장), 다른 팀원은 15초마다 새 내용을 보며 기다립니다.
 * 실시간 연결이 돌아오면 다음에 실시간으로 연 사람 화면에서 이 내용이 실시간 문서에 반영됩니다.
 */
export function SoloEditor({ documentId, title, lastSavedAt, snapshots, storage, carry, reason, onRetryLive }: Props) {
  const router = useRouter();
  const [access, setAccess] = useState<Access>({ kind: "loading" });
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(lastSavedAt);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showVersions, setShowVersions] = useState(false);
  const clearToast = useCallback(() => setToast(null), []);
  const stickyTop = useSyncExternalStore(subscribeAppHeader, appHeaderHeight, () => 0);
  const imageInput = useRef<HTMLInputElement>(null);

  const editorRef = useRef<Editor | null>(null);
  const accessRef = useRef<Access>(access);
  const dirty = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const serverEditedAt = useRef<string | null | undefined>(undefined);
  const carried = useRef(false);
  const lastInput = useRef(0);
  const savingRef = useRef(false);
  const flushRef = useRef<() => Promise<void>>(async () => {});

  const [extensions] = useState(() => editorExtensions({ live: false }));
  const [editorProps] = useState(() => ({ attributes: { class: "bx-editor", "aria-label": "문서 본문", "data-testid": "editor" } }));
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions,
    editorProps,
    onUpdate: () => {
      if (accessRef.current.kind !== "edit") return;
      dirty.current = true;
      lastInput.current = Date.now();
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => void flushRef.current(), SAVE_DELAY);
    },
  });

  const changeAccess = useCallback((next: Access) => {
    accessRef.current = next;
    setAccess(next);
    editorRef.current?.setEditable(next.kind === "edit");
  }, []);

  /** 서버 사본을 편집기에 (내 저장 대기 중인 편집이 없을 때만) */
  const showServer = useCallback((state: SoloState) => {
    const ed = editorRef.current;
    if (!ed || dirty.current || savingRef.current || state.lastEditedAt === serverEditedAt.current) return;
    serverEditedAt.current = state.lastEditedAt;
    const content = state.json ?? state.html ?? "";
    ed.commands.setContent(content, { emitUpdate: false });
    if (state.lastEditedAt) setSavedAt(state.lastEditedAt);
  }, []);

  const flush = useCallback(async () => {
    const ed = editorRef.current;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    if (!ed || !dirty.current || accessRef.current.kind !== "edit") return;
    dirty.current = false;
    setSaving(true);
    savingRef.current = true;
    const json = plainJson(ed);
    const result = await saveSolo(documentId, { json, text: ed.getText() });
    savingRef.current = false;
    setSaving(false);
    if (result.savedAt) {
      setError(null);
      setSavedAt(result.savedAt);
      serverEditedAt.current = result.savedAt;
    } else if (result.lost) {
      // 편집 권한이 끝남(탭을 오래 숨긴 사이 만료) → 아무도 이어 받지 않았으면 다시 받아 저장
      const again = await acquireSolo(documentId);
      if (again?.ok && again.lastEditedAt === serverEditedAt.current) {
        dirty.current = true;
        return void flushRef.current();
      }
      // 그 사이 다른 팀원이 고쳤으면 내 마지막 편집은 버전으로 보관하고 최신 내용으로
      await createSnapshot(documentId, { label: "단독 편집 권한이 끝나 저장 못 한 편집본 (자동)", json, text: ed.getText() });
      setToast("그 사이 다른 팀원이 고쳐 내 마지막 편집은 버전 기록에 따로 보관했습니다.");
      if (again) {
        showServer(again);
        changeAccess(again.ok ? { kind: "edit" } : { kind: "view", reason: again.reason, names: again.names });
      } else changeAccess({ kind: "view", reason: "offline", names: [] });
      router.refresh();
    } else {
      dirty.current = true;
      setError(result.error ?? "저장하지 못했습니다.");
      saveTimer.current = setTimeout(() => void flushRef.current(), 5000);
    }
  }, [documentId, changeAccess, showServer, router]);
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** 편집 권한 받기·연장 → 편집 / 보기 */
  const acquire = useCallback(async () => {
    const ed = editorRef.current;
    if (!ed) return;
    const result = await acquireSolo(documentId);
    if (!result) {
      if (accessRef.current.kind !== "edit") changeAccess({ kind: "view", reason: "offline", names: [] });
      return;
    }
    if (result.ok) {
      if (accessRef.current.kind === "edit") {
        // 권한이 잠시 끊긴 사이(탭을 오래 숨김) 다른 팀원이 고쳤으면 최신 내용으로 (내 저장 안 된 편집은 버전으로 보관)
        if (!savingRef.current && result.lastEditedAt !== serverEditedAt.current) {
          if (dirty.current) {
            dirty.current = false;
            await createSnapshot(documentId, { label: "다른 팀원 편집과 겹친 내 편집본 (자동)", json: plainJson(ed), text: ed.getText() });
            setToast("그 사이 다른 팀원이 고쳐 최신 내용으로 바꿨습니다. 내 편집은 버전 기록에 있습니다.");
          }
          showServer(result);
        }
        return;
      }
      if (carry && !carried.current) {
        // 연결이 끊긴 동안 쓴 내용으로 이어서 편집
        carried.current = true;
        serverEditedAt.current = result.lastEditedAt;
        changeAccess({ kind: "edit" });
        ed.commands.setContent(carry);
      } else {
        showServer(result);
        changeAccess({ kind: "edit" });
      }
      announceActivity(`「${title}」 ${SOLO_MARK} 중`);
      notifyChange("documents");
      return;
    }
    // 다른 팀원이 단독 편집 중이거나 실시간으로 보고 있음 → 보기만
    if (accessRef.current.kind === "edit") await flushRef.current();
    changeAccess({ kind: "view", reason: result.reason, names: result.names });
    showServer(result);
    announceActivity(`「${title}」 보는 중 (${SOLO_MARK} 모드)`);
    if (carry && !carried.current) {
      carried.current = true;
      await createSnapshot(documentId, { label: "연결이 끊긴 동안 쓴 편집본 (자동)", json: carry, text: jsonText(carry) });
      setToast("실시간 연결이 끊긴 동안 쓴 내용은 버전 기록에 따로 보관했습니다.");
      router.refresh();
    }
  }, [documentId, title, carry, changeAccess, showServer, router]);

  const acquireRef = useRef(acquire);
  useEffect(() => {
    acquireRef.current = acquire;
  }, [acquire]);

  // 처음 열 때 편집 권한 받기
  useEffect(() => {
    if (!editor) return;
    editorRef.current = editor;
    lastInput.current = Date.now();
    void acquireRef.current();
  }, [editor]);

  // 편집 중: 30초마다 권한 연장 (보고 있고 5분 안에 조작했을 때만 — 자리를 비우면 다른 팀원이 이어서 편집)
  // 보기만: 15초마다 서버 사본·권한 확인
  useEffect(() => {
    if (access.kind === "loading") return;
    const editing = access.kind === "edit";
    const id = setInterval(
      async () => {
        if (document.visibilityState !== "visible") return;
        if (editing) {
          if (Date.now() - lastInput.current <= IDLE_MS) void acquire();
          return;
        }
        // 서버 연결이 돌아오거나 실시간으로 보던 팀원이 나가면 편집 권한 받기
        if (access.reason === "offline" || access.reason === "live") return void acquire();
        const state = await fetchSoloState(documentId);
        if (!state) return;
        showServer(state);
        if (state.lock && (access.reason !== "locked" || access.names[0] !== state.lock.name)) changeAccess({ kind: "view", reason: "locked", names: [state.lock.name] });
        else if (!state.lock && access.reason === "locked") changeAccess({ kind: "view", reason: "free", names: [] });
      },
      editing ? RENEW_MS : VIEW_POLL_MS,
    );
    return () => clearInterval(id);
  }, [access, acquire, documentId, showServer, changeAccess]);

  // 조작 기록 (권한 연장 판단) · 탭으로 돌아오면 바로 권한 확인
  useEffect(() => {
    const touch = () => {
      lastInput.current = Date.now();
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible" || accessRef.current.kind !== "edit") return;
      touch();
      void acquireRef.current();
    };
    window.addEventListener("keydown", touch);
    window.addEventListener("pointerdown", touch);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("keydown", touch);
      window.removeEventListener("pointerdown", touch);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // 창을 닫거나 다른 화면으로: 남은 내용 저장 + 편집 권한 반납 → 다른 팀원이 이어서 편집
  useEffect(() => {
    const leave = () => {
      if (accessRef.current.kind !== "edit") return;
      const ed = editorRef.current;
      leaveSolo(documentId, dirty.current && ed ? { json: plainJson(ed), text: ed.getText() } : null);
      dirty.current = false;
      changeAccess({ kind: "loading" });
    };
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) void acquireRef.current();
    };
    window.addEventListener("pagehide", leave);
    window.addEventListener("pageshow", onShow);
    return () => {
      window.removeEventListener("pagehide", leave);
      window.removeEventListener("pageshow", onShow);
      const wasEditing = accessRef.current.kind === "edit";
      leave();
      announceActivity(null);
      if (wasEditing) notifyChange("documents");
    };
  }, [documentId, changeAccess]);

  // 붙여넣기·끌어놓기 이미지
  const insertImages = useCallback(
    async (files: File[], pos: number) => {
      const ed = editorRef.current;
      if (!ed || !files.length || accessRef.current.kind !== "edit") return;
      try {
        for (const [i, original] of files.entries()) {
          if (original.size > MAX_UPLOAD_BYTES) throw new Error(`이미지는 ${formatBytes(MAX_UPLOAD_BYTES)} 이하만 넣을 수 있습니다.`);
          const ext = original.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const file = /\.(png|jpe?g|gif|webp)$/i.test(original.name) ? original : new File([original], `붙여넣은-이미지.${ext}`, { type: original.type });
          setBusy(files.length > 1 ? `이미지 올리는 중… (${i + 1}/${files.length})` : "이미지 올리는 중…");
          const uploaded = await uploadFile(file, storage);
          const result = await createAsset(uploaded);
          if (result.error || !result.url) throw new Error(result.error ?? "이미지 등록 실패");
          ed.chain().insertContentAt(Math.min(pos, ed.state.doc.content.size), { type: "image", attrs: { src: result.url, alt: file.name } }).run();
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "이미지 업로드 실패");
      } finally {
        setBusy(null);
        if (imageInput.current) imageInput.current.value = "";
      }
    },
    [storage],
  );
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onImages = (e: Event) => {
      const { files, pos } = (e as CustomEvent<ImageFilesDetail>).detail;
      void insertImages(files, pos);
    };
    dom.addEventListener(IMAGE_FILES_EVENT, onImages);
    return () => dom.removeEventListener(IMAGE_FILES_EVENT, onImages);
  }, [editor, insertImages]);

  const openLink = useCallback(
    (href: string) => {
      let target: URL;
      try {
        target = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (target.origin === window.location.origin) router.push(`${target.pathname}${target.search}${target.hash}`);
      else if (target.protocol === "https:" || target.protocol === "http:") window.open(target.href, "_blank", "noopener,noreferrer");
    },
    [router],
  );

  const liveOnly = useCallback(() => setToast("위치 링크·위치 코멘트는 실시간 연결이 돌아오면 쓸 수 있습니다. 일반 코멘트는 코멘트 창에 남길 수 있어요."), []);

  async function saveVersion() {
    const ed = editorRef.current;
    if (!ed) return;
    const label = window.prompt("버전 이름 (예: 클라이언트 1차 보고본)", "");
    if (label === null) return;
    setBusy("버전 저장 중…");
    const result = await createSnapshot(documentId, { label, json: plainJson(ed), text: ed.getText() });
    setBusy(null);
    if (result.error) setError(result.error);
    else {
      setShowVersions(true);
      router.refresh();
    }
  }

  async function restore(snapshot: Snapshot) {
    const ed = editorRef.current;
    if (!ed || accessRef.current.kind !== "edit") return;
    if (!window.confirm(`「${snapshot.label}」 버전으로 되돌릴까요? (먼저 현재 내용을 버전으로 저장해 두는 것을 권장)`)) return;
    setBusy("복원 중…");
    const result = await getSnapshotContent(snapshot.id);
    setBusy(null);
    if (result.error || !result.json) return setError(result.error ?? "복원 실패");
    ed.commands.setContent(result.json);
  }

  /** 지금 화면의 최종본으로 Word·PDF (저장도 함께) */
  async function exportAs(format: "docx" | "pdf") {
    const ed = editorRef.current;
    if (!ed) return;
    setBusy(format === "pdf" ? "최종본 PDF 만드는 중…" : "최종본 Word 파일 만드는 중…");
    try {
      await flushRef.current();
      const res = await fetch(`/api/documents/${documentId}/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json: plainJson(ed) }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "파일을 만들지 못했습니다.");
      const href = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = href;
      link.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  const editing = access.kind === "edit";
  const names = access.kind === "view" ? access.names.join(", ") : "";

  return (
    <div className="space-y-3">
      <div
        className={cn("rounded-xl border px-4 py-3 text-sm", editing && reason === "off" ? "border-gray-200 bg-gray-50 text-gray-700" : "border-amber-200 bg-amber-50 text-amber-900")}
        data-testid="solo-banner"
      >
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="min-w-0 flex-1">
            {access.kind === "loading" && "단독 편집 모드로 여는 중…"}
            {editing &&
              (reason === "off" ? (
                <>
                  실시간 동시 편집이 설정되지 않아 <b>한 명씩 편집</b>합니다. 지금은 내가 편집 중이고, 다른 팀원은 보기만 합니다.
                </>
              ) : (
                <>
                  ⚠ 실시간 연결이 안 돼 <b>단독 편집 모드</b>로 열었습니다. 지금은 <b>나만 편집</b>할 수 있고 다른 팀원은 보기만 합니다. 자동으로 저장되고,
                  실시간 연결이 돌아오면 이 내용이 실시간 문서에 반영됩니다.
                </>
              ))}
            {access.kind === "view" && access.reason === "locked" && (
              <>
                <Lock className="mr-1 inline h-3.5 w-3.5" />
                {names ? <b>{names}</b> : "다른 팀원"}님이 단독 편집 중이라 <b>보기만</b> 할 수 있습니다. 내용은 15초마다 새로 고칩니다.
              </>
            )}
            {access.kind === "view" && access.reason === "live" && (
              <>
                <b>{names}</b>님이 실시간 편집 화면에 연결돼 있어, 따로 편집하면 내용이 갈라질 수 있어 <b>보기만</b> 합니다. 인터넷 연결을 확인한 뒤 「실시간 다시 연결」을 눌러 보세요.
              </>
            )}
            {access.kind === "view" && access.reason === "free" && "단독 편집하던 팀원이 끝냈습니다. 이제 편집할 수 있어요."}
            {access.kind === "view" && access.reason === "offline" && "서버에 연결할 수 없습니다. 인터넷 연결을 확인하세요. 연결되면 자동으로 다시 시도합니다."}
          </p>
          <div className="flex shrink-0 gap-2">
            {access.kind === "view" && access.reason === "free" && (
              <button type="button" className="btn-primary btn-sm" onClick={() => void acquire()}>
                지금 편집하기
              </button>
            )}
            {onRetryLive && (
              <button type="button" className="btn-secondary btn-sm" onClick={onRetryLive}>
                <RefreshCw className="h-3.5 w-3.5" />
                실시간 다시 연결
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-gray-500" data-testid="doc-collaborators">
          {editing ? "단독 편집 중" : "보기 전용"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </span>
          ) : error ? (
            <span className="text-xs text-red-600">{error}</span>
          ) : (
            <span className="flex items-center gap-1.5 text-xs text-gray-500" data-testid="sync-status">
              <span className={cn("h-1.5 w-1.5 rounded-full", editing ? (saving ? "bg-amber-400" : "bg-emerald-500") : "bg-gray-300")} />
              {editing ? (saving ? "저장 중…" : `자동 저장됨${savedAt ? ` · ${formatClock(savedAt)}` : ""}`) : `보기 전용${savedAt ? ` · ${formatClock(savedAt)} 저장본` : ""}`}
            </span>
          )}
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowVersions((v) => !v)}>
            <History className="h-3.5 w-3.5" />
            버전 기록 ({snapshots.length})
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={saveVersion} disabled={!editor}>
            <Save className="h-3.5 w-3.5" />
            버전 저장
          </button>
          <button type="button" className="btn-secondary btn-sm" onClick={() => exportAs("pdf")} disabled={!editor} title="지금 화면의 최종본을 PDF로 저장 (지난 버전·코멘트 제외)">
            <FileDown className="h-3.5 w-3.5" />
            PDF로 저장
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={() => exportAs("docx")} disabled={!editor} title="지금 화면의 최종본을 Word 파일로 저장 (지난 버전·코멘트 제외)">
            <FileDown className="h-3.5 w-3.5" />
            Word로 내보내기
          </button>
        </div>
      </div>

      {showVersions && <VersionPanel snapshots={snapshots} onRestore={editing ? restore : undefined} />}

      <div className="rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        {editor && editing ? (
          <Toolbar editor={editor} onImage={() => imageInput.current?.click()} onCopyPositionLink={liveOnly} onComment={liveOnly} stickyTop={stickyTop} />
        ) : (
          <div className="h-11 border-b border-gray-200" />
        )}
        <div className="rounded-b-xl bg-gray-50/60 px-2 py-4 sm:px-6 sm:py-8">
          <div className="mx-auto min-h-[60vh] max-w-[820px] bg-white px-5 py-6 shadow-sm ring-1 ring-gray-200/70 sm:px-12 sm:py-10">
            <EditorContent editor={editor} />
            {editor && (
              <BubbleMenu editor={editor} pluginKey="bxLinkMenu" shouldShow={showLinkMenu} options={LINK_MENU_OPTIONS} className="z-30">
                <LinkMenu editor={editor} onOpen={openLink} />
              </BubbleMenu>
            )}
          </div>
        </div>
      </div>
      <input
        ref={imageInput}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="hidden"
        onChange={(e) => editor && void insertImages(Array.from(e.target.files ?? []), editor.state.selection.from)}
      />
      <Toast message={toast} onDone={clearToast} />
    </div>
  );
}
