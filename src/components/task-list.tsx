import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { toggleTaskDone } from "@/app/(app)/tasks/actions";
import type { TaskRow } from "@/lib/data";
import { DUE_TONE_CLASS, dueInfo } from "@/lib/task-utils";
import { cn } from "@/lib/utils";
import { NotifyAfterSubmit } from "./form-controls";
import { Dot, EmptyState } from "./ui";

/** 체크 가능한 태스크 목록 */
export function TaskList({
  tasks,
  emptyText = "남은 태스크가 없습니다 🎉",
  showAssignee = false,
}: {
  tasks: TaskRow[];
  emptyText?: string;
  showAssignee?: boolean;
}) {
  if (!tasks.length) return <EmptyState title={emptyText} />;
  return (
    <ul className="divide-y divide-gray-100">
      {tasks.map((t) => {
        const due = dueInfo(t.dueDate, t.status === "done");
        return (
          <li key={t.id} className="flex items-start gap-2.5 px-2 py-2">
            <form action={toggleTaskDone.bind(null, t.id)}>
              <NotifyAfterSubmit />
              <button type="submit" className="mt-0.5 text-gray-300 hover:text-emerald-500" aria-label={t.status === "done" ? "완료 취소" : "완료"}>
                {t.status === "done" ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" /> : <Circle className="h-4.5 w-4.5" />}
              </button>
            </form>
            <Link href={`/tasks?task=${t.id}`} className="min-w-0 flex-1">
              <span className={cn("block text-sm", t.status === "done" ? "text-gray-400 line-through" : "text-gray-900")}>{t.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
                <span className={cn("badge", DUE_TONE_CLASS[due.tone])}>{due.label}</span>
                {showAssignee && <span>{t.assigneeName ?? "미배정"}</span>}
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
