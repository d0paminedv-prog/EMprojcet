// 한국 표준시(KST, UTC+9, 서머타임 없음) 기준 날짜 유틸리티
export const TIME_ZONE = "Asia/Seoul";
const OFFSET_MS = 9 * 60 * 60 * 1000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Date → KST 기준 연/월/일/시/분/요일 */
export function kstParts(date: Date) {
  const s = new Date(date.getTime() + OFFSET_MS);
  return {
    year: s.getUTCFullYear(),
    month: s.getUTCMonth() + 1,
    day: s.getUTCDate(),
    hour: s.getUTCHours(),
    minute: s.getUTCMinutes(),
    weekday: s.getUTCDay(),
  };
}

/** Date → "YYYY-MM-DD" (KST) */
export function toDateKey(date: Date): string {
  const p = kstParts(date);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Date → datetime-local 입력값 "YYYY-MM-DDTHH:mm" (KST) */
export function toDateTimeInput(date: Date): string {
  const p = kstParts(date);
  return `${toDateKey(date)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/** "YYYY-MM-DD" → 해당 날짜 00:00 KST */
export function parseDateKey(key: string): Date {
  return new Date(`${key}T00:00:00+09:00`);
}

/** "YYYY-MM-DDTHH:mm" (KST) → Date */
export function parseDateTimeInput(value: string): Date {
  return new Date(`${value}:00+09:00`);
}

export function isValidDateKey(key: string | null | undefined): key is string {
  return !!key && /^\d{4}-\d{2}-\d{2}$/.test(key) && !Number.isNaN(parseDateKey(key).getTime());
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** "YYYY-MM-DD" 에 일수 더하기 */
export function addDays(key: string, days: number): string {
  return toDateKey(new Date(parseDateKey(key).getTime() + days * 86400000));
}

export function formatDate(
  value: Date | string | null | undefined,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "long", day: "numeric", weekday: "short" },
): string {
  if (!value) return "";
  const date = typeof value === "string" ? (isValidDateKey(value) ? parseDateKey(value) : new Date(value)) : value;
  return new Intl.DateTimeFormat("ko-KR", { timeZone: TIME_ZONE, ...options }).format(date);
}

export function formatShortDate(value: Date | string | null | undefined): string {
  return formatDate(value, { month: "numeric", day: "numeric", weekday: "short" });
}

export function formatTime(value: Date): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function formatDateTime(value: Date): string {
  return `${formatShortDate(value)} ${formatTime(value)}`;
}

export function formatRelative(value: Date): string {
  const diff = Date.now() - value.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}일 전`;
  return formatShortDate(value);
}

/** D-day 표기 (오늘 기준, KST) */
export function dDay(key: string): string {
  const diff = Math.round((parseDateKey(key).getTime() - parseDateKey(todayKey()).getTime()) / 86400000);
  if (diff === 0) return "D-Day";
  return diff > 0 ? `D-${diff}` : `D+${-diff}`;
}

/** 월간 달력 그리드(일요일 시작, 6주) 의 날짜 키 목록 */
export function monthGrid(year: number, month: number): string[] {
  const first = `${year}-${pad(month)}-01`;
  const firstWeekday = kstParts(parseDateKey(first)).weekday;
  const start = addDays(first, -firstWeekday);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month)}`;
}

export function parseMonthKey(value: string | undefined | null): { year: number; month: number } {
  const m = value?.match(/^(\d{4})-(\d{2})$/);
  if (m) {
    const month = Number(m[2]);
    if (month >= 1 && month <= 12) return { year: Number(m[1]), month };
  }
  const p = kstParts(new Date());
  return { year: p.year, month: p.month };
}

export function shiftMonth(year: number, month: number, delta: number) {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

/** 지금으로부터 n일 전 시각 */
export function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 86400000);
}
