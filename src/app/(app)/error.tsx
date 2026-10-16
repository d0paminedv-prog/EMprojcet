"use client";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-xl p-6">
      <h2 className="text-lg font-semibold text-gray-900">문제가 발생했습니다</h2>
      <p className="mt-2 text-sm text-gray-600">{error.message || "잠시 후 다시 시도해 주세요."}</p>
      {error.digest && <p className="mt-1 text-xs text-gray-400">오류 코드: {error.digest}</p>}
      <button type="button" onClick={reset} className="btn-primary mt-4">
        다시 시도
      </button>
    </div>
  );
}
