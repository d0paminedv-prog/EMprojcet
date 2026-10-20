import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveLiveContentFor } from "@/lib/live-content";
import { acquireSolo, claimSoloEdits, releaseSolo, soloState } from "@/lib/solo";

/** 단독 편집 모드 상태·서버 사본 (보기만 하는 팀원이 주기적으로 확인) */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  const state = await soloState(id);
  if (!state) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store" } });
}

/**
 * action
 * - acquire: 편집 권한 받기·연장 → { ok, reason?, names?, json, html, lastEditedAt, lock }
 * - save: 단독 편집 저장 { json, text, release? } (release: 창을 닫을 때 저장 후 권한 반납)
 * - release: 편집 권한 반납 (창을 닫을 때 sendBeacon)
 * - claim: 실시간으로 다시 연 사람이 단독 편집 내용 가져가기 → { json | null }
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  let body: { action?: unknown; json?: unknown; text?: unknown; release?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }

  switch (body.action) {
    case "acquire": {
      const result = await acquireSolo(user.id, id);
      if (!result) return NextResponse.json({ error: "문서를 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
    }
    case "save": {
      if (!body.json || typeof body.json !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
      const result = await saveLiveContentFor(user.id, id, { json: body.json as Record<string, unknown>, text: String(body.text ?? "") }, { solo: true });
      if (body.release === true) await releaseSolo(user.id, id);
      return NextResponse.json(result, { status: result.error ? (result.blocked ? 409 : 400) : 200 });
    }
    case "release":
      await releaseSolo(user.id, id);
      return new NextResponse(null, { status: 204 });
    case "claim":
      return NextResponse.json({ json: await claimSoloEdits(id) }, { headers: { "Cache-Control": "no-store" } });
    default:
      return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
}
