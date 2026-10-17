export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fileExtension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function lines(value: string): string[] {
  return value
    .split("\n")
    .map((l) => l.replace(/^\s*[-*•·]\s*/, "").trim())
    .filter(Boolean);
}

export function isUuid(value: string | null | undefined): value is string {
  return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

/** Figma 공유 URL 여부 */
export function isFigmaUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && (u.hostname === "figma.com" || u.hostname.endsWith(".figma.com"));
  } catch {
    return false;
  }
}

/** Figma 임베드 URL (디자인, 프로토타입, FigJam, Slides 모두 지원) */
export function figmaEmbedUrl(value: string): string {
  return `https://www.figma.com/embed?embed_host=share&url=${encodeURIComponent(value)}`;
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type ActionState = { ok?: boolean; error?: string; message?: string } | undefined;
