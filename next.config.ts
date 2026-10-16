import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite(로컬 개발용 내장 Postgres)는 WASM 파일을 패키지 경로에서 직접 읽으므로 번들링하지 않습니다.
  serverExternalPackages: ["@electric-sql/pglite", "mammoth"],
  experimental: {
    serverActions: {
      // 회의 원문(긴 텍스트) 저장을 위해 기본 1MB보다 여유 있게 설정
      bodySizeLimit: "4mb",
    },
  },
};

export default nextConfig;
