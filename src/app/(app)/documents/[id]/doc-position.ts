import { Extension } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import * as Y from "yjs";
import { absolutePositionToRelativePosition, relativePositionToAbsolutePosition, ySyncPluginKey } from "y-prosemirror";
import { clip } from "@/lib/links";

/**
 * 문서 안 위치 링크.
 * 위치는 Yjs 상대 위치로 저장해 앞뒤에 글이 추가·삭제되어도 같은 문장을 가리킵니다.
 */

type YSyncState = { doc: Y.Doc; type: Y.XmlFragment; binding: { mapping: Map<Y.AbstractType<unknown>, PMNode | PMNode[]> } | null };

function ySync(state: EditorState): (YSyncState & { binding: NonNullable<YSyncState["binding"]> }) | null {
  const s = ySyncPluginKey.getState(state) as YSyncState | undefined;
  return s?.doc && s.type && s.binding ? (s as YSyncState & { binding: NonNullable<YSyncState["binding"]> }) : null;
}

const toBase64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (s: string) => {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
};

/** from 앞쪽에서 가장 가까운 제목의 위치 (from 이 제목 안이면 null) */
function sectionHeadingPos(doc: PMNode, from: number): number | null {
  let found: number | null = null;
  doc.nodesBetween(0, Math.min(from, doc.content.size), (node, pos) => {
    if (node.type.name === "heading") {
      found = pos + node.nodeSize <= from ? pos + 1 : null;
      return false;
    }
    return true;
  });
  return found;
}

/**
 * 편집기 위치(from~to) → 링크용 코드: 「시작[.끝][~소속 제목]」
 * 소속 제목은 링크한 글이 통째로 지워졌을 때 대신 이동할 곳입니다.
 * (지워진 글은 Yjs 가 정리해 버려 원래 자리를 알 수 없음)
 */
export function encodePosition(state: EditorState, from: number, to = from): string | null {
  const y = ySync(state);
  if (!y) return null;
  const encode = (pos: number) => toBase64Url(Y.encodeRelativePosition(absolutePositionToRelativePosition(pos, y.type, y.binding.mapping)));
  const heading = sectionHeadingPos(state.doc, from);
  return `${to > from ? `${encode(from)}.${encode(to)}` : encode(from)}${heading !== null ? `~${encode(heading)}` : ""}`;
}

export type ResolvedPosition = { from: number; to: number; changed: boolean };

/** 링크용 코드 → 지금 문서의 위치. 아직 동기화 전이면 null */
export function decodePosition(state: EditorState, code: string): ResolvedPosition | null {
  const y = ySync(state);
  if (!y || y.type.length === 0 || state.doc.content.size <= 2) return null;
  const [main, fallbackCode] = code.split("~");
  let rels: Y.RelativePosition[];
  let fallback: Y.RelativePosition | null = null;
  try {
    rels = main.split(".").slice(0, 2).map((part) => Y.decodeRelativePosition(fromBase64Url(part)));
    if (fallbackCode) fallback = Y.decodeRelativePosition(fromBase64Url(fallbackCode));
  } catch {
    return { from: 1, to: 1, changed: true };
  }
  const size = state.doc.content.size;
  const clamp = (n: number) => Math.max(0, Math.min(size, n));
  const abs = rels.map((rel) => relativePositionToAbsolutePosition(y.doc, y.type, rel, y.binding.mapping));
  if (abs[0] == null) {
    // 글이 통째로 지워짐 → 소속 제목, 그것도 없으면 문서 맨 앞
    const heading = fallback ? relativePositionToAbsolutePosition(y.doc, y.type, fallback, y.binding.mapping) : null;
    const pos = clamp(heading ?? 1);
    return { from: pos, to: pos, changed: true };
  }
  // 가리키던 글자가 지워졌는지 (지워졌으면 가장 가까운 위치로 이동)
  const changed = rels.some((rel) => {
    if (!rel.item) return false;
    try {
      return Y.getItem(y.doc.store, rel.item).deleted;
    } catch {
      return true;
    }
  });
  const from = clamp(abs[0]);
  const to = abs[1] != null ? clamp(abs[1]) : from;
  return { from: Math.min(from, to), to: Math.max(from, to), changed };
}

/** 링크 공유 글에 붙일 위치 설명 (선택한 글 또는 그 문단·제목) */
export function describePosition(doc: PMNode, from: number, to = from): string {
  if (to > from) return clip(doc.textBetween(from, to, " "));
  const $pos = doc.resolve(Math.min(from, doc.content.size));
  for (let d = $pos.depth; d > 0; d--) {
    if ($pos.node(d).isTextblock) return clip($pos.node(d).textContent);
  }
  return "";
}

// ---------------- 열린 위치 강조 ----------------

const targetKey = new PluginKey<DecorationSet>("bx-link-target");
type TargetMeta = { from: number; to: number } | { clear: true };

function targetDecorations(doc: PMNode, from: number, to: number): DecorationSet {
  const decos: Decoration[] = [];
  const $from = doc.resolve(Math.min(from, doc.content.size));
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).isTextblock) {
      decos.push(Decoration.node($from.before(d), $from.after(d), { class: "bx-link-target" }));
      break;
    }
  }
  if (!decos.length) {
    const index = Math.min($from.index(0), doc.childCount - 1);
    let start = 0;
    for (let i = 0; i < index; i++) start += doc.child(i).nodeSize;
    if (doc.childCount) decos.push(Decoration.node(start, start + doc.child(index).nodeSize, { class: "bx-link-target" }));
  }
  if (to > from) decos.push(Decoration.inline(from, to, { class: "bx-link-target-range" }));
  return DecorationSet.create(doc, decos);
}

/** 공유 링크로 연 위치를 잠시 강조하고 화면 가운데로 스크롤 */
export function showTarget(view: { state: EditorState; dispatch: (tr: Transaction) => void; coordsAtPos: (pos: number) => { top: number } }, target: ResolvedPosition, ms = 4000) {
  view.dispatch(view.state.tr.setMeta(targetKey, { from: target.from, to: target.to } satisfies TargetMeta));
  try {
    const { top } = view.coordsAtPos(target.from);
    window.scrollTo({ top: Math.max(0, window.scrollY + top - window.innerHeight / 3), behavior: "smooth" });
  } catch {
    // 위치를 화면 좌표로 바꾸지 못하면 스크롤만 생략
  }
  setTimeout(() => view.dispatch(view.state.tr.setMeta(targetKey, { clear: true } satisfies TargetMeta)), ms);
}

const LINK_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>';

/** 제목 옆 🔗 버튼을 누르면 편집기 DOM 에서 발생하는 이벤트 (detail: 제목 위치) */
export const COPY_POSITION_EVENT = "bx:copy-position-link";
/** Ctrl(⌘)+클릭한 링크 (detail: 주소) */
export const OPEN_LINK_EVENT = "bx:open-link";

/**
 * 위치 링크 확장
 * - 제목(H1~H3) 옆 🔗 버튼 → COPY_POSITION_EVENT
 * - Ctrl(⌘)+클릭한 링크 → OPEN_LINK_EVENT
 * - 공유 링크로 연 위치 강조
 */
export const PositionLinks = Extension.create({
  name: "bxPositionLinks",
  addProseMirrorPlugins() {
    const headingKey = new PluginKey<DecorationSet>("bx-heading-links");

    const headingWidgets = (doc: PMNode) => {
      const decos: Decoration[] = [];
      doc.descendants((node, pos) => {
        if (node.type.name !== "heading") return;
        decos.push(
          Decoration.widget(
            pos + 1,
            (view, getPos) => {
              const btn = document.createElement("button");
              btn.type = "button";
              btn.className = "bx-heading-link";
              btn.contentEditable = "false";
              btn.title = "이 제목 위치 링크 복사";
              btn.setAttribute("aria-label", `「${clip(node.textContent, 30)}」 위치 링크 복사`);
              btn.innerHTML = LINK_ICON;
              btn.addEventListener("mousedown", (e) => e.preventDefault());
              btn.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                const at = getPos();
                if (typeof at === "number") view.dom.dispatchEvent(new CustomEvent(COPY_POSITION_EVENT, { detail: at }));
              });
              return btn;
            },
            { side: -1, ignoreSelection: true, key: `heading-link-${pos}-${node.textContent.length}` },
          ),
        );
        return false;
      });
      return DecorationSet.create(doc, decos);
    };

    return [
      new Plugin<DecorationSet>({
        key: headingKey,
        state: {
          init: (_config, state) => headingWidgets(state.doc),
          apply: (tr, set) => (tr.docChanged ? headingWidgets(tr.doc) : set),
        },
        props: {
          decorations: (state) => headingKey.getState(state),
          handleClick: (view, pos, event) => {
            if (!(event.metaKey || event.ctrlKey)) return false;
            const mark = [...view.state.doc.resolve(pos).marks(), ...(view.state.doc.nodeAt(pos)?.marks ?? [])].find((m) => m.type.name === "link");
            if (!mark?.attrs.href) return false;
            view.dom.dispatchEvent(new CustomEvent(OPEN_LINK_EVENT, { detail: String(mark.attrs.href) }));
            return true;
          },
        },
      }),
      new Plugin<DecorationSet>({
        key: targetKey,
        state: {
          init: () => DecorationSet.empty,
          apply: (tr, set) => {
            const meta = tr.getMeta(targetKey) as TargetMeta | undefined;
            if (meta && "clear" in meta) return DecorationSet.empty;
            if (meta) return targetDecorations(tr.doc, meta.from, meta.to);
            return set.map(tr.mapping, tr.doc);
          },
        },
        props: { decorations: (state) => targetKey.getState(state) },
      }),
    ];
  },
});
