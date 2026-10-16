import { asc, desc } from "drizzle-orm";
import { db } from "@/db";
import { members, projects } from "@/db/schema";

export async function projectOptions() {
  return db
    .select({ id: projects.id, name: projects.name, color: projects.color, status: projects.status })
    .from(projects)
    .orderBy(desc(projects.updatedAt));
}

export async function memberOptions() {
  return db
    .select({ id: members.id, name: members.name, color: members.color, role: members.role })
    .from(members)
    .orderBy(asc(members.createdAt), asc(members.name));
}

export type ProjectOption = Awaited<ReturnType<typeof projectOptions>>[number];
export type MemberOption = Awaited<ReturnType<typeof memberOptions>>[number];
