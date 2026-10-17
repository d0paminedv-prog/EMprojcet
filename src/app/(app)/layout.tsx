import Link from "next/link";
import { LogOut } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { leaveAction } from "@/app/join/actions";
import { MobileNav, SideNav } from "@/components/app-nav";
import { Avatar } from "@/components/ui";
import { SetupGuide } from "@/components/setup-guide";
import { OnlineMembers, TeamRealtimeProvider } from "@/components/realtime";
import { liveblocksBaseUrl, liveblocksConfigured } from "@/lib/liveblocks";
import { missingRequiredEnv } from "@/lib/setup";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const missing = missingRequiredEnv();
  if (missing.length) return <SetupGuide missing={missing} />;
  const user = await requireUser();

  return (
    <TeamRealtimeProvider enabled={liveblocksConfigured()} baseUrl={liveblocksBaseUrl()}>
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:flex lg:flex-col">
        <div className="sticky top-0 flex h-screen flex-col p-4">
          <Link href="/" className="mb-6 flex items-center gap-2.5 px-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white">BX</span>
            <span>
              <span className="block text-sm font-bold text-gray-900">BX Hub</span>
              <span className="block text-[11px] text-gray-500">브랜드 체험마케팅 협업</span>
            </span>
          </Link>
          <SideNav />
          <div className="mt-6">
            <OnlineMembers selfId={user.id} />
          </div>
          <div className="mt-auto flex items-center gap-2 rounded-lg border border-gray-100 p-2">
            <Avatar name={user.name} color={user.color} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-gray-900">{user.name}</p>
              {user.role && <p className="truncate text-xs text-gray-500">{user.role}</p>}
            </div>
            <form action={leaveAction}>
              <button type="submit" className="btn-ghost btn-sm" title="나가기 (다른 이름으로 입장)" aria-label="나가기">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-xs font-bold text-white">BX</span>
            <span className="text-sm font-bold">BX Hub</span>
          </Link>
          <div className="flex items-center gap-2">
            <OnlineMembers selfId={user.id} compact />
            <Avatar name={user.name} color={user.color} size="sm" />
            <form action={leaveAction}>
              <button type="submit" className="btn-ghost btn-sm" aria-label="나가기">
                <LogOut className="h-4 w-4" />
              </button>
            </form>
          </div>
        </div>
        <MobileNav />
      </div>

      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
      </main>
    </div>
    </TeamRealtimeProvider>
  );
}
