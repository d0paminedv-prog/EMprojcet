import { FileText, Link2, PenLine } from "lucide-react";
import { cn, fileExtension } from "@/lib/utils";
import { FigmaLogo } from "./figma-logo";

export function DocIcon({ kind, fileName }: { kind: string; fileName?: string | null }) {
  if (kind === "figma") return <FigmaLogo />;
  if (kind === "live") return <PenLine className="h-4 w-4 text-brand-600" />;
  if (kind === "link") return <Link2 className="h-4 w-4 text-sky-500" />;
  const ext = fileName ? fileExtension(fileName) : "";
  const color =
    ext === "docx" || ext === "doc"
      ? "text-blue-600"
      : ext === "pdf"
        ? "text-red-500"
        : ext === "pptx" || ext === "ppt"
          ? "text-orange-500"
          : ext === "xlsx" || ext === "xls" || ext === "csv"
            ? "text-emerald-600"
            : "text-gray-500";
  return <FileText className={cn("h-4 w-4", color)} />;
}
