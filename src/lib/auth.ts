import crypto from "node:crypto";
import { promisify } from "node:util";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { members, type Member } from "@/db/schema";
import { PALETTE } from "./constants";

export const SESSION_COOKIE = "bx_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일
const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

function authSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.VERCEL) {
    throw new Error("AUTH_SECRET 환경변수(16자 이상)를 Vercel 프로젝트 설정에 추가하세요.");
  }
  return "local-dev-only-insecure-secret";
}

/** 첫 로그인 시 개인 비밀번호를 만들 때 필요한 팀 공통 초대 코드 */
export function teamPassword(): string | null {
  const value = process.env.TEAM_PASSWORD;
  if (value) return value;
  return process.env.VERCEL ? null : "team1234";
}

// ---------- 비밀번호 해시 (scrypt) ----------

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltB64, hashB64] = stored.split("$");
  if (algo !== "scrypt" || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function safeEqual(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(a).digest();
  const hb = crypto.createHash("sha256").update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------- 세션 쿠키 (HMAC 서명) ----------

type SessionPayload = { m: string; v: number; e: number };

function sign(data: string): string {
  return crypto.createHmac("sha256", authSecret()).update(data).digest("base64url");
}

export function createSessionToken(member: Pick<Member, "id" | "sessionVersion">): string {
  const payload: SessionPayload = {
    m: member.id,
    v: member.sessionVersion,
    e: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

function readSessionToken(token: string | undefined): SessionPayload | null {
  if (!token) return null;
  const [data, signature] = token.split(".");
  if (!data || !signature) return null;
  const expected = sign(data);
  if (expected.length !== signature.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, "base64url").toString()) as SessionPayload;
    if (typeof payload.m !== "string" || payload.e < Date.now() / 1000) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(member: Pick<Member, "id" | "sessionVersion">) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(member), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** 현재 로그인한 팀원 (요청당 1회만 조회) */
export const getCurrentUser = cache(async (): Promise<Member | null> => {
  const store = await cookies();
  const payload = readSessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;
  const [member] = await db.select().from(members).where(eq(members.id, payload.m)).limit(1);
  if (!member || member.sessionVersion !== payload.v || !member.passwordHash) return null;
  return member;
});

/** 페이지/서버 액션에서 로그인 필수 */
export async function requireUser(): Promise<Member> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

// ---------- 팀원 초기 데이터 ----------

const DEFAULT_MEMBERS = ["팀원1", "팀원2", "팀원3", "팀원4", "팀원5"];

/** 팀원이 한 명도 없으면 TEAM_MEMBERS 환경변수(쉼표 구분)로 초기 팀원을 생성 */
export async function ensureMembers(): Promise<void> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(members);
  if (count > 0) return;
  const names = (process.env.TEAM_MEMBERS ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
  const list = (names.length ? names : DEFAULT_MEMBERS).slice(0, 20);
  await db
    .insert(members)
    .values(list.map((name, i) => ({ name, color: PALETTE[i % PALETTE.length], createdAt: new Date(Date.now() + i) })))
    .onConflictDoNothing();
}

export async function listMembers(): Promise<Member[]> {
  return db.select().from(members).orderBy(asc(members.createdAt), asc(members.name));
}
