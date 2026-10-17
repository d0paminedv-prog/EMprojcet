import { databaseUrl } from "@/db";

/** Vercel 배포 시 꼭 필요한 환경변수 누락 여부 */
export function missingRequiredEnv(): string[] {
  if (!process.env.VERCEL) return [];
  const missing: string[] = [];
  if (!databaseUrl()) missing.push("DATABASE_URL (Storage 탭에서 Neon Postgres 연결)");
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 16) missing.push("AUTH_SECRET (16자 이상 임의 문자열)");
  if (!process.env.LIVEBLOCKS_SECRET_KEY) missing.push("LIVEBLOCKS_SECRET_KEY (liveblocks.io 무료 가입 후 Secret key)");
  return missing;
}
