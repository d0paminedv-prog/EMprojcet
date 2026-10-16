import type { Metadata } from "next";
import { CheckCircle2, CircleAlert } from "lucide-react";
import { databaseUrl } from "@/db";
import { ConfirmButton } from "@/components/form-controls";
import { Avatar, Badge, Card, PageHeader } from "@/components/ui";
import { AI_MODEL, aiConfigured } from "@/lib/ai";
import { listMembers, requireUser } from "@/lib/auth";
import { blobAccess, storageMode, storageReady } from "@/lib/storage";
import { addMember, changePassword, removeMember, resetMemberPassword, updateMember } from "./actions";
import { AddMemberForm, ChangePasswordForm, MemberEditForm } from "./team-forms";

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
      <PageHeader title="팀" description="팀원 정보와 로그인, 서비스 연결 상태를 관리합니다." />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card title={`팀원 (${members.length})`}>
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
                          {!m.passwordHash && <Badge className="bg-amber-50 text-amber-700">첫 로그인 대기</Badge>}
                        </span>
                        <span className="block text-xs text-gray-500">{[m.role, m.email].filter(Boolean).join(" · ") || "역할 미입력"}</span>
                      </span>
                      <span className="text-xs text-brand-600">편집</span>
                    </summary>
                    <MemberEditForm action={updateMember.bind(null, m.id)} member={{ name: m.name, role: m.role, email: m.email, color: m.color }} />
                    {m.id !== user.id && (
                      <div className="mt-2 flex flex-wrap justify-end gap-2">
                        {m.passwordHash && (
                          <form action={resetMemberPassword.bind(null, m.id)}>
                            <ConfirmButton message={`${m.name}님의 비밀번호를 초기화할까요? 다음 로그인 때 팀 초대 코드로 새 비밀번호를 만들게 됩니다.`} className="btn-secondary btn-sm">
                              비밀번호 초기화
                            </ConfirmButton>
                          </form>
                        )}
                        <form action={removeMember.bind(null, m.id)}>
                          <ConfirmButton message={`${m.name}님을 팀에서 삭제할까요? 작성한 문서·회의록은 유지됩니다.`}>삭제</ConfirmButton>
                        </form>
                      </div>
                    )}
                  </details>
                </li>
              ))}
            </ul>
            <div className="mt-5 border-t border-gray-100 pt-4">
              <AddMemberForm action={addMember} />
            </div>
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="내 비밀번호 변경">
            <ChangePasswordForm action={changePassword} />
          </Card>
          <Card title="서비스 연결 상태">
            <ul className="space-y-3">
              <Status
                ok={!!databaseUrl()}
                label="데이터베이스"
                detail={databaseUrl() ? "Postgres 연결됨" : "로컬 내장 DB(PGlite) 사용 중 — 배포 시 Neon Postgres 연결 필요"}
              />
              <Status
                ok={mode === "blob" && storageReady()}
                label="파일 저장소"
                detail={mode === "blob" ? `Vercel Blob (${blobAccess() === "private" ? "비공개" : "공개"})` : storageReady() ? "로컬 폴더(.data/uploads) — 배포 시 Vercel Blob 연결 필요" : "Vercel Blob 미연결 — 업로드 불가"}
              />
              <Status ok={aiConfigured()} label="AI 회의록 정리" detail={aiConfigured() ? `Claude (${AI_MODEL})` : "ANTHROPIC_API_KEY 미설정"} />
            </ul>
          </Card>
        </aside>
      </div>
    </div>
  );
}
