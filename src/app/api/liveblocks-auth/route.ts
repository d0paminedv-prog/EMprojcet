import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { ROOM_PREFIX, liveblocks, liveblocksConfigured } from "@/lib/liveblocks";

/** 입장한 팀원에게 Liveblocks 방 접속 토큰 발급 (이름·색상 → 다른 사람 화면의 커서/접속자 표시) */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 403 });
  if (!liveblocksConfigured()) return NextResponse.json({ error: "Liveblocks 미설정" }, { status: 503 });

  const session = liveblocks().prepareSession(user.id, { userInfo: { name: user.name, color: user.color } });
  session.allow(`${ROOM_PREFIX}*`, session.FULL_ACCESS);
  const { status, body } = await session.authorize();
  return new Response(body, { status, headers: { "Content-Type": "application/json" } });
}
