/** 표 셀 색 채우기 — 편집기·Word·PDF 공용 */

/** 색 채우기 팔레트 (연한 색: 글자가 잘 보이도록) */
export const CELL_COLORS: { label: string; value: string }[] = [
  { label: "노랑", value: "#fef9c3" },
  { label: "주황", value: "#ffedd5" },
  { label: "빨강", value: "#fee2e2" },
  { label: "분홍", value: "#fce7f3" },
  { label: "보라", value: "#ede9fe" },
  { label: "파랑", value: "#dbeafe" },
  { label: "하늘", value: "#e0f2fe" },
  { label: "초록", value: "#dcfce7" },
  { label: "회색", value: "#f3f4f6" },
  { label: "진한 노랑", value: "#fde047" },
  { label: "진한 주황", value: "#fdba74" },
  { label: "진한 빨강", value: "#fca5a5" },
  { label: "진한 분홍", value: "#f9a8d4" },
  { label: "진한 보라", value: "#c4b5fd" },
  { label: "진한 파랑", value: "#93c5fd" },
  { label: "진한 하늘", value: "#7dd3fc" },
  { label: "진한 초록", value: "#86efac" },
  { label: "진한 회색", value: "#d1d5db" },
];

/**
 * 색 값을 "#rrggbb" 로 정리. 붙여넣은 HTML 의 style 값 등 그 밖의 형식은 버림 (CSS 주입 방지)
 */
export function normalizeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  const hex = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
  if (hex) {
    const h = hex[1];
    return h.length === 3 ? `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}` : `#${h}`;
  }
  const rgb = v.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null; // 투명
    const parts = rgb.slice(1, 4).map(Number);
    if (parts.some((n) => n > 255)) return null;
    return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  return null;
}
