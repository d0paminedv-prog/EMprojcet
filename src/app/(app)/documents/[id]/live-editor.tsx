"use client";

import "@liveblocks/react-ui/styles.css";
import "@liveblocks/react-tiptap/styles.css";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ClientSideSuspense, RoomProvider } from "@liveblocks/react";
import { useOthers, useStatus, useUpdateMyPresence } from "@liveblocks/react/suspense";
import { useLiveblocksExtension } from "@liveblocks/react-tiptap";
import { findParentNode } from "@tiptap/core";
import { TextSelection } from "@tiptap/pm/state";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
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
  ExternalLink,
  Eye,
  EyeOff,
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
  MapPin,
  MessageSquarePlus,
  Minus,
  PaintBucket,
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
import { announceLocation, notifyChange, useRealtime } from "@/components/realtime";
import { absoluteUrl, shareOrCopy, Toast } from "@/components/share-link";
import { clip, documentPath, parseAppLink } from "@/lib/links";
import { EMPTY_PRESENCE } from "@/lib/presence";
import { uploadFile, type StorageClientConfig } from "@/lib/upload-client";
import { CELL_COLORS } from "@/lib/colors";
import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { cn, formatBytes } from "@/lib/utils";
import { createAsset, createSnapshot, getSnapshotContent, saveLiveContent } from "../live-actions";
import { emit, FOCUS_ANCHOR_EVENT, NEW_COMMENT_EVENT, type FocusAnchorDetail, type NewCommentDetail } from "./comment-events";
import { CommentMarks, setCommentAnchors, type CommentAnchor } from "./comment-marks";
import { IMAGE_FILES_EVENT, ImagePasteDrop, type ImageFilesDetail } from "./editor-images";
import { ColoredTableCell, ColoredTableHeader } from "./table-colors";
import {
  COPY_POSITION_EVENT,
  decodePosition,
  describePosition,
  encodePosition,
  OPEN_LINK_EVENT,
  PositionLinks,
  scrollToPos,
  sectionTitleAt,
  showTarget,
} from "./doc-position";

type Snapshot = { id: string; label: string; createdAt: string; createdByName: string | null };

type Props = {
  documentId: string;
  title: string;
  /** 공유받은 위치 링크의 위치 코드 (?at=) */
  focusAt: string | null;
  roomId: string;
  initialHtml: string | null;
  lastSavedAt: string | null;
  snapshots: Snapshot[];
  storage: StorageClientConfig;
  /** 본문에 표시할 열린 위치 코멘트 */
  commentAnchors: CommentAnchor[];
};

/** 입력을 멈추고 이만큼 지나면 검색·내보내기용 사본을 서버에 저장 (본문 자체는 Liveblocks 에 즉시 저장) */
const SAVE_DELAY = 800;

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
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
}

// ---------------- 툴바 ----------------

/** 지금 표의 열 너비 지정을 모두 지워 페이지 너비에 맞게 균등 분배 */
function resetColumnWidths(editor: Editor) {
  editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const table = findParentNode((node) => node.type.name === "table")(state.selection);
      if (!table) return false;
      table.node.descendants((node, pos) => {
        if (node.type.name === "tableCell" || node.type.name === "tableHeader") {
          if (node.attrs.colwidth) tr.setNodeMarkup(table.start + pos, undefined, { ...node.attrs, colwidth: null });
          return false;
        }
        return true;
      });
      return true;
    })
    .run();
}

function editLink(editor: Editor) {
  const prev = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt("링크 주소 (비우면 링크 해제)", prev ?? "https://");
  if (url === null) return;
  const chain = editor.chain().focus().extendMarkRange("link");
  if (!url.trim() || url.trim() === "https://") chain.unsetLink().run();
  else chain.setLink({ href: url.trim() }).run();
}

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
        "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-1.5 text-gray-600 transition hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30",
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

const PALETTE_WIDTH = 240;

// 화면 위에 붙어 있는 앱 머리글(모바일 상단 메뉴) 높이 — 편집 도구 막대를 그 바로 아래에 고정
function appHeaderHeight(): number {
  const header = document.querySelector<HTMLElement>("[data-app-header]");
  return header && getComputedStyle(header).display !== "none" ? Math.round(header.getBoundingClientRect().height) : 0;
}
function subscribeAppHeader(onChange: () => void) {
  const header = document.querySelector<HTMLElement>("[data-app-header]");
  const observer = header ? new ResizeObserver(onChange) : null;
  if (header) observer?.observe(header);
  window.addEventListener("resize", onChange);
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", onChange);
  };
}

/** 표 셀 색 채우기 — 지금 칸 또는 끌어서 선택한 여러 칸에 배경색 */
function CellColorPicker({ editor, current }: { editor: Editor; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const boxRef = useRef<HTMLDivElement>(null);

  // 팔레트를 버튼 바로 아래에 (화면 밖으로 나가지 않게)
  const place = useCallback(() => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - PALETTE_WIDTH - 8)) });
  }, []);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, { passive: true, capture: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, { capture: true });
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    // 바깥을 누르거나 Esc 를 누르면 닫힘
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const apply = (color: string | null) => {
    editor.chain().focus().setCellAttribute("backgroundColor", color).run();
    setOpen(false);
  };
  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div ref={boxRef} className="relative shrink-0">
      <ToolButton
        label="셀 색 채우기"
        active={open}
        onClick={() => {
          place();
          setOpen((v) => !v);
        }}
      >
        <span className="flex flex-col items-center">
          <PaintBucket className="h-4 w-4" />
          <span className={cn("mt-0.5 h-1 w-4 rounded-sm", !current && "border border-gray-300")} style={current ? { backgroundColor: current } : undefined} />
        </span>
      </ToolButton>
      {open && (
        <div
          className="fixed z-40 rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
          style={{ top: pos.top, left: pos.left, width: PALETTE_WIDTH }}
          role="dialog"
          aria-label="셀 색 채우기"
          data-testid="cell-color-palette"
        >
          <div className="grid grid-cols-9 gap-1">
            {CELL_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onMouseDown={keep}
                onClick={() => apply(c.value)}
                title={c.label}
                aria-label={`${c.label} 채우기`}
                className={cn("h-5 w-5 rounded border border-black/10 hover:scale-110", current === c.value && "ring-2 ring-brand-500 ring-offset-1")}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-gray-100 pt-2 text-xs">
            <button type="button" onMouseDown={keep} onClick={() => apply(null)} className="btn-ghost btn-sm">
              색 없음
            </button>
            <label className="flex items-center gap-1.5 text-gray-600">
              직접 선택
              {/* 색을 고르는 동안 편집기 선택(칸)이 유지되도록 포커스를 옮기지 않고 적용 */}
              <input
                type="color"
                value={current ?? "#fef9c3"}
                onChange={(e) => editor.chain().setCellAttribute("backgroundColor", e.target.value).run()}
                className="h-6 w-8 cursor-pointer rounded border border-gray-200 bg-white p-0"
                aria-label="직접 색 선택"
              />
            </label>
          </div>
          <p className="mt-1.5 text-[11px] text-gray-400">여러 칸을 끌어서 선택하면 한 번에 채울 수 있어요</p>
        </div>
      )}
    </div>
  );
}

function Toolbar({
  editor,
  onImage,
  onCopyPositionLink,
  onComment,
  stickyTop,
}: {
  editor: Editor;
  onImage: () => void;
  onCopyPositionLink: () => void;
  onComment: () => void;
  /** 문서를 내려도 화면 위(모바일은 상단 메뉴 아래)에 붙어 따라오는 위치 */
  stickyTop: number;
}) {
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
      cellColor: ((e.getAttributes("tableCell").backgroundColor ?? e.getAttributes("tableHeader").backgroundColor) as string | null | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();

  return (
    <div
      className="sticky z-10 flex items-center gap-0.5 overflow-x-auto rounded-t-xl border-b border-gray-200 bg-white px-2 py-1.5 shadow-[0_1px_0_rgba(16,24,40,0.04)] sm:flex-wrap sm:overflow-visible"
      style={{ top: stickyTop }}
      role="toolbar"
      aria-label="서식 도구"
      data-testid="editor-toolbar"
    >
      <ToolButton label="실행 취소" onClick={() => chain().undo().run()} disabled={!s.canUndo}>
        <Undo2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="다시 실행" onClick={() => chain().redo().run()} disabled={!s.canRedo}>
        <Redo2 className="h-4 w-4" />
      </ToolButton>
      <Sep />
      <select
        aria-label="문단 스타일"
        className="h-8 shrink-0 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700"
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
      <ToolButton label="링크" active={s.link} onClick={() => editLink(editor)}>
        <Link2 className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="이 위치 링크 복사" onClick={onCopyPositionLink}>
        <MapPin className="h-4 w-4" />
      </ToolButton>
      <ToolButton label="코멘트 추가" onClick={onComment}>
        <MessageSquarePlus className="h-4 w-4" />
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
          <CellColorPicker editor={editor} current={s.cellColor} />
          <ToolButton label="열 너비 균등하게" onClick={() => resetColumnWidths(editor)}>
            <span className="text-[11px] font-semibold">↔</span>
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

// 말풍선 설정은 고정 값으로 — 렌더마다 새로 만들면 BubbleMenu 가 매번 편집기 트랜잭션을 보내
// 방금 클릭한 커서 위치를 이전 위치로 덮어씁니다.
const showLinkMenu = ({ editor, view }: { editor: Editor; view: Editor["view"] }) => view.hasFocus() && editor.isActive("link");
const LINK_MENU_OPTIONS = { strategy: "fixed", placement: "bottom-start", offset: 6, flip: true, shift: { padding: 8 } } as const;

const showSelectionMenu = ({ editor, view, state }: { editor: Editor; view: Editor["view"]; state: Editor["state"] }) =>
  view.hasFocus() && state.selection instanceof TextSelection && !state.selection.empty && !editor.isActive("link");
const SELECTION_MENU_OPTIONS = { strategy: "fixed", placement: "top", offset: 8, flip: true, shift: { padding: 8 } } as const;

/** 글을 선택하면 뜨는 말풍선: 코멘트 / 위치 링크 */
function SelectionMenu({ onComment, onCopyLink }: { onComment: () => void; onCopyLink: () => void }) {
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-lg" data-testid="selection-menu">
      <button type="button" onMouseDown={keep} onClick={onComment} className="btn-ghost btn-sm">
        <MessageSquarePlus className="h-3.5 w-3.5" />
        코멘트
      </button>
      <button type="button" onMouseDown={keep} onClick={onCopyLink} className="btn-ghost btn-sm">
        <MapPin className="h-3.5 w-3.5" />
        위치 링크
      </button>
    </div>
  );
}

/** 커서가 링크 안에 있을 때 뜨는 말풍선: 열기 / 수정 / 해제 */
function LinkMenu({ editor, onOpen }: { editor: Editor; onOpen: (href: string) => void }) {
  const href = useEditorState({ editor, selector: ({ editor: e }) => (e.isActive("link") ? String(e.getAttributes("link").href ?? "") : "") });
  if (!href) return null;
  const app = typeof window !== "undefined" ? parseAppLink(new URL(href, window.location.origin).href, window.location.origin) : null;
  const label = app?.documentId ? (app.at ? "문서 위치 링크" : app.page ? `문서 링크 · ${app.page}쪽` : "문서 링크") : href.replace(/^https?:\/\//, "");
  const keep = (e: React.MouseEvent) => e.preventDefault();
  return (
    <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 text-xs shadow-lg" data-testid="link-menu">
      <span className="max-w-[14rem] truncate px-1.5 text-gray-500" title={href}>
        {label}
      </span>
      <button type="button" onMouseDown={keep} onClick={() => onOpen(href)} className="btn-primary btn-sm">
        <ExternalLink className="h-3.5 w-3.5" />
        열기
      </button>
      <button type="button" onMouseDown={keep} onClick={() => editLink(editor)} className="btn-ghost btn-sm">
        수정
      </button>
      <button type="button" onMouseDown={keep} onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()} className="btn-ghost btn-sm">
        해제
      </button>
    </div>
  );
}

// ---------------- 접속자 / 동기화 상태 ----------------

/** 함께 편집 중인 팀원과 각자 있는 곳. 누르면 그 위치로 이동, 👁 로 따라가기 */
function Collaborators({ editor }: { editor: Editor | null }) {
  const others = useOthers();
  const [followId, setFollowId] = useState<string | null>(null);
  const people = new Map<string, { name: string; color: string; at: string | null; section: string | null }>();
  for (const o of others) {
    if (!o.id || !o.info) continue;
    const prev = people.get(o.id);
    if (!prev || (!prev.at && o.presence.at)) people.set(o.id, { ...o.info, at: o.presence.at, section: o.presence.section });
  }
  const list = [...people.entries()];
  const followed = followId ? people.get(followId) : undefined;
  const following = followed ? followId : null;
  const followedAt = followed?.at ?? null;

  // 따라가기: 그 팀원의 커서가 움직이거나 그 근처 글이 바뀌면 화면을 따라 이동
  useEffect(() => {
    if (!editor || !followedAt) return;
    const follow = () => {
      const target = decodePosition(editor.state, followedAt);
      if (target) scrollToPos(editor.view, target.from);
    };
    follow();
    editor.on("update", follow);
    return () => {
      editor.off("update", follow);
    };
  }, [editor, followedAt]);

  // 직접 화면을 움직이거나 입력하면 따라가기 멈춤
  useEffect(() => {
    if (!following) return;
    const stop = () => setFollowId(null);
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchmove", stop, { passive: true });
    window.addEventListener("keydown", stop);
    return () => {
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchmove", stop);
      window.removeEventListener("keydown", stop);
    };
  }, [following]);

  const jump = (at: string | null) => {
    if (!editor || !at) return;
    const target = decodePosition(editor.state, at);
    if (target) showTarget(editor.view, target, 1500);
  };

  if (!list.length) {
    return (
      <span className="text-xs text-gray-500" data-testid="doc-collaborators">
        혼자 편집 중
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5" data-testid="doc-collaborators">
      {list.map(([id, p]) => (
        <span
          key={id}
          className={cn("flex items-center rounded-full border bg-white py-0.5 pl-0.5 pr-0.5 text-xs", following === id ? "border-brand-300 ring-2 ring-brand-100" : "border-gray-200")}
          data-testid="collaborator"
        >
          <button
            type="button"
            onClick={() => jump(p.at)}
            disabled={!p.at}
            className="flex min-w-0 items-center gap-1.5 rounded-full pr-1.5 hover:bg-gray-50 disabled:cursor-default"
            title={p.at ? `${p.name}님이 있는 위치로 이동` : `${p.name}님 (아직 문서를 누르지 않음)`}
          >
            <Avatar name={p.name} color={p.color} size="sm" />
            <span className="font-medium text-gray-800">{p.name}</span>
            {p.section && <span className="max-w-[10rem] truncate text-gray-500">· {p.section}</span>}
          </button>
          {p.at && (
            <button
              type="button"
              onClick={() => setFollowId(following === id ? null : id)}
              className={cn("rounded-full p-1 hover:bg-gray-100", following === id ? "text-brand-600" : "text-gray-400")}
              aria-label={following === id ? `${p.name}님 따라가기 멈추기` : `${p.name}님 따라가기`}
              title={following === id ? "따라가기 멈추기" : "이 팀원이 편집하는 곳을 따라가기"}
            >
              {following === id ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          )}
        </span>
      ))}
      {followed && <span className="text-xs text-brand-700">{followed.name}님을 따라가는 중 · 화면을 움직이면 멈춰요</span>}
    </div>
  );
}

/** 내 편집이 서버에 모두 반영(synchronized)될 때까지 기다림 (최대 ms) */
function waitForDocSync(editor: Editor, ms = 5000): Promise<void> {
  const provider = (editor.storage as unknown as Record<string, LiveblocksStorage | undefined>).liveblocksExtension?.provider;
  if (!provider || provider.getStatus() === "synchronized") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      provider.off("status", check);
      resolve();
    };
    const check = () => {
      if (provider.getStatus() === "synchronized") done();
    };
    const timer = setTimeout(done, ms);
    provider.on("status", check);
  });
}

/** 이 문서의 Yjs 동기화 상태 (loading → synchronizing ⇄ synchronized) */
function useDocSyncStatus(editor: Editor | null): string {
  const provider = editor ? (editor.storage as unknown as Record<string, LiveblocksStorage | undefined>).liveblocksExtension?.provider : undefined;
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!provider) return () => {};
      provider.on("status", onChange);
      return () => provider.off("status", onChange);
    },
    [provider],
  );
  return useSyncExternalStore(subscribe, () => provider?.getStatus() ?? "loading", () => "loading");
}

/** 자동 저장 상태: 입력은 즉시 실시간 저장, 연결이 끊겨도 다시 연결되면 이어서 저장 */
function SyncBadge({ editor, saving, savedAt, error }: { editor: Editor | null; saving: boolean; savedAt: string | null; error: string | null }) {
  const sync = useDocSyncStatus(editor);
  const connection = useStatus();
  if (error) return <span className="text-xs text-red-600">{error}</span>;
  const offline = connection === "reconnecting" || connection === "disconnected";
  const busy = sync !== "synchronized" || saving;
  return (
    <span className="flex items-center gap-1.5 text-xs text-gray-500" data-testid="sync-status" title="입력하는 즉시 모든 팀원에게 저장·반영됩니다">
      <span className={cn("h-1.5 w-1.5 rounded-full", offline ? "bg-red-500" : busy ? "bg-amber-400" : "bg-emerald-500")} />
      {offline ? "연결 끊김 · 다시 연결되면 자동 저장" : sync === "loading" ? "불러오는 중…" : busy ? "저장 중…" : `자동 저장됨${savedAt ? ` · ${formatClock(savedAt)}` : ""}`}
    </span>
  );
}

// ---------------- 편집기 ----------------

function CollaborativeEditor({ documentId, title, focusAt, initialHtml, lastSavedAt, snapshots, storage, commentAnchors }: Omit<Props, "roomId">) {
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
  const [toast, setToast] = useState<string | null>(null);
  const clearToast = useCallback(() => setToast(null), []);
  const stickyTop = useSyncExternalStore(subscribeAppHeader, appHeaderHeight, () => 0);

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
    // 열 경계를 끌어 너비 조절 (너비는 표 안에 저장되어 팀원에게 실시간 반영)
    TableKit.configure({ table: { resizable: true, cellMinWidth: 48 }, tableCell: false, tableHeader: false }),
    // 셀 색 채우기(배경색) 속성을 더한 표 칸
    ColoredTableCell,
    ColoredTableHeader,
    Image,
    Highlight,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Placeholder.configure({ placeholder: "여기에 내용을 입력하세요. 팀원이 같은 문서를 열면 함께 편집됩니다." }),
    PositionLinks,
    ImagePasteDrop,
    CommentMarks,
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

  /** 문서 안 위치(from~to) 링크 복사 */
  const copyPositionLink = useCallback(
    async (from: number, to = from) => {
      const ed = editorRef.current;
      if (!ed) return;
      const code = encodePosition(ed.state, from, to);
      if (!code) return setToast("아직 동기화 중입니다. 잠시 후 다시 시도하세요.");
      const result = await shareOrCopy({ title, url: absoluteUrl(documentPath(documentId, { at: code })), detail: describePosition(ed.state.doc, from, to) });
      if (result === "copied") setToast("이 위치로 바로 가는 링크를 복사했습니다.");
    },
    [documentId, title],
  );

  const openLink = useCallback(
    (href: string) => {
      let url: URL;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }
      if (url.origin === window.location.origin) router.push(`${url.pathname}${url.search}${url.hash}`);
      else if (url.protocol === "https:" || url.protocol === "http:") window.open(url.href, "_blank", "noopener,noreferrer");
    },
    [router],
  );

  // 제목 옆 🔗 버튼, Ctrl(⌘)+클릭한 링크
  useEffect(() => {
    if (!editor) return;
    const dom = editor.view.dom;
    const onCopy = (e: Event) => void copyPositionLink(Number((e as CustomEvent).detail));
    const onOpen = (e: Event) => openLink(String((e as CustomEvent).detail));
    dom.addEventListener(COPY_POSITION_EVENT, onCopy);
    dom.addEventListener(OPEN_LINK_EVENT, onOpen);
    return () => {
      dom.removeEventListener(COPY_POSITION_EVENT, onCopy);
      dom.removeEventListener(OPEN_LINK_EVENT, onOpen);
    };
  }, [editor, copyPositionLink, openLink]);

  /**
   * 이미지 올리고 pos 위치에 넣기 (툴바·붙여넣기·끌어놓기 공용).
   * 올리는 동안 다른 팀원이 앞쪽을 편집해도 제자리에 들어가도록 위치를 Yjs 상대 위치로 기억합니다.
   */
  const insertImages = useCallback(
    async (files: File[], pos: number) => {
      const ed = editorRef.current;
      if (!ed || !files.length) return;
      const anchor = encodePosition(ed.state, pos);
      try {
        for (const [i, original] of files.entries()) {
          if (original.size > MAX_UPLOAD_BYTES) throw new Error(`이미지는 ${formatBytes(MAX_UPLOAD_BYTES)} 이하만 넣을 수 있습니다.`);
          // 캡처 붙여넣기는 파일 이름이 없거나 image.png 이므로 형식에 맞는 이름을 붙임
          const ext = original.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
          const file = /\.(png|jpe?g|gif|webp)$/i.test(original.name) ? original : new File([original], `붙여넣은-이미지.${ext}`, { type: original.type });
          setBusy(files.length > 1 ? `이미지 올리는 중… (${i + 1}/${files.length})` : "이미지 올리는 중…");
          const uploaded = await uploadFile(file, storage);
          const result = await createAsset(uploaded);
          if (result.error || !result.url) throw new Error(result.error ?? "이미지 등록 실패");
          const target = anchor ? decodePosition(ed.state, anchor) : null;
          const at = Math.min(target?.from ?? ed.state.selection.from, ed.state.doc.content.size);
          ed.chain().insertContentAt(at, { type: "image", attrs: { src: result.url, alt: file.name } }).run();
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

  // 본문 코멘트 표시 (목록이 실제로 바뀔 때만 — 매 렌더 트랜잭션은 커서를 되돌릴 수 있음)
  const anchorsKey = JSON.stringify(commentAnchors);
  useEffect(() => {
    if (editor) setCommentAnchors(editor.view, JSON.parse(anchorsKey) as CommentAnchor[]);
  }, [editor, anchorsKey]);

  // 코멘트 패널에서 인용을 누르면 본문 그 위치로
  useEffect(() => {
    if (!editor) return;
    const onFocusAnchor = (e: Event) => {
      const target = decodePosition(editor.state, (e as CustomEvent<FocusAnchorDetail>).detail.anchor);
      if (!target) return;
      showTarget(editor.view, target, 2500);
      if (target.changed) setToast("코멘트를 단 글이 바뀌어 가장 가까운 위치로 이동했습니다.");
    };
    window.addEventListener(FOCUS_ANCHOR_EVENT, onFocusAnchor);
    return () => window.removeEventListener(FOCUS_ANCHOR_EVENT, onFocusAnchor);
  }, [editor]);

  /** 선택한 글(없으면 커서가 있는 문단)에 코멘트 달기 → 코멘트 패널 입력칸 */
  const startComment = useCallback(() => {
    const ed = editorRef.current;
    if (!ed) return;
    let { from, to } = ed.state.selection;
    if (from === to) {
      const $pos = ed.state.doc.resolve(from);
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).isTextblock) {
          from = $pos.start(d);
          to = $pos.end(d);
          break;
        }
      }
    }
    const quote = clip(ed.state.doc.textBetween(from, to, " "), 120);
    if (from === to || !quote) return setToast("코멘트를 달 글을 선택하세요.");
    const anchor = encodePosition(ed.state, from, to);
    if (!anchor) return setToast("아직 동기화 중입니다. 잠시 후 다시 시도하세요.");
    emit<NewCommentDetail>(NEW_COMMENT_EVENT, { anchor, quote });
  }, []);

  // 내 커서 위치를 함께 편집하는 팀원(문서 방)과 사이드바 활동(팀 방)에 공유
  const updateMyPresence = useUpdateMyPresence();
  useEffect(() => {
    if (!editor) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interacted = false;
    const publish = () => {
      if (!interacted && !editor.isFocused) return;
      interacted = true;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const { from } = editor.state.selection;
        const location = { at: encodePosition(editor.state, from), section: sectionTitleAt(editor.state.doc, from) };
        updateMyPresence(location);
        announceLocation(location);
      }, 300);
    };
    editor.on("selectionUpdate", publish);
    editor.on("focus", publish);
    return () => {
      clearTimeout(timer);
      editor.off("selectionUpdate", publish);
      editor.off("focus", publish);
    };
  }, [editor, updateMyPresence]);

  // 붙여넣기·끌어놓은 이미지
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

  // 공유받은 위치 링크로 열었으면 동기화가 끝난 뒤 그 위치로 이동 + 강조
  useEffect(() => {
    if (!editor || !focusAt) return;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = () => {
      const target = decodePosition(editor.state, focusAt);
      if (!target) {
        if (++tries < 60) timer = setTimeout(attempt, 150);
        else setToast("공유된 위치를 찾지 못했습니다.");
        return;
      }
      showTarget(editor.view, target);
      setToast(target.changed ? "공유된 위치의 내용이 바뀌어 가장 가까운 위치로 이동했습니다." : "공유된 위치로 이동했습니다.");
    };
    timer = setTimeout(attempt, 0);
    return () => clearTimeout(timer);
  }, [editor, focusAt]);

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

  // 창을 닫거나 새로고침할 때: 서버 액션은 중간에 끊길 수 있어 keepalive 요청으로 남은 사본 저장
  useEffect(() => {
    const onPageHide = () => {
      const ed = editorRef.current;
      if (!ed || !dirty.current) return;
      dirty.current = false;
      const body = JSON.stringify({ json: plainJson(ed), text: ed.getText() });
      void fetch(`/api/documents/${documentId}/content`, { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: body.length < 60_000 }).catch(() => {});
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, [documentId]);

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

  /**
   * 최종 버전만 내려받기: 내 편집이 서버에 다 반영될 때까지 기다린 뒤, 지금 화면의 본문(팀원 편집 포함)으로
   * Word(.docx)·PDF 를 만듭니다. 지난 버전 기록이나 코멘트는 들어가지 않습니다.
   */
  async function exportAs(format: "docx" | "pdf") {
    const ed = editorRef.current;
    if (!ed) return;
    setBusy(format === "pdf" ? "최종본 PDF 만드는 중…" : "최종본 Word 파일 만드는 중…");
    try {
      await waitForDocSync(ed);
      const json = plainJson(ed);
      dirty.current = true;
      void flush(); // 서버 사본도 같은 최종본으로 맞춤
      const res = await fetch(`/api/documents/${documentId}/${format}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ json }) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "파일을 만들지 못했습니다.");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `${title.replace(/[\\/:*?"<>|]/g, "_")}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      notifyChange("documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일을 만들지 못했습니다.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Collaborators editor={editor} />
        <div className="flex flex-wrap items-center gap-2">
          {busy ? (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {busy}
            </span>
          ) : (
            <SyncBadge editor={editor} saving={saving} savedAt={savedAt} error={error} />
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

      {/* overflow-hidden 을 쓰지 않아야 도구 막대가 문서를 따라 내려옴 (sticky) */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)]">
        {editor ? (
          <Toolbar
            editor={editor}
            onImage={() => imageInput.current?.click()}
            onCopyPositionLink={() => void copyPositionLink(editor.state.selection.from, editor.state.selection.to)}
            onComment={startComment}
            stickyTop={stickyTop}
          />
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
            {editor && (
              <BubbleMenu editor={editor} pluginKey="bxSelectionMenu" shouldShow={showSelectionMenu} options={SELECTION_MENU_OPTIONS} className="z-30">
                <SelectionMenu onComment={startComment} onCopyLink={() => void copyPositionLink(editor.state.selection.from, editor.state.selection.to)} />
              </BubbleMenu>
            )}
          </div>
        </div>
      </div>
      <input ref={imageInput} type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(e) => editor && void insertImages(Array.from(e.target.files ?? []), editor.state.selection.from)} />
      <Toast message={toast} onDone={clearToast} />
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
    <RoomProvider id={roomId} initialPresence={EMPTY_PRESENCE}>
      <ClientSideSuspense fallback={<EditorLoading />}>
        <CollaborativeEditor {...rest} />
      </ClientSideSuspense>
    </RoomProvider>
  );
}
