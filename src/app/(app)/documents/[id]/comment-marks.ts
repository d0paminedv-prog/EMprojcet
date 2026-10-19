import { Extension } from "@tiptap/core";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { emit, OPEN_COMMENT_EVENT, type OpenCommentDetail } from "./comment-events";
import { decodePosition } from "./doc-position";

/** 본문에 위치 코멘트가 달린 글 표시 (문서 내용은 바꾸지 않는 꾸밈 표시) */

export type CommentAnchor = { id: string; anchor: string };
type MarksState = { anchors: CommentAnchor[]; decos: DecorationSet };
type MarksMeta = { anchors: CommentAnchor[] } | { recompute: true };

const marksKey = new PluginKey<MarksState>("bx-comment-marks");

function computeMarks(state: EditorState, anchors: CommentAnchor[]): DecorationSet {
  const decos: Decoration[] = [];
  for (const { id, anchor } of anchors) {
    const range = decodePosition(state, anchor);
    if (range && range.to > range.from) decos.push(Decoration.inline(range.from, range.to, { class: "bx-comment-mark", "data-comment-id": id }, { id }));
  }
  return DecorationSet.create(state.doc, decos);
}

/** 표시할 코멘트 목록 바꾸기 */
export function setCommentAnchors(view: EditorView, anchors: CommentAnchor[]) {
  view.dispatch(view.state.tr.setMeta(marksKey, { anchors } satisfies MarksMeta));
}

export const CommentMarks = Extension.create({
  name: "bxCommentMarks",
  addProseMirrorPlugins() {
    return [
      new Plugin<MarksState>({
        key: marksKey,
        state: {
          init: () => ({ anchors: [], decos: DecorationSet.empty }),
          apply: (tr, value, _old, state) => {
            const meta = tr.getMeta(marksKey) as MarksMeta | undefined;
            if (meta && "anchors" in meta) return { anchors: meta.anchors, decos: computeMarks(state, meta.anchors) };
            if (meta) return { anchors: value.anchors, decos: computeMarks(state, value.anchors) };
            // 편집 중에는 표시를 위치에 맞춰 옮기고, 잠시 뒤 Yjs 위치로 다시 계산
            return tr.docChanged ? { anchors: value.anchors, decos: value.decos.map(tr.mapping, tr.doc) } : value;
          },
        },
        props: {
          decorations: (state) => marksKey.getState(state)?.decos,
          handleClick: (view, pos) => {
            const id = marksKey.getState(view.state)?.decos.find(pos, pos)[0]?.spec.id as string | undefined;
            if (id) emit<OpenCommentDetail>(OPEN_COMMENT_EVENT, { id });
            return false;
          },
        },
        view: () => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          return {
            update: (view, prev) => {
              const changed = view.state.doc !== prev.doc || marksKey.getState(view.state)?.anchors !== marksKey.getState(prev)?.anchors;
              if (!changed || !marksKey.getState(view.state)?.anchors.length) return;
              clearTimeout(timer);
              timer = setTimeout(() => {
                if (!view.isDestroyed) view.dispatch(view.state.tr.setMeta(marksKey, { recompute: true } satisfies MarksMeta));
              }, 400);
            },
            destroy: () => clearTimeout(timer),
          };
        },
      }),
    ];
  },
});
