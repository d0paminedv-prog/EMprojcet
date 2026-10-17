"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import {
  MAX_MEMBERS,
  clearEntryFailures,
  clearSessionCookie,
  entryBlockedMinutes,
  hasValidGate,
  isCorrectCode,
  memberCount,
  recordEntryFailure,
  setGateCookie,
  setSessionCookie,
} from "@/lib/auth";
import { PALETTE } from "@/lib/constants";
import { str, type ActionState } from "@/lib/utils";

function safeNext(value: string): string {
  // "/path" 형태만 허용 ("//evil.com", "/\evil.com" 같은 외부 주소 차단)
  return /^\/(?![/\\])/.test(value) ? value : "/";
}

export async function submitEntryCode(_prev: ActionState, form: FormData): Promise<ActionState> {
  const blocked = await entryBlockedMinutes();
  if (blocked) return { error: `입장 코드를 여러 번 틀려 잠시 막혔습니다. ${blocked}분 뒤에 다시 시도하세요.` };

  if (!isCorrectCode(String(form.get("code") ?? ""))) {
    await recordEntryFailure();
    return { error: "입장 코드가 올바르지 않습니다." };
  }
  await clearEntryFailures();
  await setGateCookie();
  const next = safeNext(str(form, "next"));
  redirect(`/join/name${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`);
}

export async function submitName(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await hasValidGate())) redirect("/join");
  const name = str(form, "name").normalize("NFC").replace(/\s+/g, " ");
  if (!name) return { error: "이름을 입력하세요." };
  if (name.length > 20) return { error: "이름은 20자 이내로 입력하세요." };

  let [member] = await db.select().from(members).where(eq(members.name, name)).limit(1);
  if (!member) {
    const count = await memberCount();
    if (count >= MAX_MEMBERS) {
      return { error: `팀 인원이 가득 찼습니다(최대 ${MAX_MEMBERS}명). 기존 이름으로 입장하거나 「팀」 화면에서 정리하세요.` };
    }
    const inserted = await db
      .insert(members)
      .values({ name, color: PALETTE[count % PALETTE.length], lastSeenAt: new Date() })
      .onConflictDoNothing()
      .returning();
    member = inserted[0] ?? (await db.select().from(members).where(eq(members.name, name)).limit(1))[0];
    if (inserted[0]) {
      await logActivity({ actorId: member.id, verb: "팀에 합류했습니다", targetType: "member", targetId: member.id, targetTitle: member.name });
    }
  } else {
    await db.update(members).set({ lastSeenAt: sql`now()` }).where(eq(members.id, member.id));
  }

  await setSessionCookie(member.id);
  redirect(safeNext(str(form, "next")));
}

/** 나가기 — 입장 코드는 유지하고 이름 입력 화면으로 */
export async function leaveAction() {
  await clearSessionCookie();
  redirect("/join/name");
}
