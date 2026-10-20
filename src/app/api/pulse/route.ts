import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { cleanPresence, isTabId, leavePulse, pulse } from "@/lib/pulse";

/** 탭마다 20초에 한 번: 내 활동 저장 + 팀원 활동·마지막 변경 시각 받기. 탭을 닫을 때는 { gone: true } (sendBeacon) */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  let body: { tab?: unknown; presence?: unknown; changed?: unknown; gone?: unknown };
  try {
    const raw = await request.text();
    if (raw.length > 8000) throw new Error("too large");
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!isTabId(body.tab)) return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  if (body.gone === true) {
    await leavePulse(user.id, body.tab);
    return new NextResponse(null, { status: 204 });
  }
  const result = await pulse(user.id, body.tab, cleanPresence(body.presence), body.changed === true);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
