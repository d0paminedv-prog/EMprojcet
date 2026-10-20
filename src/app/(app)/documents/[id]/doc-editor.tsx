"use client";

import { useCallback, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useRealtime } from "@/components/realtime";
import { LiveEditor, type DocEditorProps } from "./live-editor";
import { SoloEditor } from "./solo-editor";

type Json = Record<string, unknown>;
type Mode = { kind: "live" } | { kind: "solo"; reason: "off" | "down"; carry: Json | null };

/**
 * 실시간 연결 실패를 본 시각 (이 브라우저) — 10분 동안은 다른 문서·새 탭도 연결을 기다리지 않고 바로 단독 편집 모드로 엶.
 * 「실시간 다시 연결」로 언제든 다시 시도
 */
const DOWN_KEY = "bx:live-down-at";
const REMEMBER_DOWN_MS = 10 * 60 * 1000;

function readLiveDown(): boolean {
  try {
    return Date.now() - Number(localStorage.getItem(DOWN_KEY) ?? 0) < REMEMBER_DOWN_MS;
  } catch {
    return false;
  }
}
function writeLiveDown(down: boolean) {
  try {
    if (down) localStorage.setItem(DOWN_KEY, String(Date.now()));
    else localStorage.removeItem(DOWN_KEY);
  } catch {
    // 저장소를 쓸 수 없으면 기억하지 않음
  }
}
const noSubscribe = () => () => {};

/**
 * 실시간 문서 편집기: 평소에는 실시간 공동 편집(Liveblocks),
 * 연결이 안 되면(무료 사용량 초과·장애·미설정) 단독 편집 모드로 — 서버 사본을 한 번에 한 명씩 편집
 */
export function DocEditor(props: DocEditorProps) {
  const { enabled } = useRealtime();
  const router = useRouter();
  // 서버 렌더·첫 화면은 실시간, 브라우저에 장애 기록이 있으면 바로 단독 편집으로
  const rememberedDown = useSyncExternalStore(noSubscribe, readLiveDown, () => false);
  const [chosen, setChosen] = useState<Mode | null>(null);
  const mode: Mode = !enabled ? { kind: "solo", reason: "off", carry: null } : (chosen ?? (rememberedDown ? { kind: "solo", reason: "down", carry: null } : { kind: "live" }));

  const onUnavailable = useCallback((carry: Json | null) => {
    writeLiveDown(true);
    setChosen({ kind: "solo", reason: "down", carry });
  }, []);
  const retryLive = useCallback(() => {
    writeLiveDown(false);
    setChosen({ kind: "live" });
    // 단독 편집 권한 반납이 끝난 뒤 최신 상태로 (반영 대기 중인 단독 편집 내용 가져오기)
    setTimeout(() => router.refresh(), 1500);
  }, [router]);

  if (mode.kind === "live") return <LiveEditor {...props} onUnavailable={onUnavailable} />;
  return (
    <SoloEditor
      documentId={props.documentId}
      title={props.title}
      lastSavedAt={props.lastSavedAt}
      snapshots={props.snapshots}
      storage={props.storage}
      carry={mode.carry}
      reason={mode.reason}
      onRetryLive={enabled ? retryLive : undefined}
    />
  );
}
