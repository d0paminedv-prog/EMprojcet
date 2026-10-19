"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CornerDownRight, MessageSquare, RotateCcw, Trash2, X } from "lucide-react";
import { LinkedText, type DocTitles } from "@/components/linked-text";
import { notifyChange } from "@/components/realtime";
import { Avatar } from "@/components/ui";
import { cn } from "@/lib/utils";
import { deleteComment, postComment, setCommentResolved } from "../actions";
import { emit, FOCUS_ANCHOR_EVENT, NEW_COMMENT_EVENT, OPEN_COMMENT_EVENT, type FocusAnchorDetail, type NewCommentDetail, type OpenCommentDetail } from "./comment-events";

export type CommentView = {
  id: string;
  authorId: string | null;
  authorName: string;
  authorColor: string;
  body: string;
  /** 표시용 작성 시각 (서버에서 KST 로 만들어 전달 — 화면 하이드레이션 불일치 방지) */
  createdLabel: string;
  anchor: string | null;
  quote: string | null;
  resolvedByName: string | null;
  resolved: boolean;
  replies: CommentView[];
};

type Props = {
  documentId: string;
  currentUserId: string;
  threads: CommentView[];
  origin: string;
  linkTitles: DocTitles;
  /** 실시간 문서면 본문 위치 코멘트 가능 */
  live: boolean;
};

function useRefreshAfter() {
  const router = useRouter();
  return () => {
    notifyChange("comments");
    router.refresh();
  };
}

function Body({ comment, origin, linkTitles }: { comment: CommentView; origin: string; linkTitles: DocTitles }) {
  return (
    <div className="flex gap-2">
      <Avatar name={comment.authorName} color={comment.authorColor} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500">
          <b className="font-medium text-gray-900">{comment.authorName}</b> · {comment.createdLabel}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-gray-800">
          <LinkedText text={comment.body} origin={origin} titles={linkTitles} />
        </p>
      </div>
    </div>
  );
}

function Thread({ thread, documentId, currentUserId, origin, linkTitles, flash }: { thread: CommentView; documentId: string; currentUserId: string; origin: string; linkTitles: DocTitles; flash: boolean }) {
  const refresh = useRefreshAfter();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<{ error?: string } | void>) {
    setBusy(true);
    setError(null);
    const result = await action();
    setBusy(false);
    if (result && result.error) return setError(result.error);
    refresh();
  }

  return (
    <li id={`comment-${thread.id}`} className={cn("rounded-lg border border-gray-200 bg-white p-3 transition", flash && "ring-2 ring-amber-300", thread.resolved && "bg-gray-50")} data-testid="comment-thread">
      {thread.quote && thread.anchor && (
        <button
          type="button"
          className="mb-2 block w-full truncate rounded-r border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-left text-xs text-amber-900 hover:bg-amber-100"
          title="본문의 이 위치로 이동"
          onClick={() => emit<FocusAnchorDetail>(FOCUS_ANCHOR_EVENT, { anchor: thread.anchor! })}
          data-testid="comment-quote"
        >
          「{thread.quote}」
        </button>
      )}
      <Body comment={thread} origin={origin} linkTitles={linkTitles} />
      {thread.replies.length > 0 && (
        <ul className="mt-2 space-y-2 border-l border-gray-100 pl-3">
          {thread.replies.map((r) => (
            <li key={r.id} className="group relative">
              <Body comment={r} origin={origin} linkTitles={linkTitles} />
              {r.authorId === currentUserId && (
                <button type="button" className="absolute right-0 top-0 hidden text-gray-400 hover:text-red-600 group-hover:block" aria-label="답글 삭제" onClick={() => window.confirm("답글을 삭제할까요?") && run(() => deleteComment(r.id))}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {thread.resolved && <p className="mt-2 text-[11px] text-emerald-700">✓ {thread.resolvedByName ?? "팀원"}님이 해결함</p>}
      {replying && (
        <form
          className="mt-2 space-y-1.5"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(async () => {
              const result = await postComment({ documentId, body: reply, parentId: thread.id });
              if (!result.error) {
                setReply("");
                setReplying(false);
              }
              return result;
            });
          }}
        >
          <textarea autoFocus rows={2} className="input text-sm" placeholder="답글 입력" value={reply} onChange={(e) => setReply(e.target.value)} aria-label="답글" />
          <div className="flex justify-end gap-1.5">
            <button type="button" className="btn-ghost btn-sm" onClick={() => setReplying(false)}>
              취소
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={busy || !reply.trim()}>
              답글 등록
            </button>
          </div>
        </form>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {!replying && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setReplying(true)}>
            <CornerDownRight className="h-3.5 w-3.5" />
            답글
          </button>
          <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={() => run(() => setCommentResolved(thread.id, !thread.resolved))}>
            {thread.resolved ? <RotateCcw className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
            {thread.resolved ? "다시 열기" : "해결"}
          </button>
          {thread.authorId === currentUserId && (
            <button type="button" className="btn-ghost btn-sm ml-auto text-gray-400 hover:text-red-600" disabled={busy} aria-label="코멘트 삭제" onClick={() => window.confirm("코멘트와 답글을 삭제할까요?") && run(() => deleteComment(thread.id))}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}

/** 문서 코멘트: 본문 위치 코멘트 + 문서 전체 의견, 답글·해결 */
export function CommentsPanel({ documentId, currentUserId, threads, origin, linkTitles, live }: Props) {
  const refresh = useRefreshAfter();
  const [pending, setPending] = useState<NewCommentDetail | null>(null);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [flashId, setFlashId] = useState<string | null>(null);
  const boxRef = useRef<HTMLFormElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const open = threads.filter((t) => !t.resolved);
  const resolved = threads.filter((t) => t.resolved);
  const resolvedIds = resolved.map((t) => t.id).join(",");

  // 본문에서 「코멘트」 → 입력칸 열기
  useEffect(() => {
    const onNew = (e: Event) => {
      setPending((e as CustomEvent<NewCommentDetail>).detail);
      requestAnimationFrame(() => {
        boxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        textRef.current?.focus({ preventScroll: true });
      });
    };
    // 본문의 코멘트 표시 클릭 → 해당 코멘트로
    const onOpen = (e: Event) => {
      const { id } = (e as CustomEvent<OpenCommentDetail>).detail;
      if (resolvedIds.split(",").includes(id)) setShowResolved(true);
      setFlashId(id);
      requestAnimationFrame(() => document.getElementById(`comment-${id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    };
    window.addEventListener(NEW_COMMENT_EVENT, onNew);
    window.addEventListener(OPEN_COMMENT_EVENT, onOpen);
    return () => {
      window.removeEventListener(NEW_COMMENT_EVENT, onNew);
      window.removeEventListener(OPEN_COMMENT_EVENT, onOpen);
    };
  }, [resolvedIds]);

  useEffect(() => {
    if (!flashId) return;
    const id = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(id);
  }, [flashId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await postComment({ documentId, body, anchor: pending?.anchor, quote: pending?.quote });
    setBusy(false);
    if (result.error) return setError(result.error);
    setBody("");
    setPending(null);
    refresh();
  }

  return (
    <section className="card p-4" data-testid="comments-panel">
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        <MessageSquare className="h-4 w-4" />
        코멘트 ({open.length})
      </h2>
      <form ref={boxRef} onSubmit={submit} className="mb-4 space-y-2">
        {pending && (
          <div className="flex items-start gap-1.5 rounded-r border-l-2 border-amber-400 bg-amber-50 px-2 py-1 text-xs text-amber-900" data-testid="comment-pending-quote">
            <span className="min-w-0 flex-1 break-words">「{pending.quote}」에 코멘트</span>
            <button type="button" aria-label="위치 지정 취소" onClick={() => setPending(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <textarea
          ref={textRef}
          name="body"
          rows={3}
          className="input"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={pending ? "선택한 글에 대한 코멘트" : live ? "문서 전체 의견 (본문 글을 선택하면 그 위치에 코멘트를 달 수 있어요)" : "검토 의견, 수정 요청 등을 남겨 주세요"}
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button type="submit" className="btn-primary btn-sm" disabled={busy || !body.trim()}>
            {busy ? "등록 중…" : "코멘트 등록"}
          </button>
        </div>
      </form>

      <ul className="space-y-2.5">
        {open.map((t) => (
          <Thread key={t.id} thread={t} documentId={documentId} currentUserId={currentUserId} origin={origin} linkTitles={linkTitles} flash={flashId === t.id} />
        ))}
        {open.length === 0 && <li className="text-sm text-gray-500">아직 코멘트가 없습니다.</li>}
      </ul>

      {resolved.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <button type="button" className="text-xs font-medium text-gray-500 hover:text-gray-800" onClick={() => setShowResolved((v) => !v)}>
            {showResolved ? "해결된 코멘트 숨기기" : `해결된 코멘트 ${resolved.length}개 보기`}
          </button>
          {showResolved && (
            <ul className="mt-2.5 space-y-2.5">
              {resolved.map((t) => (
                <Thread key={t.id} thread={t} documentId={documentId} currentUserId={currentUserId} origin={origin} linkTitles={linkTitles} flash={flashId === t.id} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
