"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members } from "@/db/schema";
import {
  clearSessionCookie,
  hashPassword,
  safeEqual,
  setSessionCookie,
  teamPassword,
  verifyPassword,
} from "@/lib/auth";
import { isUuid, str, type ActionState } from "@/lib/utils";

function safeNext(value: string): string {
  // "/path" 형태만 허용 ("//evil.com", "/\\evil.com" 같은 외부 주소 차단)
  return /^\/(?![/\\])/.test(value) ? value : "/";
}

export async function loginAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const memberId = str(form, "memberId");
  const password = String(form.get("password") ?? "");
  const next = safeNext(str(form, "next"));
  if (!isUuid(memberId)) return { error: "팀원을 선택하세요." };

  const [member] = await db.select().from(members).where(eq(members.id, memberId)).limit(1);
  if (!member) return { error: "팀원을 찾을 수 없습니다." };

  if (member.passwordHash) {
    if (!password || !(await verifyPassword(password, member.passwordHash))) {
      return { error: "비밀번호가 올바르지 않습니다." };
    }
    await setSessionCookie(member);
    redirect(next);
  }

  // 첫 로그인: 팀 초대 코드 확인 후 개인 비밀번호 설정
  const code = teamPassword();
  if (!code) return { error: "관리자가 TEAM_PASSWORD 환경변수를 설정해야 합니다." };
  const inviteCode = String(form.get("inviteCode") ?? "");
  const newPassword = String(form.get("newPassword") ?? "");
  const confirm = String(form.get("confirmPassword") ?? "");
  if (!safeEqual(inviteCode, code)) return { error: "팀 초대 코드가 올바르지 않습니다." };
  if (newPassword.length < 6) return { error: "비밀번호는 6자 이상으로 설정하세요." };
  if (newPassword !== confirm) return { error: "비밀번호 확인이 일치하지 않습니다." };

  const [updated] = await db
    .update(members)
    .set({ passwordHash: await hashPassword(newPassword), sessionVersion: sql`${members.sessionVersion} + 1` })
    .where(eq(members.id, member.id))
    .returning();
  await setSessionCookie(updated);
  redirect(next);
}

export async function logoutAction() {
  await clearSessionCookie();
  redirect("/login");
}
