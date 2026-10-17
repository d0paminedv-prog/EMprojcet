// DB 마이그레이션 실행 스크립트 (npm run dev / npm run build 전에 자동 실행)
// - DATABASE_URL(또는 POSTGRES_URL)이 있으면 해당 Postgres(Neon 등)에 적용
// - 없으면 로컬 개발용 내장 Postgres(PGlite, .data/pglite)에 적용
import path from "node:path";
import { mkdirSync } from "node:fs";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const migrationsFolder = path.join(process.cwd(), "drizzle");
const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;

async function main() {
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    const { migrate } = await import("drizzle-orm/postgres-js/migrator");
    const client = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder });
      console.log("✓ DB 마이그레이션 완료 (Postgres)");
    } finally {
      await client.end();
    }
    return;
  }

  if (process.env.VERCEL) {
    console.warn(
      "⚠ DATABASE_URL이 없습니다. Vercel Storage 탭에서 Postgres(Neon)를 연결한 후 재배포하세요. (마이그레이션 건너뜀)",
    );
    return;
  }

  const dataDir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dataDir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
  try {
    await migrate(drizzle(client), { migrationsFolder });
    console.log("✓ DB 마이그레이션 완료 (로컬 PGlite: .data/pglite)");
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("✗ DB 마이그레이션 실패:", err);
  process.exit(1);
});
