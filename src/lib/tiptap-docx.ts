import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from "docx";
import { normalizeColor } from "./colors";

/** Tiptap(ProseMirror) JSON → Word(.docx) 변환 */

type Mark = { type: string; attrs?: Record<string, unknown> };
export type PMNode = { type: string; attrs?: Record<string, unknown>; content?: PMNode[]; text?: string; marks?: Mark[] };
type ImageData = { data: Buffer; type: "png" | "jpg" | "gif" | "bmp"; width: number; height: number };
export type ImageLoader = (src: string) => Promise<ImageData | null>;

const FONT = { ascii: "Malgun Gothic", hAnsi: "Malgun Gothic", eastAsia: "맑은 고딕", cs: "Malgun Gothic" };
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "BFC5CE" };
const MAX_IMAGE_WIDTH = 600;
/** A4 본문 너비 (twip = 1/20pt, 1px ≈ 15twip) */
const CONTENT_WIDTH_TWIPS = 11906 - 1100 * 2;

/** 셀 배경색 (색 채우기 > 머리글 기본 회색). Word 는 # 없는 대문자 16진수 */
function cellFill(cell: PMNode, header: boolean): string | null {
  const color = normalizeColor(cell.attrs?.backgroundColor) ?? (header ? "#f3f4f6" : null);
  return color ? color.slice(1).toUpperCase() : null;
}

/** 편집기 페이지의 표 너비(px) — 너비를 지정하지 않은 열이 나눠 갖는 기준 */
const EDITOR_TABLE_WIDTH = 724;

/**
 * 편집기에서 조절한 표 열 너비(px). 조절한 열이 하나도 없으면 null (페이지 너비에 균등 분배).
 * 일부만 조절했으면 나머지 열은 편집기 화면처럼 남은 너비를 똑같이 나눠 가짐.
 */
export function columnWidthsPx(table: PMNode): number[] | null {
  const firstRow = table.content?.[0];
  if (!firstRow?.content?.length) return null;
  const widths: (number | null)[] = [];
  for (const cell of firstRow.content) {
    const span = Number(cell.attrs?.colspan ?? 1) || 1;
    const colwidth = Array.isArray(cell.attrs?.colwidth) ? (cell.attrs.colwidth as unknown[]) : [];
    for (let i = 0; i < span; i++) {
      const w = Number(colwidth[i]);
      widths.push(Number.isFinite(w) && w > 0 ? w : null);
    }
  }
  if (widths.every((w) => w === null)) return null;
  const known = widths.reduce<number>((sum, w) => sum + (w ?? 0), 0);
  const unknown = widths.filter((w) => w === null).length;
  const fill = unknown ? Math.max(48, (EDITOR_TABLE_WIDTH - known) / unknown) : 0;
  return widths.map((w) => w ?? fill);
}

const HEADINGS = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
} as const;

const ALIGN: Record<string, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
};

/** 이미지 크기 읽기 (PNG / JPEG / GIF) */
export function imageSize(buf: Buffer): { width: number; height: number; type: ImageData["type"] } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  if (buf.length > 10 && buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8), type: "gif" };
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: "jpg" };
      }
      i += 2 + len;
    }
  }
  return null;
}

class Converter {
  private orderedInstance = 0;
  constructor(private loadImage: ImageLoader) {}

  private runs(nodes: PMNode[] | undefined, extra: { bold?: boolean } = {}): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    for (const n of nodes ?? []) {
      if (n.type === "hardBreak") {
        out.push(new TextRun({ text: "", break: 1 }));
        continue;
      }
      if (n.type !== "text" || !n.text) continue;
      const marks = n.marks ?? [];
      const has = (t: string) => marks.some((m) => m.type === t);
      const link = marks.find((m) => m.type === "link")?.attrs?.href as string | undefined;
      const run = new TextRun({
        text: n.text,
        bold: has("bold") || extra.bold,
        italics: has("italic"),
        underline: has("underline") || link ? {} : undefined,
        strike: has("strike"),
        highlight: has("highlight") ? "yellow" : undefined,
        color: link ? "4F46E5" : undefined,
        font: has("code") ? "Consolas" : undefined,
      });
      if (link && /^https?:\/\//.test(link)) out.push(new ExternalHyperlink({ link, children: [run] }));
      else out.push(run);
    }
    return out;
  }

  private async imageParagraph(node: PMNode): Promise<Paragraph> {
    const src = String(node.attrs?.src ?? "");
    const img = src ? await this.loadImage(src) : null;
    if (!img) return new Paragraph({ children: [new TextRun({ text: `[이미지${node.attrs?.alt ? `: ${node.attrs.alt}` : ""}]`, color: "9CA3AF" })] });
    const scale = img.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / img.width : 1;
    return new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new ImageRun({ type: img.type, data: img.data, transformation: { width: Math.round(img.width * scale), height: Math.round(img.height * scale) } })],
    });
  }

  private async list(node: PMNode, level: number, ordered: boolean, instance: number): Promise<(Paragraph | Table)[]> {
    const out: (Paragraph | Table)[] = [];
    for (const item of node.content ?? []) {
      const isTask = item.type === "taskItem";
      let first = true;
      for (const child of item.content ?? []) {
        if (child.type === "bulletList" || child.type === "orderedList" || child.type === "taskList") {
          const childOrdered = child.type === "orderedList";
          out.push(...(await this.list(child, Math.min(level + 1, 8), childOrdered, childOrdered ? ++this.orderedInstance : instance)));
          continue;
        }
        if (child.type !== "paragraph" && child.type !== "heading") {
          out.push(...(await this.block(child)));
          continue;
        }
        const prefix = isTask && first ? [new TextRun({ text: item.attrs?.checked ? "☑ " : "☐ " })] : [];
        out.push(
          new Paragraph({
            children: [...prefix, ...this.runs(child.content)],
            ...(first
              ? isTask
                ? { indent: { left: 360 * (level + 1) } }
                : ordered
                  ? { numbering: { reference: "bx-ordered", level, instance } }
                  : { bullet: { level } }
              : { indent: { left: 720 * (level + 1) } }),
          }),
        );
        first = false;
      }
    }
    return out;
  }

  private async table(node: PMNode): Promise<Table> {
    const rows: TableRow[] = [];
    for (const row of node.content ?? []) {
      const cells: TableCell[] = [];
      for (const cell of row.content ?? []) {
        const header = cell.type === "tableHeader";
        const children: (Paragraph | Table)[] = [];
        for (const c of cell.content ?? []) {
          if (c.type === "paragraph") children.push(new Paragraph({ children: this.runs(c.content, { bold: header }) }));
          else children.push(...(await this.block(c)));
        }
        cells.push(
          new TableCell({
            children: children.length ? children : [new Paragraph("")],
            columnSpan: Number(cell.attrs?.colspan ?? 1) || 1,
            rowSpan: Number(cell.attrs?.rowspan ?? 1) || 1,
            shading: cellFill(cell, header) ? { type: ShadingType.CLEAR, color: "auto", fill: cellFill(cell, header)! } : undefined,
            margins: { top: 60, bottom: 60, left: 100, right: 100 },
            borders: { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER },
          }),
        );
      }
      if (cells.length) rows.push(new TableRow({ children: cells }));
    }
    const body = rows.length ? rows : [new TableRow({ children: [new TableCell({ children: [new Paragraph("")] })] })];
    const px = columnWidthsPx(node);
    if (!px) return new Table({ rows: body, width: { size: 100, type: WidthType.PERCENTAGE } });
    // 조절한 열 너비 유지 (페이지보다 넓으면 비율대로 줄임)
    const total = px.reduce((a, b) => a + b, 0) * 15;
    const scale = total > CONTENT_WIDTH_TWIPS ? CONTENT_WIDTH_TWIPS / total : 1;
    const columnWidths = px.map((w) => Math.round(w * 15 * scale));
    return new Table({
      rows: body,
      columnWidths,
      layout: TableLayoutType.FIXED,
      width: { size: columnWidths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    });
  }

  async block(node: PMNode): Promise<(Paragraph | Table)[]> {
    const align = ALIGN[String(node.attrs?.textAlign ?? "")];
    switch (node.type) {
      case "paragraph":
        return [new Paragraph({ children: this.runs(node.content), alignment: align })];
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 6) as keyof typeof HEADINGS;
        return [new Paragraph({ children: this.runs(node.content), heading: HEADINGS[level], alignment: align })];
      }
      case "bulletList":
      case "taskList":
        return this.list(node, 0, false, 0);
      case "orderedList":
        return this.list(node, 0, true, ++this.orderedInstance);
      case "blockquote": {
        const out: (Paragraph | Table)[] = [];
        for (const c of node.content ?? []) {
          if (c.type === "paragraph") {
            out.push(
              new Paragraph({
                children: this.runs(c.content),
                indent: { left: 480 },
                border: { left: { style: BorderStyle.SINGLE, size: 12, color: "C7D2FE", space: 8 } },
              }),
            );
          } else out.push(...(await this.block(c)));
        }
        return out;
      }
      case "horizontalRule":
        return [new Paragraph({ children: [], border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB", space: 1 } } })];
      case "codeBlock":
        return [new Paragraph({ children: [new TextRun({ text: (node.content ?? []).map((c) => c.text ?? "").join(""), font: "Consolas" })], shading: { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } })];
      case "image":
        return [await this.imageParagraph(node)];
      case "table":
        return [await this.table(node), new Paragraph("")];
      default:
        return node.content ? (await Promise.all(node.content.map((c) => this.block(c)))).flat() : [];
    }
  }
}

export async function tiptapToDocx(doc: PMNode | null, title: string, loadImage: ImageLoader): Promise<Buffer> {
  const converter = new Converter(loadImage);
  const body = doc?.content?.length ? (await Promise.all(doc.content.map((n) => converter.block(n)))).flat() : [new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 })];

  const document = new Document({
    creator: "BX Hub",
    title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 300, after: 80 } } },
        heading1: { run: { font: FONT, size: 34, bold: true, color: "111827" }, paragraph: { spacing: { before: 240, after: 120 } } },
        heading2: { run: { font: FONT, size: 28, bold: true, color: "1F2937" }, paragraph: { spacing: { before: 240, after: 100 } } },
        heading3: { run: { font: FONT, size: 24, bold: true, color: "374151" }, paragraph: { spacing: { before: 200, after: 80 } } },
      },
    },
    numbering: {
      config: [
        {
          reference: "bx-ordered",
          levels: Array.from({ length: 9 }, (_, level) => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN][level % 3],
            text: `%${level + 1}.`,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 } } }, children: body }],
  });
  return Packer.toBuffer(document);
}
