"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { PALETTE } from "@/lib/constants";
import { isUuid, str, type ActionState } from "@/lib/utils";

export async function updateMember(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const name = str(form, "name").normalize("NFC").replace(/\s+/g, " ");
  if (!name || name.length > 20) return { error: "이름을 1~20자로 입력하세요." };
  const [dup] = await db.select({ id: members.id }).from(members).where(and(eq(members.name, name), ne(members.id, id))).limit(1);
  if (dup) return { error: "같은 이름의 팀원이 이미 있습니다." };
  const color = str(form, "color");
  await db
    .update(members)
    .set({ name, role: str(form, "role"), color: /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[0] })
    .where(eq(members.id, id));
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했습니다." };
}

/** 오타로 잘못 만든 이름 등을 정리 (담당 태스크는 미배정으로 바뀜) */
export async function removeMember(id: string) {
  const user = await requireUser();
  if (!isUuid(id) || id === user.id) return;
  await db.delete(members).where(eq(members.id, id));
  revalidatePath("/", "layout");
}
