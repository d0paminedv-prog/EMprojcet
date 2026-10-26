import { readFile } from "node:fs/promises";
import path from "node:path";
import pdfmake from "pdfmake";
import { normalizeColor } from "./colors";
import { columnWidthsPx, type ImageLoader, type PMNode } from "./tiptap-docx";

/** Tiptap(ProseMirror) JSON → PDF (한글: Noto Sans KR, assets/fonts 의 OFL 글꼴) */

type Content = Record<string, unknown> | string;
type Mark = NonNullable<PMNode["marks"]>[number];

const FONT = "NotoSansKR";
const PAGE_WIDTH = 595.28; // A4 (pt)
const PAGE_HEIGHT = 841.89;
const MARGIN_X = 50;
const MARGIN_TOP = 50;
const MARGIN_BOTTOM = 56;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const CONTENT_HEIGHT = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM;
const PX_TO_PT = 0.75;
const GRID = "#d1d5db";

const BODY_SIZE = 10.5;
const LINE_HEIGHT = 1.35;
/** Noto Sans KR 한 줄 높이(글자 크기 배) — ascent 1.16 + descent 0.288 */
const FONT_LINE = 1.448;
/** 이미지 최대 높이 — 세로로 긴 캡처도 한 쪽 안에 (제목·문단 뒤에도 들어가도록 본문 높이보다 조금 작게) */
const MAX_IMAGE_HEIGHT = Math.round(CONTENT_HEIGHT * 0.8);
/** 목록·체크리스트 표시가 차지하는 너비 */
const LIST_INDENT = 18;
/** 표 선 두께 */
const TABLE_LINE = 0.5;
/** 열 하나의 최소 글 너비 */
const MIN_CELL_WIDTH = 14;
/** 행 하나가 이보다 낮다고 보이면 쪽 경계에서 행을 자르지 않음 (pdfmake 는 한 쪽보다 긴 「자르지 않는 행」의 나머지를 버리므로 넉넉히) */
const KEEP_ROW_HEIGHT = CONTENT_HEIGHT * 0.45;

let fontsReady: Promise<void> | null = null;

/** 글꼴은 처음 한 번만 읽어 pdfmake 가상 파일에 등록. 외부 주소·로컬 파일 접근은 막음 */
function ensureFonts(): Promise<void> {
  fontsReady ??= (async () => {
    const dir = path.join(process.cwd(), "assets", "fonts");
    const [regular, bold] = await Promise.all([readFile(path.join(dir, "NotoSansKR-Regular.ttf")), readFile(path.join(dir, "NotoSansKR-Bold.ttf"))]);
    pdfmake.virtualfs.writeFileSync("NotoSansKR-Regular.ttf", regular);
    pdfmake.virtualfs.writeFileSync("NotoSansKR-Bold.ttf", bold);
    // 한글 글꼴에는 기울임꼴이 없어 기본·굵게를 그대로 사용
    pdfmake.setFonts({
      [FONT]: { normal: "NotoSansKR-Regular.ttf", bold: "NotoSansKR-Bold.ttf", italics: "NotoSansKR-Regular.ttf", bolditalics: "NotoSansKR-Bold.ttf" },
    });
    pdfmake.setUrlAccessPolicy(() => false);
    pdfmake.setLocalAccessPolicy(() => false);
  })().catch((err) => {
    fontsReady = null;
    throw err;
  });
  return fontsReady;
}

const ALIGN: Record<string, string> = { left: "left", center: "center", right: "right", justify: "justify" };
const HEADING_SIZE: Record<number, number> = { 1: 18, 2: 14, 3: 12 };

/** 노드 안 글자 (줄바꿈 포함) */
function plainText(node: PMNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return "\n";
  return (node.content ?? []).map(plainText).join("");
}

/** 글자 너비 어림(글자 크기 배): 한글·한자 0.92, 영문 대문자 0.66, 공백 0.22, 그 밖 0.56 — 넉넉하게 */
function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    if ((code >= 0x1100 && code <= 0x11ff) || code >= 0x2e80) w += 0.92;
    else if (ch === " ") w += 0.22;
    else if (ch >= "A" && ch <= "Z") w += 0.66;
    else w += 0.56;
  }
  return w;
}

/** 한 줄에 들어가야 보기 좋은 짧은 낱말(숫자·영문 등)의 가장 긴 너비(글자 크기 배) — 한글은 글자 사이에서 줄을 바꿀 수 있어 뺌 */
function longestToken(text: string): number {
  let max = 0;
  for (const token of text.split(/[\s\u1100-\u11ff\u3000-\u9fff\uac00-\ud7af]+/)) {
    // 긴 링크처럼 아주 긴 낱말은 칸 안에서 나눠 쓰므로 글자 크기를 정하는 데 쓰지 않음
    if (token.length <= 16) max = Math.max(max, emWidth(token));
  }
  return max;
}

/** 이미지가 들어갈 크기 (가로 maxWidth, 세로 MAX_IMAGE_HEIGHT 안, 원본보다 키우지 않음) */
function imageBox(img: { width: number; height: number }, maxWidth: number): { width: number; height: number } {
  const w = img.width * PX_TO_PT;
  const h = img.height * PX_TO_PT;
  const scale = Math.min(1, maxWidth / w, MAX_IMAGE_HEIGHT / h);
  return { width: w * scale, height: h * scale };
}

type CellSpot = { node: PMNode; row: number; col: number; colSpan: number; rowSpan: number };

/** 표의 칸 배치 (합친 칸 자리 포함) */
function tableGrid(node: PMNode): { cells: CellSpot[]; rows: number; columns: number } {
  const cells: CellSpot[] = [];
  const occupied: boolean[][] = [];
  let columns = 0;
  const rows = node.content ?? [];
  for (const [r, row] of rows.entries()) {
    occupied[r] ??= [];
    let c = 0;
    for (const cell of row.content ?? []) {
      while (occupied[r][c]) c++;
      const colSpan = Math.max(1, Number(cell.attrs?.colspan ?? 1) || 1);
      const rowSpan = Math.max(1, Math.min(rows.length - r, Number(cell.attrs?.rowspan ?? 1) || 1));
      cells.push({ node: cell, row: r, col: c, colSpan, rowSpan });
      for (let dr = 0; dr < rowSpan; dr++) {
        occupied[r + dr] ??= [];
        for (let dc = 0; dc < colSpan; dc++) occupied[r + dr][c + dc] = true;
      }
      c += colSpan;
    }
    columns = Math.max(columns, occupied[r].length);
  }
  return { cells, rows: rows.length, columns };
}

type TableBox = { widths: number[]; padding: number; fontSize: number };

/**
 * 표 열 너비(글 너비, pt)를 정해진 너비 안에 맞춤 — 편집기처럼 고정 배치:
 * 편집기에서 조절한 열은 그 비율대로(넓으면 줄임), 조절하지 않은 표는 똑같이 나눔.
 * 열이 많아 좁으면 칸 여백과 글자 크기를 줄여 숫자·짧은 낱말이 한 줄에 들어가게 함
 */
function tableBox(node: PMNode, grid: ReturnType<typeof tableGrid>, width: number): TableBox {
  const n = grid.columns;
  const avgOuter = (width - (n + 1) * TABLE_LINE) / n;
  const padding = avgOuter < 48 ? 2 : avgOuter < 72 ? 3 : 4;
  const usable = width - (n + 1) * TABLE_LINE - n * padding * 2;

  const px = columnWidthsPx(node);
  let widths: number[];
  if (px && px.length === n) {
    const total = px.reduce((a, b) => a + b, 0) * PX_TO_PT;
    const scale = Math.min(1, (width - (n + 1) * TABLE_LINE) / total);
    widths = px.map((w) => w * PX_TO_PT * scale - padding * 2);
  } else {
    widths = Array(n).fill(usable / n);
  }
  // 너무 좁은 열은 최소 너비로 넓히고, 그 때문에 쪽보다 넓어지면 다른 열을 비율대로 줄임
  if (n * MIN_CELL_WIDTH >= usable) widths = Array(n).fill(usable / n);
  else if (widths.some((w) => w < MIN_CELL_WIDTH)) {
    const fixed = widths.map((w) => Math.max(w, MIN_CELL_WIDTH));
    const over = fixed.reduce((a, b) => a + b, 0) - usable;
    const room = fixed.reduce((sum, w) => sum + (w - MIN_CELL_WIDTH), 0);
    widths = over > 0 ? fixed.map((w) => w - ((w - MIN_CELL_WIDTH) / room) * over) : fixed;
  }

  // 각 열의 숫자·짧은 낱말이 한 줄에 들어가는 글자 크기 (10pt 에서 7pt 까지)
  let fontSize = 10;
  for (const cell of grid.cells) {
    if (cell.colSpan > 1) continue;
    const token = longestToken(plainText(cell.node)) * (cell.node.type === "tableHeader" ? 1.05 : 1);
    if (token > 0) fontSize = Math.min(fontSize, (widths[cell.col] - 1) / token);
  }
  return { widths, padding, fontSize: Math.max(7, Math.floor(fontSize * 2) / 2) };
}

/** 합친 칸까지 포함한 칸 안쪽 글 너비 */
function spanWidth(box: TableBox, col: number, span: number): number {
  let w = 0;
  for (let i = col; i < col + span; i++) w += box.widths[i] ?? 0;
  return w + (span - 1) * (box.padding * 2 + TABLE_LINE) - 1;
}

/** 블록 높이 어림(pt) — 행을 쪽 경계에서 자를지 정할 때만 씀. 넉넉하게(높게) */
function estimateHeight(node: PMNode, width: number, fontSize: number, loadSize: (src: string) => { width: number; height: number } | null): number {
  const lineOf = (size: number) => size * FONT_LINE * LINE_HEIGHT;
  const textHeight = (text: string, size: number) =>
    text.split("\n").reduce((sum, line) => sum + Math.max(1, Math.ceil((emWidth(line) * size) / Math.max(width, 1))) * lineOf(size), 0);
  switch (node.type) {
    case "paragraph":
      return textHeight(plainText(node), fontSize) + 2;
    case "heading": {
      const size = HEADING_SIZE[Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 3)] ?? 12;
      return textHeight(plainText(node), size) + 14;
    }
    case "image": {
      const size = loadSize(String(node.attrs?.src ?? ""));
      return size ? imageBox(size, width).height + 12 : lineOf(fontSize);
    }
    case "codeBlock":
      return textHeight(plainText(node), 9) + 12;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return (node.content ?? []).reduce((sum, item) => sum + estimateHeight(item, width - LIST_INDENT, fontSize, loadSize), 0);
    case "table": {
      const grid = tableGrid(node);
      const box = tableBox(node, grid, width);
      const rows = Array(grid.rows).fill(0);
      for (const cell of grid.cells) {
        const h = (cell.node.content ?? []).reduce((sum, b) => sum + estimateHeight(b, spanWidth(box, cell.col, cell.colSpan), box.fontSize, loadSize), 0);
        rows[cell.row] = Math.max(rows[cell.row], h / cell.rowSpan + 8);
      }
      return rows.reduce((a, b) => a + b, 0) + 10;
    }
    default:
      return (node.content ?? []).reduce((sum, child) => sum + estimateHeight(child, width, fontSize, loadSize), 0);
  }
}

type LoadedImage = NonNullable<Awaited<ReturnType<ImageLoader>>>;

class Converter {
  /** 이미지는 한 번만 읽음 (높이 어림·그리기 공용) */
  private images = new Map<string, LoadedImage | null>();

  constructor(private loadImage: ImageLoader) {}

  /** 문서 안 이미지를 미리 읽어 둠 */
  async preload(node: PMNode): Promise<void> {
    if (node.type === "image") {
      const src = String(node.attrs?.src ?? "");
      if (src && !this.images.has(src)) this.images.set(src, await this.loadImage(src));
    }
    for (const child of node.content ?? []) await this.preload(child);
  }

  private sizeOf = (src: string) => {
    const img = this.images.get(src);
    return img ? { width: img.width, height: img.height } : null;
  };

  private inline(nodes: PMNode[] | undefined, extra: Record<string, unknown> = {}): Content[] {
    const out: Content[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out.push("\n");
        continue;
      }
      if (n.type !== "text" || !n.text) continue;
      const marks = n.marks ?? [];
      const has = (t: string) => marks.some((m: Mark) => m.type === t);
      const href = marks.find((m: Mark) => m.type === "link")?.attrs?.href as string | undefined;
      const link = href && /^https?:\/\//.test(href) ? href : undefined;
      out.push({
        text: n.text,
        ...extra,
        ...(has("bold") ? { bold: true } : {}),
        ...(has("italic") ? { italics: true } : {}),
        ...(has("underline") || link ? { decoration: "underline" } : has("strike") ? { decoration: "lineThrough" } : {}),
        ...(has("highlight") ? { background: "#fef08a" } : {}),
        ...(has("code") ? { background: "#f3f4f6" } : {}),
        ...(link ? { link, color: "#4f46e5" } : {}),
      });
    }
    return out.length ? out : [" "];
  }

  private paragraph(node: PMNode, extra: Record<string, unknown> = {}): Content {
    const alignment = ALIGN[String(node.attrs?.textAlign ?? "")];
    return { text: this.inline(node.content), ...(alignment ? { alignment } : {}), ...extra };
  }

  /** width: 이 블록들이 쓸 수 있는 너비(pt) · inCell: 표 칸 안 (편집기처럼 문단 간격을 좁게) */
  private async blocks(nodes: PMNode[] | undefined, width: number, inCell = false): Promise<Content[]> {
    const out: Content[] = [];
    for (const n of nodes ?? []) out.push(...(await this.block(n, width, inCell)));
    return out;
  }

  private async listItems(node: PMNode, width: number, inCell: boolean): Promise<Content[]> {
    const items: Content[] = [];
    for (const item of node.content ?? []) {
      const parts = await this.blocks(item.content, width - LIST_INDENT, inCell);
      items.push(parts.length === 1 ? parts[0] : { stack: parts });
    }
    return items;
  }

  private async table(node: PMNode, width: number): Promise<Content> {
    const grid = tableGrid(node);
    if (!grid.rows || !grid.columns) return { text: " " };
    const box = tableBox(node, grid, width);

    // pdfmake 규칙: 모든 행에 열 수만큼 칸, 합친 칸 자리는 빈 칸
    const body: Content[][] = Array.from({ length: grid.rows }, () => Array.from({ length: grid.columns }, () => ({})));
    const rowHeights = Array(grid.rows).fill(0);
    for (const cell of grid.cells) {
      const inner = spanWidth(box, cell.col, cell.colSpan);
      const stack = await this.blocks(cell.node.content, inner, true);
      const color = normalizeColor(cell.node.attrs?.backgroundColor);
      body[cell.row][cell.col] = {
        stack: stack.length ? stack : [" "],
        ...(cell.colSpan > 1 ? { colSpan: cell.colSpan } : {}),
        ...(cell.rowSpan > 1 ? { rowSpan: cell.rowSpan } : {}),
        // 「셀 색 채우기」로 지정한 칸만 색 (기본은 투명)
        ...(color ? { fillColor: color } : {}),
        ...(cell.node.type === "tableHeader" ? { bold: true } : {}),
      };
      // 합친 칸은 첫 행에서 한꺼번에 그려지므로 첫 행 높이에 전부 셈
      const h = (cell.node.content ?? []).reduce((sum, b) => sum + estimateHeight(b, inner, box.fontSize, this.sizeOf), 0);
      rowHeights[cell.row] = Math.max(rowHeights[cell.row], h + 6);
    }
    // pdfmake 는 「자르지 않는 행」이 한 쪽보다 길면 넘친 내용을 버리므로, 모든 행이 넉넉히 한 쪽 안에 들어갈 때만 행을 지킴
    const fits = (h: number | undefined) => h !== undefined && h <= KEEP_ROW_HEIGHT;

    const rows = node.content ?? [];
    const headerRows = rows.length > 1 && rows[0]?.content?.every((cell) => cell.type === "tableHeader") && fits(rowHeights[0]) ? 1 : 0;
    const dontBreakRows = rowHeights.every(fits);
    // pdfmake: 행 지키기 + 머리글 붙이기를 세로 병합 칸과 함께 쓰면 첫 병합 묶음에 빈 줄이 생겨 그때는 머리글 붙이기를 뺌
    const keepHeader = headerRows > 0 && fits(rowHeights[1]) && !(dontBreakRows && grid.cells.some((c) => c.rowSpan > 1));
    return {
      table: {
        // 머리글 행은 쪽마다 반복
        headerRows,
        // 머리글 행만 쪽 끝에 홀로 남지 않게 (다음 행도 짧을 때만)
        ...(keepHeader ? { keepWithHeaderRows: 1 } : {}),
        // 쪽 경계에서 행을 반으로 자르지 않고 다음 쪽으로 넘김
        dontBreakRows,
        widths: box.widths,
        body,
      },
      fontSize: box.fontSize,
      layout: {
        hLineColor: () => GRID,
        vLineColor: () => GRID,
        hLineWidth: () => TABLE_LINE,
        vLineWidth: () => TABLE_LINE,
        paddingLeft: () => box.padding,
        paddingRight: () => box.padding,
        paddingTop: () => 3,
        paddingBottom: () => 3,
      },
      margin: [0, 2, 0, 8],
    };
  }

  async block(node: PMNode, width = CONTENT_WIDTH, inCell = false): Promise<Content[]> {
    switch (node.type) {
      case "paragraph":
        return [this.paragraph(node, { margin: inCell ? [0, 0, 0, 2] : [0, 0, 0, 5] })];
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 3);
        return [this.paragraph(node, { style: `h${level}` })];
      }
      case "bulletList":
        return [{ ul: await this.listItems(node, width, inCell), margin: [0, 0, 0, 5] }];
      case "orderedList":
        return [{ ol: await this.listItems(node, width, inCell), start: Number(node.attrs?.start ?? 1) || 1, margin: [0, 0, 0, 5] }];
      case "taskList": {
        const rows: Content[] = [];
        for (const item of node.content ?? []) {
          rows.push({ columns: [{ width: 14, text: item.attrs?.checked ? "■" : "□" }, { width: "*", stack: await this.blocks(item.content, width - LIST_INDENT, inCell) }], columnGap: 2 });
        }
        return [{ stack: rows, margin: [0, 0, 0, 5] }];
      }
      case "blockquote":
        return [
          {
            table: { widths: ["*"], body: [[{ stack: await this.blocks(node.content, width - 18, inCell), color: "#374151" }]] },
            layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => "#c7d2fe", paddingLeft: () => 10, paddingRight: () => 4 },
            margin: [0, 2, 0, 8],
          },
        ];
      case "codeBlock":
        return [
          {
            table: { widths: ["*"], body: [[{ text: (node.content ?? []).map((c) => c.text ?? "").join("") || " ", fontSize: 9, preserveLeadingSpaces: true }]] },
            layout: { hLineWidth: () => 0, vLineWidth: () => 0, fillColor: () => "#f3f4f6", paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 6, paddingBottom: () => 6 },
            margin: [0, 2, 0, 8],
          },
        ];
      case "horizontalRule":
        return [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: width, y2: 0, lineWidth: 0.5, lineColor: GRID }], margin: [0, 6, 0, 10] }];
      case "image": {
        const src = String(node.attrs?.src ?? "");
        if (src && !this.images.has(src)) this.images.set(src, await this.loadImage(src));
        const img = src ? this.images.get(src) : null;
        // PDF 에는 PNG·JPG 만 넣을 수 있어 그 외(GIF 등)는 표시만 남김
        if (!img || (img.type !== "png" && img.type !== "jpg")) return [{ text: `[이미지${node.attrs?.alt ? `: ${node.attrs.alt}` : ""}]`, color: "#9ca3af", margin: [0, 0, 0, 5] }];
        const mime = img.type === "png" ? "image/png" : "image/jpeg";
        // 쓸 수 있는 너비(표 칸이면 칸 너비)와 쪽 높이 안에 들어가게 — 편집기의 max-width: 100% 와 같음
        const fit = imageBox(img, width);
        return [{ image: `data:${mime};base64,${img.data.toString("base64")}`, width: fit.width, height: fit.height, alignment: "center", margin: inCell ? [0, 2, 0, 4] : [0, 4, 0, 8] }];
      }
      case "table":
        return [await this.table(node, width)];
      default:
        return node.content ? this.blocks(node.content, width, inCell) : [];
    }
  }
}

/** 「최종본 · 2026. 10. 20. 14:32 기준」 (한국 시간) */
function finalStamp(at: Date): string {
  const time = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  return `최종본 · ${time} 기준`;
}

export async function tiptapToPdf(doc: PMNode | null, title: string, loadImage: ImageLoader, opts: { finalAt?: Date } = {}): Promise<Buffer> {
  await ensureFonts();
  const converter = new Converter(loadImage);
  if (doc) await converter.preload(doc);
  const content: Content[] = [];
  for (const n of doc?.content ?? []) content.push(...(await converter.block(n)));
  if (!content.length) content.push({ text: title, style: "h1" });

  return pdfmake
    .createPdf({
      info: { title, creator: "BX Hub", producer: "BX Hub" },
      pageSize: "A4",
      pageMargins: [MARGIN_X, MARGIN_TOP, MARGIN_X, MARGIN_BOTTOM],
      content,
      // 바닥글: 어느 시점의 최종본인지 + 쪽 번호
      footer: (current: number, total: number) => ({
        columns: [
          { text: finalStamp(opts.finalAt ?? new Date()), alignment: "left" },
          { text: `${current} / ${total}`, alignment: "right", width: 60 },
        ],
        fontSize: 8,
        color: "#9ca3af",
        margin: [MARGIN_X, 20, MARGIN_X, 0],
      }),
      defaultStyle: { font: FONT, fontSize: BODY_SIZE, lineHeight: LINE_HEIGHT, color: "#111827" },
      styles: {
        h1: { fontSize: HEADING_SIZE[1], bold: true, margin: [0, 10, 0, 6] },
        h2: { fontSize: HEADING_SIZE[2], bold: true, color: "#1f2937", margin: [0, 10, 0, 4] },
        h3: { fontSize: HEADING_SIZE[3], bold: true, color: "#374151", margin: [0, 8, 0, 3] },
      },
    })
    .getBuffer();
}
