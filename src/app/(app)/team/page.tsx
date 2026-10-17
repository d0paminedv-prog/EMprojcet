import type { Metadata } from "next";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { databaseUrl } from "@/db";
import { ConfirmButton } from "@/components/form-controls";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { MAX_MEMBERS, entryCode, listMembers, requireUser } from "@/lib/auth";
import { formatRelative } from "@/lib/dates";
import { siteOrigin } from "@/lib/site";
import { figmaConfigured } from "@/lib/figma";
import { liveblocksConfigured } from "@/lib/liveblocks";
import { blobAccess, storageMode, storageReady } from "@/lib/storage";
import { removeMember, updateMember } from "./actions";
import { InviteBox, MemberEditForm } from "./team-forms";

export const metadata: Metadata = { title: "팀" };

function Status({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-500" /> : <CircleAlert className="mt-0.5 h-4 w-4 text-amber-500" />}
      <span>
        <span className="font-medium text-gray-900">{label}</span>
        <span className="block text-xs text-gray-500">{detail}</span>
      </span>
    </li>
  );
}

export default async function TeamPage() {
  const user = await requireUser();
  const members = await listMembers();
  const mode = storageMode();

  return (
    <div>
      <PageHeader title="팀" description="팀원 정보와 초대, 서비스 연결 상태를 관리합니다." />
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card title={`팀원 (${members.length}/${MAX_MEMBERS})`}>
          <ul className="divide-y divide-gray-100">
            {members.map((m) => (
              <li key={m.id} className="py-3 first:pt-0 last:pb-0">
                <details>
                  <summary className="flex cursor-pointer list-none items-center gap-3">
                    <Avatar name={m.name} color={m.color} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{m.name}</span>
                        {m.id === user.id && <Badge className="bg-brand-50 text-brand-700">나</Badge>}
                      </span>
                      <span className="block text-xs text-gray-500">
                        {m.role || "역할 미입력"}
                        {m.lastSeenAt && ` · 최근 입장 ${formatRelative(m.lastSeenAt)}`}
                      </span>
                    </span>
                    <span className="text-xs text-brand-600">편집</span>
                  </summary>
                  <MemberEditForm action={updateMember.bind(null, m.id)} member={{ name: m.name, role: m.role, color: m.color }} />
                  {m.id !== user.id && (
                    <form action={removeMember.bind(null, m.id)} className="mt-2 flex justify-end">
                      <ConfirmButton message={`${m.name}님을 팀에서 삭제할까요? 담당 태스크는 '미배정'으로 바뀌고 문서는 유지됩니다.`}>삭제</ConfirmButton>
                    </form>
                  )}
                </details>
              </li>
            ))}
          </ul>
        </Card>

        <aside className="space-y-6">
          <Card title="팀원 초대">
            <InviteBox code={entryCode()} origin={await siteOrigin()} />
          </Card>
          <Card title="서비스 연결 상태">
            <ul className="space-y-3">
              <Status ok={!!databaseUrl()} label="데이터베이스" detail={databaseUrl() ? "Postgres 연결됨" : "로컬 내장 DB(PGlite) 사용 중"} />
              <Status
                ok={mode === "blob" && storageReady()}
                label="파일 저장소"
                detail={mode === "blob" ? `Vercel Blob (${blobAccess() === "private" ? "비공개" : "공개"})` : storageReady() ? "로컬 폴더(.data/uploads)" : "Vercel Blob 미연결 — 업로드 불가"}
              />
              <Status ok={liveblocksConfigured()} label="실시간 동기화 (Liveblocks)" detail={liveblocksConfigured() ? "연결됨" : "LIVEBLOCKS_SECRET_KEY 미설정 — 실시간 문서 사용 불가"} />
              <Status ok label="Figma" detail={figmaConfigured() ? "공유 링크 미리보기 + 썸네일·수정 시각" : "공유 링크로 미리보기 (추가 설정 없음)"} />
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
