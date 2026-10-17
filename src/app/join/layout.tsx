import type { Metadata } from "next";
import { SetupGuide } from "@/components/setup-guide";
import { missingRequiredEnv } from "@/lib/setup";

export const metadata: Metadata = { title: "입장" };

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  const missing = missingRequiredEnv();
  if (missing.length) return <SetupGuide missing={missing} />;
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-brand-50 via-white to-pink-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600 text-lg font-bold text-white">BX</div>
          <h1 className="text-2xl font-bold text-gray-900">BX Hub</h1>
          <p className="mt-1 text-sm text-gray-500">브랜드 체험마케팅 팀 협업도구</p>
        </div>
        <div className="card p-6">{children}</div>
      </div>
    </main>
  );
}
