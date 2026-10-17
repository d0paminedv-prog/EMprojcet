export type Option = { value: string; label: string; color?: string };

export const PROJECT_CATEGORIES: Option[] = [
  { value: "popup", label: "팝업스토어" },
  { value: "sampling", label: "샘플링·시음/시식" },
  { value: "reviewer", label: "체험단·리뷰어" },
  { value: "event", label: "오프라인 행사" },
  { value: "exhibition", label: "전시·박람회" },
  { value: "influencer", label: "인플루언서 협업" },
  { value: "online", label: "온라인 캠페인" },
  { value: "etc", label: "기타" },
];

export const PROJECT_STATUSES: Option[] = [
  { value: "planning", label: "기획", color: "#8b5cf6" },
  { value: "preparing", label: "준비", color: "#f59e0b" },
  { value: "live", label: "진행 중", color: "#10b981" },
  { value: "wrapup", label: "결과 정리", color: "#3b82f6" },
  { value: "done", label: "완료", color: "#6b7280" },
];

export const DOC_CATEGORIES: Option[] = [
  { value: "proposal", label: "기획서·제안서" },
  { value: "design", label: "디자인" },
  { value: "contract", label: "견적·계약" },
  { value: "operation", label: "운영 매뉴얼" },
  { value: "minutes", label: "회의록" },
  { value: "report", label: "결과 보고" },
  { value: "reference", label: "레퍼런스" },
  { value: "etc", label: "기타" },
];

export const DOC_KINDS: Option[] = [
  { value: "live", label: "실시간 문서" },
  { value: "file", label: "파일" },
  { value: "figma", label: "Figma" },
  { value: "link", label: "링크" },
];

export const EVENT_TYPES: Option[] = [
  { value: "meeting", label: "회의", color: "#6366f1" },
  { value: "deadline", label: "마감", color: "#ef4444" },
  { value: "event", label: "행사·운영", color: "#10b981" },
  { value: "shooting", label: "촬영", color: "#ec4899" },
  { value: "install", label: "설치·철수", color: "#f59e0b" },
  { value: "etc", label: "기타", color: "#6b7280" },
];

export const TASK_STATUSES: Option[] = [
  { value: "todo", label: "할 일", color: "#6b7280" },
  { value: "doing", label: "진행 중", color: "#3b82f6" },
  { value: "review", label: "검토", color: "#f59e0b" },
  { value: "done", label: "완료", color: "#10b981" },
];

export const TASK_PRIORITIES: Option[] = [
  { value: "high", label: "높음", color: "#ef4444" },
  { value: "normal", label: "보통", color: "#6b7280" },
  { value: "low", label: "낮음", color: "#9ca3af" },
];

export const PALETTE = [
  "#6366f1",
  "#ec4899",
  "#10b981",
  "#f59e0b",
  "#0ea5e9",
  "#8b5cf6",
  "#ef4444",
  "#14b8a6",
];

export function optionLabel(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}

export function optionColor(options: Option[], value: string | null | undefined): string {
  return options.find((o) => o.value === value)?.color ?? "#6b7280";
}

export const ALLOWED_UPLOAD_EXTENSIONS = [
  "doc",
  "docx",
  "hwp",
  "hwpx",
  "pdf",
  "ppt",
  "pptx",
  "key",
  "xls",
  "xlsx",
  "csv",
  "txt",
  "md",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "ai",
  "psd",
  "fig",
  "zip",
  "mp4",
  "mov",
];

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // 100MB
