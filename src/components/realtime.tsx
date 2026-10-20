"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LiveblocksProvider, useBroadcastEvent, useEventListener, useStatus } from "@liveblocks/react";
import { PenLine } from "lucide-react";
import {
  describeActivity,
  EMPTY_PRESENCE,
  IDLE_MS,
  liveTabs,
  pickPresence,
  presenceHref,
  PULSE_MS,
  screenTitle,
  stayLabel,
  type PulseMember,
  type PulseResult,
  type TeamPresence,
} from "@/lib/presence";
import { cn } from "@/lib/utils";
import { Avatar } from "./ui";

/** enabled: Liveblocks(실시간 문서 편집) 사용 가능 · selfId: 나 */
const RealtimeContext = createContext<{ enabled: boolean; baseUrl?: string; selfId: string | null }>({ enabled: false, selfId: null });

export function useRealtime() {
  return useContext(RealtimeContext);
}

const CHANGE_EVENT = "bx:changed";

/**
 * 내가 데이터를 바꾼 직후 호출 → 다른 팀원 화면이 자동으로 새로고침됩니다
 * (같은 실시간 문서를 보는 팀원은 즉시, 다른 화면은 다음 활동 신호 때 — 최대 20초).
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

const LOCATION_EVENT = "bx:location";

/** 실시간 문서 안 내 위치를 팀원에게 알림 — 사이드바 활동에 「› 3. 타깃」처럼 표시되고 누르면 그 위치로 이동 */
export function announceLocation(location: { at: string | null; section: string | null }) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(LOCATION_EVENT, { detail: location }));
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

/** 실시간 문서 방에 연결되어 변경 알림을 즉시 받고 있는 화면 수 — 이때는 활동 신호로 새로고침하지 않음 */
let liveBridges = 0;

/**
 * 지금 들어가 있는 방(문서 방)으로 변경 알림을 주고받아 같은 문서를 보는 팀원 화면을 즉시 새로고침.
 * 코멘트·제목처럼 가끔 생기는 이벤트라 협업 분을 거의 쓰지 않음
 */
export function RoomChangeBridge() {
  const connected = useStatus() === "connected";
  useEffect(() => {
    if (!connected) return;
    liveBridges++;
    return () => {
      liveBridges--;
    };
  }, [connected]);
  return (
    <>
      <BroadcastBridge />
      <RefreshOnChange />
    </>
  );
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

/* ---------- 팀원 활동 (앱 서버 신호, Liveblocks 미사용) ---------- */

const EMPTY_MEMBERS: PulseMember[] = [];
let pulseMembers: PulseMember[] = EMPTY_MEMBERS;
const pulseListeners = new Set<() => void>();

function setPulseMembers(next: PulseMember[]) {
  pulseMembers = next;
  pulseListeners.forEach((listener) => listener());
}

/** 접속 중인 팀원 탭 목록 (나 포함) */
function usePulseMembers(): PulseMember[] {
  return useSyncExternalStore(
    (listener) => {
      pulseListeners.add(listener);
      return () => pulseListeners.delete(listener);
    },
    () => pulseMembers,
    () => EMPTY_MEMBERS,
  );
}

/** 같은 화면 안에서 연달아 바뀌어도 신호는 이 간격 이상 */
const MIN_GAP_MS = 3000;

function newTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  }
}

/**
 * 내 화면·제목·하는 일·입력 중·자리 비움을 20초마다 앱 서버에 알리고, 팀원 활동과 「다른 팀원이 데이터를 바꿨는지」를 받음.
 * 보고 있는 탭에서만 보내고, 다른 탭을 보거나 5분 넘게 조작이 없으면 「자리 비움」을 한 번 알린 뒤 멈춤(서버·DB 절약).
 */
function TeamPulse() {
  const pathname = usePathname();
  const router = useRouter();
  const routerRef = useRef(router);
  const pulseRef = useRef<{ kick: () => void; state: TeamPresence } | null>(null);

  useEffect(() => {
    routerRef.current = router;
  }, [router]);

  useEffect(() => {
    const tab = newTabId();
    const state: TeamPresence = { ...EMPTY_PRESENCE };
    let lastInput = Date.now();
    let typingAt = 0;
    let changed = false;
    let sentAway = false;
    let lastSent = 0;
    let inFlight = false;
    let queued = false;
    let stopped = false;
    let lastChange: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dueAt = Infinity;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;

    const active = () => document.visibilityState === "visible" && Date.now() - lastInput <= IDLE_MS;
    const schedule = (delay: number) => {
      if (stopped) return;
      const at = Date.now() + delay;
      if (timer && at >= dueAt) return;
      clearTimeout(timer);
      dueAt = at;
      timer = setTimeout(() => {
        timer = undefined;
        dueAt = Infinity;
        void send();
      }, delay);
    };
    const kick = () => schedule(Math.max(200, lastSent + MIN_GAP_MS - Date.now()));

    const apply = (data: PulseResult) => {
      setPulseMembers(data.members);
      const at = data.changedAt ?? 0;
      if (lastChange === undefined) lastChange = at;
      else if (at > lastChange) {
        lastChange = at;
        // 실시간 문서 방에 연결돼 있으면 그쪽 알림으로 이미 새로고침됨
        if (liveBridges === 0) {
          clearTimeout(refreshTimer);
          refreshTimer = setTimeout(() => routerRef.current.refresh(), 250);
        }
      }
    };

    const send = async () => {
      if (stopped) return;
      if (inFlight) {
        queued = true;
        return;
      }
      const away = !active();
      const presence: TeamPresence = { ...state, away, typing: !away && Date.now() - typingAt < PULSE_MS };
      const sendChanged = changed;
      changed = false;
      inFlight = true;
      lastSent = Date.now();
      try {
        const res = await fetch("/api/pulse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tab, presence, changed: sendChanged }),
          cache: "no-store",
        });
        if (res.status === 401) stopped = true; // 나가기 → 신호 중단
        else if (res.ok) {
          sentAway = away;
          apply((await res.json()) as PulseResult);
        } else if (sendChanged) changed = true;
      } catch {
        if (sendChanged) changed = true;
      } finally {
        inFlight = false;
      }
      if (queued) {
        queued = false;
        kick();
      } else if (!sentAway || changed) schedule(changed ? MIN_GAP_MS : PULSE_MS);
    };

    // 입력·조작
    const touch = () => {
      lastInput = Date.now();
      if (sentAway && document.visibilityState === "visible") kick();
    };
    const onInput = (e: Event) => {
      const el = e.target;
      if (el instanceof HTMLInputElement && ["checkbox", "radio", "file", "range", "color"].includes(el.type)) return;
      const wasTyping = Date.now() - typingAt < PULSE_MS;
      typingAt = Date.now();
      touch();
      if (!wasTyping) kick();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") lastInput = Date.now();
      kick();
    };
    const onChange = () => {
      changed = true;
      kick();
    };
    const onActivity = (e: Event) => {
      state.doing = ((e as CustomEvent).detail as string | null) ?? null;
      kick();
    };
    const onLocation = (e: Event) => {
      const { at, section } = (e as CustomEvent<{ at: string | null; section: string | null }>).detail;
      const moved = section !== state.section;
      state.at = at;
      state.section = section;
      if (moved) kick();
    };
    // 탭을 닫으면 바로 접속자 목록에서 빠지도록
    const onPageHide = () => {
      try {
        navigator.sendBeacon("/api/pulse", new Blob([JSON.stringify({ tab, gone: true })], { type: "application/json" }));
      } catch {
        // 무시 — 70초 뒤 자동으로 빠짐
      }
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) kick();
    };

    const events = ["pointerdown", "pointermove", "keydown", "wheel", "touchstart"] as const;
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }));
    document.addEventListener("input", onInput, true);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener(ACTIVITY_EVENT, onActivity);
    window.addEventListener(LOCATION_EVENT, onLocation);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    pulseRef.current = { kick, state };
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearTimeout(refreshTimer);
      pulseRef.current = null;
      events.forEach((name) => window.removeEventListener(name, touch));
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener(ACTIVITY_EVENT, onActivity);
      window.removeEventListener(LOCATION_EVENT, onLocation);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      onPageHide();
    };
  }, []);

  // 화면 이동 + 탭 제목(문서·프로젝트 이름) 변화
  useEffect(() => {
    const pulse = pulseRef.current;
    if (!pulse) return;
    Object.assign(pulse.state, { page: pathname, title: screenTitle(document.title), since: Date.now(), at: null, section: null });
    pulse.kick();
    const observer = new MutationObserver(() => {
      const next = screenTitle(document.title);
      if (next === pulse.state.title) return;
      pulse.state.title = next;
      pulse.kick();
    });
    observer.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}

/** 다른 탭을 보고 있는 동안 이만큼 지나면 문서 방 연결을 끊음 (돌아오면 자동 재연결) — 협업 분 절약 */
const BACKGROUND_DISCONNECT_MS = 2 * 60 * 1000;

export function TeamRealtimeProvider({
  enabled,
  baseUrl,
  selfId,
  children,
}: {
  /** Liveblocks 설정됨 → 실시간 문서 편집 사용 */
  enabled: boolean;
  baseUrl?: string;
  selfId: string;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ enabled, baseUrl, selfId }), [enabled, baseUrl, selfId]);
  return (
    <RealtimeContext.Provider value={value}>
      {/* 팀원 활동·변경 알림은 앱 서버로 — Liveblocks 는 실시간 문서 방에서만 사용 (무료 협업 분 절약) */}
      <TeamPulse />
      {enabled ? (
        // preventUnsavedChanges: 아직 서버에 반영되지 않은 편집이 있으면 창을 닫기 전에 경고
        <LiveblocksProvider
          authEndpoint="/api/liveblocks-auth"
          baseUrl={baseUrl}
          throttle={80}
          preventUnsavedChanges
          backgroundKeepAliveTimeout={BACKGROUND_DISCONNECT_MS}
        >
          {children}
        </LiveblocksProvider>
      ) : (
        children
      )}
    </RealtimeContext.Provider>
  );
}

type OnlineMember = { id: string; name: string; color: string; presence: TeamPresence };

/** 접속 중인 다른 팀원 (여러 탭은 하나로 합침) */
function useOnlineMembers(selfId: string): OnlineMember[] {
  const tabs = usePulseMembers();
  return useMemo(() => {
    const byId = new Map<string, { name: string; color: string; list: PulseMember[] }>();
    for (const t of tabs) {
      if (t.id === selfId) continue;
      const entry = byId.get(t.id) ?? { name: t.name, color: t.color, list: [] };
      entry.list.push(t);
      byId.set(t.id, entry);
    }
    return [...byId.entries()]
      .map(([id, e]) => ({ id, name: e.name, color: e.color, presence: pickPresence(liveTabs(e.list).map((t) => t.presence)) }))
      .sort((a, b) => Number(a.presence.away) - Number(b.presence.away) || a.name.localeCompare(b.name, "ko"));
  }, [tabs, selfId]);
}

/** 팀원 한 명의 탭들 */
function useMemberTabs(memberId: string): TeamPresence[] {
  const tabs = usePulseMembers();
  return useMemo(() => {
    const mine = tabs.filter((t) => t.id === memberId);
    return mine.length ? liveTabs(mine).map((t) => t.presence) : [];
  }, [tabs, memberId]);
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
            {presenceHref(m.presence) ? (
              <Link href={presenceHref(m.presence)!} onClick={onNavigate} className="flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50" title={`${m.name}님이 있는 화면으로 이동`}>
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
  return <OnlineList selfId={selfId} compact={compact} />;
}

/** 팀원 아바타 옆 접속 표시 점 (초록: 접속 중, 노랑: 자리 비움) */
export function OnlineDot({ memberId }: { memberId: string }) {
  const mine = useMemberTabs(memberId);
  if (!mine.length) return null;
  const away = mine.every((p) => p.away);
  return (
    <span
      className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white", away ? "bg-amber-400" : "bg-emerald-500")}
      title={away ? "자리 비움" : "접속 중"}
      data-testid="online-dot"
    />
  );
}

function MemberActivityInner({ memberId, isMe }: { memberId: string; isMe?: boolean }) {
  const mine = useMemberTabs(memberId);
  const now = useNow();
  if (isMe) return <span className="flex items-center gap-1 text-emerald-600">지금 접속 중</span>;
  if (!mine.length) return <span className="text-gray-400">오프라인</span>;
  return <ActivityText presence={pickPresence(mine)} now={now} />;
}

/** 팀원 한 명의 지금 활동 한 줄 (대시보드·팀 화면) */
export function MemberActivity({ memberId, isMe, className }: { memberId: string; isMe?: boolean; className?: string }) {
  return (
    <span className={cn("block min-w-0 text-xs", className)} data-testid="member-activity">
      <MemberActivityInner memberId={memberId} isMe={isMe} />
    </span>
  );
}

/** 지금 같은 화면을 보고 있는 팀원 */
export function HereNow() {
  const pathname = usePathname();
  const { selfId } = useRealtime();
  const tabs = usePulseMembers();
  const here = new Map<string, { name: string; color: string; typing: boolean }>();
  const byMember = new Map<string, PulseMember[]>();
  for (const t of tabs) byMember.set(t.id, [...(byMember.get(t.id) ?? []), t]);
  for (const t of [...byMember.values()].flatMap((list) => liveTabs(list))) {
    if (t.id === selfId || t.presence.page !== pathname || t.presence.away) continue;
    const prev = here.get(t.id);
    here.set(t.id, { name: t.name, color: t.color, typing: !!prev?.typing || t.presence.typing });
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
