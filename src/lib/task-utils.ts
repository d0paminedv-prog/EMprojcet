import { addDays, parseDateKey, todayKey } from "./dates";

export type DueTone = "overdue" | "today" | "soon" | "later" | "none";

/** 마감일 표시 (KST 기준) */
export function dueInfo(dueDate: string | null, done = false): { label: string; tone: DueTone } {
  if (!dueDate) return { label: "마감 없음", tone: "none" };
  const today = todayKey();
  const diff = Math.round((parseDateKey(dueDate).getTime() - parseDateKey(today).getTime()) / 86400000);
  const md = `${Number(dueDate.slice(5, 7))}/${Number(dueDate.slice(8, 10))}`;
  if (done) return { label: md, tone: "later" };
  if (diff < 0) return { label: `${md} · ${-diff}일 지남`, tone: "overdue" };
  if (diff === 0) return { label: "오늘 마감", tone: "today" };
  if (diff <= 6) return { label: `${md} · D-${diff}`, tone: "soon" };
  return { label: md, tone: "later" };
}

/** 짧은 마감 표기 (카드 요약용) */
export function shortDue(dueDate: string | null, done = false): string {
  const { tone, label } = dueInfo(dueDate, done);
  if (tone === "none") return "-";
  if (tone === "overdue") return "지연";
  if (tone === "today") return "오늘";
  if (tone === "soon") return label.split(" · ")[1];
  return label;
}

export const DUE_TONE_CLASS: Record<DueTone, string> = {
  overdue: "bg-red-50 text-red-600",
  today: "bg-orange-50 text-orange-600",
  soon: "bg-amber-50 text-amber-700",
  later: "bg-gray-100 text-gray-600",
  none: "bg-gray-50 text-gray-400",
};

export function isOverdue(dueDate: string | null, status: string): boolean {
  return !!dueDate && status !== "done" && dueDate < todayKey();
}

export function weekEndKey(): string {
  return addDays(todayKey(), 6);
}
