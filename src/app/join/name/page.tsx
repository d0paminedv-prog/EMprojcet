import { redirect } from "next/navigation";
import { getCurrentUser, hasValidGate, listMembers } from "@/lib/auth";
import { NameForm } from "../join-forms";

export default async function JoinNamePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (!(await hasValidGate())) redirect("/join");
  if (await getCurrentUser()) redirect(next ?? "/");
  const names = (await listMembers()).map((m) => m.name);
  return <NameForm next={next ?? "/"} names={names} />;
}
