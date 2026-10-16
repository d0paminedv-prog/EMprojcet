import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "BX Hub · 브랜드 체험마케팅 협업", template: "%s · BX Hub" },
  description: "브랜드 체험마케팅 프로젝트 팀을 위한 문서 공유 · 일정 관리 · AI 회의록 협업도구",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-screen font-sans">{children}</body>
    </html>
  );
}
