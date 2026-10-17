import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

const globalForDb = globalThis as unknown as { __bxDb?: DB };

function createDb(): DB {
  const url = databaseUrl();
  if (url) {
    // Neon/Supabase 등 풀링(pgbouncer) 연결에서도 동작하도록 prepared statement 비활성화
    const client = postgres(url, { prepare: false, max: 5 });
    return drizzlePostgres(client, { schema });
  }

  if (process.env.VERCEL) {
    throw new Error(
      "DATABASE_URL이 설정되지 않았습니다. Vercel 프로젝트의 Storage 탭에서 Postgres(Neon)를 연결한 뒤 다시 배포하세요.",
    );
  }

  // 로컬 개발: 설치 없이 동작하는 내장 Postgres(PGlite). 데이터는 .data/pglite 에 저장됩니다.
  const client = new PGlite(path.join(process.cwd(), ".data", "pglite"));
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): DB {
  if (!globalForDb.__bxDb) globalForDb.__bxDb = createDb();
  return globalForDb.__bxDb;
}

/** 첫 사용 시점에 연결을 만드는 지연 초기화 프록시 */
export const db = new Proxy({} as DB, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * as schema from "./schema";
