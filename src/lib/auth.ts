import crypto from "node:crypto";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { entryAttempts, members, type Member } from "@/db/schema";

/**
 * 입장 방식
 * 1) 팀원에게 공유한 링크로 접속 → 2) 입장 코드(기본 「2심전심」) 입력 → 3) 본인 이름 입력
 * 이름이 처음이면 팀원으로 등록되고, 이미 있으면 그 팀원으로 들어갑니다.
 * 입장 코드를 바꾸면 모든 기기의 입장 상태가 초기화됩니다.
 */
export const GATE_COOKIE = "bx_gate";
export const SESSION_COOKIE = "bx_session";
const MAX_AGE = 60 * 60 * 24 * 30; // 30일
export const MAX_MEMBERS = 10;

const ATTEMPT_LIMIT = 5;
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;
const BLOCK_MS = 10 * 60 * 1000;

export function entryCode(): string {
  return (process.env.ENTRY_CODE ?? "").trim() || "2심전심";
}

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.VERCEL) throw new Error("AUTH_SECRET 환경변수(16자 이상)를 Vercel 프로젝트 설정에 추가하세요.");
  return "local-dev-only-insecure-secret";
}

function sign(data: string): string {
  return crypto.createHmac("sha256", authSecret()).update(data).digest("base64url");
}

/** 현재 입장 코드의 지문 — 코드가 바뀌면 기존 쿠키가 모두 무효가 됩니다. */
function codeFingerprint(): string {
  return sign(`entry-code:${entryCode().normalize("NFC")}`).slice(0, 16);
}

function normalizeCode(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, "");
}

export function isCorrectCode(input: string): boolean {
  const a = crypto.createHash("sha256").update(normalizeCode(input)).digest();
  const b = crypto.createHash("sha256").update(normalizeCode(entryCode())).digest();
  return crypto.timingSafeEqual(a, b);
}

type Token = { k: "gate" | "session"; c: string; e: number; m?: string };

function encode(token: Token): string {
  const data = Buffer.from(JSON.stringify(token)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function decode(value: string | undefined, kind: Token["k"]): Token | null {
  if (!value) return null;
  const [data, signature] = value.split(".");
  if (!data || !signature) return null;
  const expected = sign(data);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const token = JSON.parse(Buffer.from(data, "base64url").toString()) as Token;
    if (token.k !== kind || token.c !== codeFingerprint() || token.e < Date.now() / 1000) return null;
    return token;
  } catch {
    return null;
  }
}

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE,
};

export async function setGateCookie() {
  const store = await cookies();
  store.set(GATE_COOKIE, encode({ k: "gate", c: codeFingerprint(), e: Math.floor(Date.now() / 1000) + MAX_AGE }), cookieOptions);
}

export async function hasValidGate(): Promise<boolean> {
  const store = await cookies();
  return !!decode(store.get(GATE_COOKIE)?.value, "gate");
}

export async function setSessionCookie(memberId: string) {
  const store = await cookies();
  store.set(
    SESSION_COOKIE,
    encode({ k: "session", c: codeFingerprint(), m: memberId, e: Math.floor(Date.now() / 1000) + MAX_AGE }),
    cookieOptions,
  );
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 현재 입장한 팀원 (요청당 1회 조회) */
export const getCurrentUser = cache(async (): Promise<Member | null> => {
  const store = await cookies();
  const token = decode(store.get(SESSION_COOKIE)?.value, "session");
  if (!token?.m) return null;
  const [member] = await db.select().from(members).where(eq(members.id, token.m)).limit(1);
  return member ?? null;
});

/** 페이지·서버 액션에서 입장 필수 */
export async function requireUser(): Promise<Member> {
  const user = await getCurrentUser();
  if (!user) redirect("/join");
  return user;
}

export async function listMembers(): Promise<Member[]> {
  return db.select().from(members).orderBy(asc(members.createdAt), asc(members.name));
}

// ---------- 입장 코드 연속 실패 제한 ----------

async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/** 차단 중이면 남은 분(min)을 반환 */
export async function entryBlockedMinutes(): Promise<number> {
  const key = await clientKey();
  const [row] = await db.select().from(entryAttempts).where(eq(entryAttempts.key, key)).limit(1);
  if (!row?.blockedUntil || row.blockedUntil.getTime() <= Date.now()) return 0;
  return Math.ceil((row.blockedUntil.getTime() - Date.now()) / 60000);
}

export async function recordEntryFailure(): Promise<void> {
  const key = await clientKey();
  const now = new Date();
  const [row] = await db.select().from(entryAttempts).where(eq(entryAttempts.key, key)).limit(1);
  const inWindow = row && now.getTime() - row.windowStart.getTime() < ATTEMPT_WINDOW_MS;
  const failures = inWindow ? row.failures + 1 : 1;
  const values = {
    failures,
    windowStart: inWindow ? row.windowStart : now,
    blockedUntil: failures >= ATTEMPT_LIMIT ? new Date(now.getTime() + BLOCK_MS) : null,
  };
  await db
    .insert(entryAttempts)
    .values({ key, ...values })
    .onConflictDoUpdate({ target: entryAttempts.key, set: values });
}

export async function clearEntryFailures(): Promise<void> {
  const key = await clientKey();
  await db.delete(entryAttempts).where(eq(entryAttempts.key, key));
}

export async function memberCount(): Promise<number> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members);
  return count;
}
