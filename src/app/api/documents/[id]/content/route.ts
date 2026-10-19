import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { saveLiveContentFor } from "@/lib/live-content";

/** 창을 닫거나 다른 화면으로 갈 때 남은 본문 사본 저장 (fetch keepalive 용) */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "입장이 필요합니다." }, { status: 401 });
  const { id } = await ctx.params;
  let body: { json?: Record<string, unknown>; text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  }
  if (!body.json || typeof body.json !== "object") return NextResponse.json({ error: "잘못된 요청" }, { status: 400 });
  const result = await saveLiveContentFor(user.id, id, { json: body.json, text: String(body.text ?? "") });
  return NextResponse.json(result, { status: result.error ? 400 : 200 });
}
