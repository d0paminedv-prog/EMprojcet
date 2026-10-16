import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-4xl font-bold text-gray-300">404</p>
      <p className="text-sm text-gray-600">요청하신 항목을 찾을 수 없습니다.</p>
      <Link href="/" className="btn-secondary">
        대시보드로 이동
      </Link>
    </div>
  );
}
