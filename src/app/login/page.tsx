import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ensureMembers, getCurrentUser, listMembers } from "@/lib/auth";
import { LoginForm } from "./login-form";
import { SetupGuide } from "@/components/setup-guide";
import { missingRequiredEnv } from "@/lib/setup";

export const metadata: Metadata = { title: "로그인" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const missing = missingRequiredEnv();
  if (missing.length) return <SetupGuide missing={missing} />;
  if (await getCurrentUser()) redirect("/");
  await ensureMembers();
  const members = await listMembers();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-pink-50 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">
            BX
          </div>
          <h1 className="text-2xl font-bold text-gray-900">BX Hub</h1>
          <p className="mt-1 text-sm text-gray-500">브랜드 체험마케팅 프로젝트 협업도구</p>
        </div>
        <div className="card p-6">
          <LoginForm
            next={next ?? "/"}
            members={members.map((m) => ({
              id: m.id,
              name: m.name,
              role: m.role,
              color: m.color,
              hasPassword: !!m.passwordHash,
            }))}
          />
        </div>
      </div>
    </main>
  );
}
