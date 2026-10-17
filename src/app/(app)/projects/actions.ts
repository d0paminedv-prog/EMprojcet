"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { documents, documentVersions, projects } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { requireUser } from "@/lib/auth";
import { PALETTE, PROJECT_CATEGORIES, PROJECT_STATUSES } from "@/lib/constants";
import { isValidDateKey } from "@/lib/dates";
import { deleteFile } from "@/lib/storage";
import { isUuid, str, type ActionState } from "@/lib/utils";

function readProjectForm(form: FormData) {
  const startDate = str(form, "startDate");
  const endDate = str(form, "endDate");
  const ownerId = str(form, "ownerId");
  const color = str(form, "color");
  const category = str(form, "category");
  const status = str(form, "status");
  return {
    name: str(form, "name"),
    brand: str(form, "brand"),
    category: PROJECT_CATEGORIES.some((c) => c.value === category) ? category : "etc",
    status: PROJECT_STATUSES.some((s) => s.value === status) ? status : "planning",
    startDate: isValidDateKey(startDate) ? startDate : null,
    endDate: isValidDateKey(endDate) ? endDate : null,
    venue: str(form, "venue"),
    description: str(form, "description"),
    color: /^#[0-9a-f]{6}$/i.test(color) ? color : PALETTE[0],
    ownerId: isUuid(ownerId) ? ownerId : null,
  };
}

function validate(data: ReturnType<typeof readProjectForm>): string | null {
  if (!data.name) return "프로젝트명을 입력하세요.";
  if (data.startDate && data.endDate && data.endDate < data.startDate) return "종료일이 시작일보다 빠릅니다.";
  return null;
}

export async function createProject(_prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  const data = readProjectForm(form);
  const error = validate(data);
  if (error) return { error };
  const [project] = await db.insert(projects).values(data).returning();
  await logActivity({
    actorId: user.id,
    verb: "프로젝트를 만들었습니다",
    targetType: "project",
    targetId: project.id,
    targetTitle: project.name,
    projectId: project.id,
  });
  revalidatePath("/", "layout");
  redirect(`/projects/${project.id}`);
}

export async function updateProject(id: string, _prev: ActionState, form: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!isUuid(id)) return { error: "잘못된 요청입니다." };
  const data = readProjectForm(form);
  const error = validate(data);
  if (error) return { error };
  const [project] = await db
    .update(projects)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  if (!project) return { error: "프로젝트를 찾을 수 없습니다." };
  await logActivity({
    actorId: user.id,
    verb: "프로젝트 정보를 수정했습니다",
    targetType: "project",
    targetId: project.id,
    targetTitle: project.name,
    projectId: project.id,
  });
  revalidatePath("/", "layout");
  redirect(`/projects/${project.id}`);
}

export async function deleteProject(id: string) {
  await requireUser();
  if (!isUuid(id)) return;
  // 프로젝트에 속한 업로드 파일도 저장소에서 삭제
  const docs = await db.select({ id: documents.id }).from(documents).where(eq(documents.projectId, id));
  if (docs.length) {
    const versions = await db
      .select({ storage: documentVersions.storage, key: documentVersions.storageKey })
      .from(documentVersions)
      .where(inArray(documentVersions.documentId, docs.map((d) => d.id)));
    await Promise.all(versions.map((v) => deleteFile(v.storage, v.key)));
  }
  await db.delete(projects).where(eq(projects.id, id));
  revalidatePath("/", "layout");
  redirect("/projects");
}
