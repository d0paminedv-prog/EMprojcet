import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { toggleEventDone } from "@/app/(app)/schedule/actions";
import type { EventRow } from "@/lib/data";
import { dDay, toDateKey } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Dot, EmptyState } from "./ui";

/** 체크 가능한 할 일 목록 (액션 아이템 등) */
export function TaskList({ tasks, emptyText = "남은 할 일이 없습니다 🎉" }: { tasks: EventRow[]; emptyText?: string }) {
  if (!tasks.length) return <EmptyState title={emptyText} />;
  return (
    <ul className="divide-y divide-gray-100">
      {tasks.map((t) => {
        const key = toDateKey(t.startAt);
        const overdue = !t.done && key < toDateKey(new Date());
        return (
          <li key={t.id} className="flex items-start gap-2.5 px-2 py-2">
            <form action={toggleEventDone.bind(null, t.id)}>
              <button type="submit" className="mt-0.5 text-gray-300 hover:text-emerald-500" aria-label={t.done ? "완료 취소" : "완료"}>
                {t.done ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" /> : <Circle className="h-4.5 w-4.5" />}
              </button>
            </form>
            <Link href={`/schedule?month=${key.slice(0, 7)}&event=${t.id}`} className="min-w-0 flex-1">
              <span className={cn("block text-sm", t.done ? "text-gray-400 line-through" : "text-gray-900")}>{t.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                <span className={cn(overdue && "font-semibold text-red-500")}>
                  {key.slice(5).replace("-", "/")} 까지 · {dDay(key)}
                </span>
                {t.projectName && (
                  <span className="inline-flex items-center gap-1">
                    <Dot color={t.projectColor ?? "#6b7280"} />
                    {t.projectName}
                  </span>
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
