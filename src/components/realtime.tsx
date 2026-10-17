"use client";

import { createContext, useContext, useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { LiveblocksProvider, RoomProvider, useBroadcastEvent, useEventListener, useOthers, useUpdateMyPresence } from "@liveblocks/react";
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

function PresenceTracker() {
  const pathname = usePathname();
  const update = useUpdateMyPresence();
  useEffect(() => update({ page: pathname }), [pathname, update]);
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
        <RoomProvider id={TEAM_ROOM} initialPresence={{ page: null }}>
          <RefreshOnChange />
          <BroadcastBridge />
          <PresenceTracker />
          {children}
        </RoomProvider>
      </LiveblocksProvider>
    </RealtimeContext.Provider>
  );
}

function OnlineList({ selfId, compact }: { selfId: string; compact?: boolean }) {
  const others = useOthers();
  const unique = new Map<string, { name: string; color: string }>();
  for (const o of others) if (o.id && o.id !== selfId && o.info) unique.set(o.id, o.info);
  const list = [...unique.entries()];
  if (compact) {
    return (
      <span className="flex -space-x-1.5" title={list.length ? `접속 중: ${list.map(([, i]) => i.name).join(", ")}` : "다른 접속자 없음"}>
        {list.slice(0, 4).map(([id, info]) => (
          <Avatar key={id} name={info.name} color={info.color} size="sm" />
        ))}
      </span>
    );
  }
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-1.5 px-2 text-[11px] font-medium text-gray-500">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        지금 접속 중 {list.length + 1}명
      </p>
      <div className="flex flex-wrap gap-1 px-2">
        {list.map(([id, info]) => (
          <span key={id} className="badge bg-gray-100 text-gray-700">
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: info.color }} />
            {info.name}
          </span>
        ))}
        {list.length === 0 && <span className="text-[11px] text-gray-400">다른 팀원 없음</span>}
      </div>
    </div>
  );
}

/** 사이드바/헤더의 접속자 표시 */
export function OnlineMembers({ selfId, compact }: { selfId: string; compact?: boolean }) {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return <OnlineList selfId={selfId} compact={compact} />;
}

function OnlineDotInner({ memberId }: { memberId: string }) {
  const online = useOthers((others) => others.some((o) => o.id === memberId));
  return online ? <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" title="접속 중" /> : null;
}

/** 팀원 아바타 옆 접속 표시 점 */
export function OnlineDot({ memberId }: { memberId: string }) {
  const { enabled } = useRealtime();
  if (!enabled) return null;
  return <OnlineDotInner memberId={memberId} />;
}
