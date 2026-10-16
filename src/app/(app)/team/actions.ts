"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members } from "@/db/schema";
import { hashPassword, requireUser, setSessionCookie, verifyPassword } from "@/lib/auth";
import { PALETTE } from "@/lib/constants";
import { isUuid, str, type ActionState } from "@/lib/utils";

export async function updateMember(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const name = str(form, "name");
  if (!name) return { error: "이름을 입력하세요." };
  const [dup] = await db.select({ id: members.id }).from(members).where(and(eq(members.name, name), ne(members.id, id))).limit(1);
  if (dup) return { error: "같은 이름의 팀원이 이미 있습니다." };
  const color = str(form, "color");
  await db
    .update(members)
    .set({
      name,
      role: str(form, "role"),
      email: str(form, "email"),
      color: /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[0],
    })
    .where(eq(members.id, id));
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했습니다." };
}

export async function addMember(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  const name = str(form, "name");
  if (!name) return { error: "이름을 입력하세요." };
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(members);
  const inserted = await db
    .insert(members)
    .values({ name, role: str(form, "role"), color: PALETTE[total % PALETTE.length] })
    .onConflictDoNothing()
    .returning();
  if (!inserted.length) return { error: "같은 이름의 팀원이 이미 있습니다." };
  revalidatePath("/", "layout");
  return { ok: true, message: `${name}님을 추가했습니다. 팀 초대 코드로 첫 로그인할 수 있습니다.` };
}

export async function removeMember(id: string) {
  const user = await requireUser();
  if (!isUuid(id) || id === user.id) return;
  await db.delete(members).where(eq(members.id, id));
  revalidatePath("/", "layout");
}

/** 다른 팀원의 비밀번호 초기화 → 다음 로그인 때 팀 초대 코드로 새 비밀번호 설정 */
export async function resetMemberPassword(id: string) {
  const user = await requireUser();
  if (!isUuid(id) || id === user.id) return;
  await db
    .update(members)
    .set({ passwordHash: null, sessionVersion: sql`${members.sessionVersion} + 1` })
    .where(eq(members.id, id));
  revalidatePath("/team");
}

export async function changePassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const current = String(form.get("current") ?? "");
  const next = String(form.get("next") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (!user.passwordHash || !(await verifyPassword(current, user.passwordHash))) return { error: "현재 비밀번호가 올바르지 않습니다." };
  if (next.length < 6) return { error: "새 비밀번호는 6자 이상이어야 합니다." };
  if (next !== confirm) return { error: "새 비밀번호 확인이 일치하지 않습니다." };
  const [updated] = await db
    .update(members)
    .set({ passwordHash: await hashPassword(next), sessionVersion: sql`${members.sessionVersion} + 1` })
    .where(eq(members.id, user.id))
    .returning();
  await setSessionCookie(updated);
  return { ok: true, message: "비밀번호를 변경했습니다. 다른 기기에서는 다시 로그인해야 합니다." };
}
