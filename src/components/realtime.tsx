"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LiveblocksProvider, RoomProvider, useBroadcastEvent, useEventListener, useOthers, useSelf, useUpdateMyPresence } from "@liveblocks/react";
import { PenLine } from "lucide-react";
import { describeActivity, EMPTY_PRESENCE, IDLE_MS, isAppPath, pickPresence, screenTitle, stayLabel, type TeamPresence } from "@/lib/presence";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

const RealtimeContext = createContext<{ enabled: boolean; baseUrl?: string }>({ enabled: false });

export function useRealtime() {
  return useContext(RealtimeContext);
}

const CHANGE_EVENT = "bx:changed";

/**
 * 내가 데이터를 바꾼 직후 호출 → 같은 팀 방에 접속한 다른 팀원 화면이 자동으로 새로고침됩니다.
 * (폼 제출 버튼 SubmitButton/ConfirmButton 은 자동으로 호출)
 */
export function notifyChange(scope = "any") {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: scope }));
}

const ACTIVITY_EVENT = "bx:activity";

/** 지금 하는 일을 팀원에게 실시간으로 알림 (null 이면 해제). 예) "파일 3개 올리는 중" */
export function announceActivity(text: string | null) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(ACTIVITY_EVENT, { detail: text }));
}

function BroadcastBridge() {
  const broadcast = useBroadcastEvent();
  useEffect(() => {
    const handler = (e: Event) => broadcast({ type: "changed", scope: String((e as CustomEvent).detail ?? "any") });
    window.addEventListener(CHANGE_EVENT, handler);
    return () => window.removeEventListener(CHANGE_EVENT, handler);
  }, [broadcast]);
  return null;
}

/** 다른 팀원이 데이터를 바꿨다는 신호를 받으면 현재 화면을 새로고침 */
function RefreshOnChange() {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEventListener(({ event }) => {
    if (event.type !== "changed") return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => router.refresh(), 250);
  });
  return null;
}

/** 내 위치(화면·제목)·입력 중·자리 비움 상태를 팀 방에 공유 */
function PresenceTracker() {
  const pathname = usePathname();
  const update = useUpdateMyPresence();
  const title = useRef<string | null>(null);
  const typing = useRef<{ on: boolean; timer?: ReturnType<typeof setTimeout> }>({ on: false });

  // 화면 이동 + 탭 제목(문서·프로젝트 이름) 변화
  useEffect(() => {
    title.current = screenTitle(document.title);
    clearTimeout(typing.current.timer);
    typing.current.on = false;
    update({ page: pathname, title: title.current, since: Date.now(), typing: false });
    const observer = new MutationObserver(() => {
      const next = screenTitle(document.title);
      if (next !== title.current) update({ title: (title.current = next) });
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname, update]);

  // 입력·편집 중 (마지막 입력 후 8초간)
  useEffect(() => {
    const state = typing.current;
    const onInput = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && ["checkbox", "radio", "file", "range", "color"].includes(el.type)) return;
      if (!state.on) update({ typing: (state.on = true) });
      clearTimeout(state.timer);
      state.timer = setTimeout(() => update({ typing: (state.on = false) }), 8000);
    };
    document.addEventListener("input", onInput, true);
    return () => {
      document.removeEventListener("input", onInput, true);
      clearTimeout(state.timer);
    };
  }, [update]);

  // 자리 비움: 다른 탭을 보거나 5분 이상 조작 없음
  useEffect(() => {
    let away = false;
    let last = Date.now();
    const set = (value: boolean) => {
      if (value !== away) update({ away: (away = value) });
    };
    const touch = () => {
      last = Date.now();
      if (document.visibilityState === "visible") set(false);
    };
    const onVisibility = () => (document.visibilityState === "hidden" ? set(true) : touch());
    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);
    const id = setInterval(() => {
      if (Date.now() - last > IDLE_MS) set(true);
    }, 30000);
    set(document.visibilityState === "hidden");
    return () => {
      events.forEach((name) => window.removeEventListener(name, touch));
      document.removeEventListener("visibilitychange", onVisibility);
      clearInterval(id);
    };
  }, [update]);

  // 업로드 등 직접 알린 작업
  useEffect(() => {
    const onActivity = (e: Event) => update({ doing: ((e as CustomEvent).detail as string | null) ?? null });
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    return () => window.removeEventListener(ACTIVITY_EVENT, onActivity);
  }, [update]);

  return null;
}

/** Liveblocks 미설정 시: 30초마다 화면 갱신 */
function PollingRefresh() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 30000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

export const TEAM_ROOM = "bx:team";

export function TeamRealtimeProvider({
  enabled,
  baseUrl,
  children,
}: {
  enabled: boolean;
  baseUrl?: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ enabled, baseUrl }), [enabled, baseUrl]);
  if (!enabled) {
    return (
      <RealtimeContext.Provider value={value}>
        <PollingRefresh />
        {children}
      </RealtimeContext.Provider>
    );
  }
  return (
    <RealtimeContext.Provider value={value}>
      <LiveblocksProvider authEndpoint="/api/liveblocks-auth" baseUrl={baseUrl} throttle={80}>
        <RoomProvider id={TEAM_ROOM} initialPresence={EMPTY_PRESENCE}>
          <RefreshOnChange />
          <BroadcastBridge />
          <PresenceTracker />
          {children}
        </RoomProvider>
      </LiveblocksProvider>
    </RealtimeContext.Provider>
  );
}

type OnlineMember = { id: string; name: string; color: string; presence: TeamPresence };

/** 접속 중인 다른 팀원 (여러 탭은 하나로 합침) */
function useOnlineMembers(selfId: string): OnlineMember[] {
  const others = useOthers();
  const byId = new Map<string, { name: string; color: string; list: TeamPresence[] }>();
  for (const o of others) {
    if (!o.id || o.id === selfId || !o.info) continue;
    const entry = byId.get(o.id) ?? { ...o.info, list: [] };
    entry.list.push(o.presence);
    byId.set(o.id, entry);
  }
  return [...byId.entries()]
    .map(([id, e]) => ({ id, name: e.name, color: e.color, presence: pickPresence(e.list) }))
    .sort((a, b) => Number(a.presence.away) - Number(b.presence.away) || a.name.localeCompare(b.name, "ko"));
}

/** 「n분째」 표시를 위해 30초마다 다시 그림 */
function useNow(intervalMs = 30000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function ActivityText({ presence, now, className }: { presence: TeamPresence; now: number; className?: string }) {
  const stay = stayLabel(presence.since, now);
  const busy = !presence.away && (presence.typing || !!presence.doing);
  const text = `${presence.away ? "자리 비움 · " : ""}${describeActivity(presence)}`;
  return (
    <span className={cn("flex min-w-0 items-center gap-1", presence.away ? "text-gray-400" : busy ? "text-brand-700" : "text-gray-600", className)} title={text}>
      {busy && <PenLine className="h-3 w-3 shrink-0 animate-pulse" />}
      <span className="truncate">{text}</span>
      {stay && <span className="shrink-0 text-gray-400">· {stay}</span>}
    </span>
  );
}

/** 접속 중인 팀원과 지금 하는 일 목록. 누르면 같은 화면으로 이동 */
function ActivityList({ members, onNavigate }: { members: OnlineMember[]; onNavigate?: () => void }) {
  const now = useNow();
  if (!members.length) return <p className="px-2 text-[11px] text-gray-400">다른 팀원 없음</p>;
  return (
    <ul className="space-y-0.5" data-testid="team-activity">
      {members.map((m) => {
        const row = (
          <>
            <span className="relative mt-0.5 shrink-0">
              <Avatar name={m.name} color={m.color} size="sm" />
              <span
                className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", m.presence.away ? "bg-amber-400" : "bg-emerald-500")}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium text-gray-900">{m.name}</span>
              <ActivityText presence={m.presence} now={now} className="text-[11px]" />
            </span>
          </>
        );
        return (
          <li key={m.id}>
            {isAppPath(m.presence.page) ? (
              <Link href={m.presence.page} onClick={onNavigate} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50" title={`${m.name}님이 있는 화면으로 이동`}>
                {row}
              </Link>
            ) : (
              <div className="flex items-start gap-2 px-2 py-1.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function OnlineList({ selfId, compact }: { selfId: string; compact?: boolean }) {
  const members = useOnlineMembers(selfId);
  const pathname = usePathname();
  // 다른 화면으로 이동하면 자동으로 닫힘
  const [openedAt, setOpenedAt] = useState<string | null>(null);
  const open = openedAt === pathname;
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpenedAt(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  if (compact) {
    return (
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpenedAt(open ? null : pathname)}
          className="flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 hover:bg-gray-100"
          aria-label={`팀원 활동 보기 (접속 중 ${members.length + 1}명)`}
          aria-expanded={open}
        >
          <span className="flex -space-x-1.5">
            {members.slice(0, 4).map((m) => (
              <Avatar key={m.id} name={m.name} color={m.color} size="sm" />
            ))}
          </span>
          <span className="flex items-center gap-1 text-[11px] font-medium text-gray-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {members.length + 1}
          </span>
        </button>
        {open && (
          <div className="absolute right-0 top-full z-30 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
            <p className="mb-1 px-2 text-[11px] font-medium text-gray-500">팀원 실시간 활동 · 접속 중 {members.length + 1}명</p>
            <ActivityList members={members} onNavigate={() => setOpenedAt(null)} />
          </div>
        )}
      </div>
    );
  }
  return (
    <div>
      <p className="mb-1 flex items-center gap-1.5 px-2 text-[11px] font-medium text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        지금 접속 중 {members.length + 1}명 · 실시간 활동
      </p>
      <ActivityList members={members} />
    </div>
  );
}

/** 사이드바/헤더의 접속자 + 실시간 활동 */
export function OnlineMembers({ selfId, compact }: { selfId: string; compact?: boolean }) {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return <OnlineList selfId={selfId} compact={compact} />;
}

function OnlineDotInner({ memberId }: { memberId: string }) {
  const state = useOthers((others) => {
    const mine = others.filter((o) => o.id === memberId);
    return mine.length ? (mine.every((o) => o.presence.away) ? "away" : "online") : null;
  });
  if (!state) return null;
  return (
    <span
      className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", state === "away" ? "bg-amber-400" : "bg-emerald-500")}
      title={state === "away" ? "자리 비움" : "접속 중"}
    />
  );
}

/** 팀원 아바타 옆 접속 표시 점 (초록: 접속 중, 노랑: 자리 비움) */
export function OnlineDot({ memberId }: { memberId: string }) {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return <OnlineDotInner memberId={memberId} />;
}

function MemberActivityInner({ memberId, isMe }: { memberId: string; isMe?: boolean }) {
  const presence = useOthers((others) => {
    const mine = others.filter((o) => o.id === memberId).map((o) => o.presence);
    return mine.length ? pickPresence(mine) : null;
  });
  const now = useNow();
  if (isMe) return <span className="flex items-center gap-1 text-emerald-600">지금 접속 중</span>;
  if (!presence) return <span className="text-gray-400">오프라인</span>;
  return <ActivityText presence={presence} now={now} />;
}

/** 팀원 한 명의 지금 활동 한 줄 (대시보드·팀 화면) */
export function MemberActivity({ memberId, isMe, className }: { memberId: string; isMe?: boolean; className?: string }) {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return (
    <span className={cn("block min-w-0 text-xs", className)} data-testid="member-activity">
      <MemberActivityInner memberId={memberId} isMe={isMe} />
    </span>
  );
}

function HereNowInner() {
  const pathname = usePathname();
  const selfId = useSelf((me) => me.id);
  const others = useOthers();
  const here = new Map<string, { name: string; color: string; typing: boolean }>();
  for (const o of others) {
    if (!o.id || o.id === selfId || !o.info || o.presence.page !== pathname || o.presence.away) continue;
    const prev = here.get(o.id);
    here.set(o.id, { ...o.info, typing: !!prev?.typing || o.presence.typing });
  }
  if (!here.size) return null;
  const list = [...here.values()];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-700" data-testid="here-now">
      <span className="flex -space-x-1">
        {list.slice(0, 4).map((m) => (
          <Avatar key={m.name} name={m.name} color={m.color} size="sm" />
        ))}
      </span>
      {list.map((m) => m.name).join(", ")} {list.some((m) => m.typing) ? "함께 보는 중 (입력 중)" : "함께 보는 중"}
    </span>
  );
}

/** 지금 같은 화면을 보고 있는 팀원 */
export function HereNow() {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return <HereNowInner />;
}
