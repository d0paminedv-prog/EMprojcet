import { redirect } from "next/navigation";
import { getCurrentUser, hasValidGate } from "@/lib/auth";
import { EntryCodeForm } from "./join-forms";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getCurrentUser()) redirect(next ?? "/");
  if (await hasValidGate()) redirect(`/join/name${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return <EntryCodeForm next={next ?? "/"} />;
}
