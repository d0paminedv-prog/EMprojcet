export function SetupGuide({ missing }: { missing: string[] }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-xl p-6">
        <h1 className="text-lg font-bold text-gray-900">초기 설정이 필요합니다</h1>
        <p className="mt-2 text-sm text-gray-600">
          Vercel 프로젝트의 <b>Settings → Environment Variables</b> 또는 <b>Storage</b> 탭에서 아래 항목을 설정한 뒤{" "}
          <b>재배포(Redeploy)</b> 하세요.
        </p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-800">
          {missing.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-gray-500">자세한 방법은 저장소의 README.md 「Vercel 배포」 항목을 참고하세요.</p>
      </div>
    </main>
  );
}
