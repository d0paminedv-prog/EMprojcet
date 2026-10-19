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
const MARGIN_X = 50;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;
const PX_TO_PT = 0.75;
const GRID = "#d1d5db";

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

class Converter {
  constructor(private loadImage: ImageLoader) {}

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

  private async blocks(nodes: PMNode[] | undefined): Promise<Content[]> {
    const out: Content[] = [];
    for (const n of nodes ?? []) out.push(...(await this.block(n)));
    return out;
  }

  private async listItems(node: PMNode): Promise<Content[]> {
    const items: Content[] = [];
    for (const item of node.content ?? []) {
      const parts = await this.blocks(item.content);
      items.push(parts.length === 1 ? parts[0] : { stack: parts });
    }
    return items;
  }

  private async table(node: PMNode): Promise<Content> {
    const rows = node.content ?? [];
    const body: Content[][] = [];
    const occupied: boolean[][] = [];
    let columns = 0;
    for (const [r, row] of rows.entries()) {
      const line: Content[] = [];
      occupied[r] ??= [];
      let c = 0;
      for (const cell of row.content ?? []) {
        // 위 행에서 세로로 합쳐진 칸 자리는 빈 칸으로 채움 (pdfmake 규칙)
        while (occupied[r][c]) {
          line.push({});
          c++;
        }
        const colSpan = Math.max(1, Number(cell.attrs?.colspan ?? 1) || 1);
        const rowSpan = Math.max(1, Number(cell.attrs?.rowspan ?? 1) || 1);
        const header = cell.type === "tableHeader";
        const stack = await this.blocks(cell.content);
        line.push({
          stack: stack.length ? stack : [" "],
          ...(colSpan > 1 ? { colSpan } : {}),
          ...(rowSpan > 1 ? { rowSpan } : {}),
          // 색 채우기 > 머리글 기본 회색
          ...(normalizeColor(cell.attrs?.backgroundColor) || header ? { fillColor: normalizeColor(cell.attrs?.backgroundColor) ?? "#f3f4f6" } : {}),
          ...(header ? { bold: true } : {}),
        });
        for (let dr = 0; dr < rowSpan; dr++) {
          occupied[r + dr] ??= [];
          for (let dc = 0; dc < colSpan; dc++) occupied[r + dr][c + dc] = true;
        }
        for (let i = 1; i < colSpan; i++) line.push({});
        c += colSpan;
      }
      while (occupied[r][c]) {
        line.push({});
        c++;
      }
      columns = Math.max(columns, line.length);
      body.push(line);
    }
    if (!body.length || !columns) return { text: " " };
    for (const line of body) while (line.length < columns) line.push({});

    // 편집기에서 조절한 열 너비 유지 (페이지보다 넓으면 비율대로 줄임)
    const px = columnWidthsPx(node);
    let widths: (number | string)[] = Array(columns).fill("*");
    if (px && px.length === columns) {
      const total = px.reduce((a, b) => a + b, 0) * PX_TO_PT;
      const scale = total > CONTENT_WIDTH ? CONTENT_WIDTH / total : 1;
      widths = px.map((w) => Math.max(20, w * PX_TO_PT * scale - 8));
    }
    const headerRows = rows[0]?.content?.every((cell) => cell.type === "tableHeader") ? 1 : 0;
    return {
      table: { headerRows, widths, body },
      layout: { hLineColor: () => GRID, vLineColor: () => GRID, hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 2, 0, 8],
    };
  }

  async block(node: PMNode): Promise<Content[]> {
    switch (node.type) {
      case "paragraph":
        return [this.paragraph(node, { margin: [0, 0, 0, 5] })];
      case "heading": {
        const level = Math.min(Math.max(Number(node.attrs?.level ?? 1), 1), 3);
        return [this.paragraph(node, { style: `h${level}` })];
      }
      case "bulletList":
        return [{ ul: await this.listItems(node), margin: [0, 0, 0, 5] }];
      case "orderedList":
        return [{ ol: await this.listItems(node), start: Number(node.attrs?.start ?? 1) || 1, margin: [0, 0, 0, 5] }];
      case "taskList": {
        const rows: Content[] = [];
        for (const item of node.content ?? []) {
          rows.push({ columns: [{ width: 14, text: item.attrs?.checked ? "■" : "□" }, { width: "*", stack: await this.blocks(item.content) }], columnGap: 2 });
        }
        return [{ stack: rows, margin: [0, 0, 0, 5] }];
      }
      case "blockquote":
        return [
          {
            table: { widths: ["*"], body: [[{ stack: await this.blocks(node.content), color: "#374151" }]] },
            layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => "#c7d2fe", paddingLeft: () => 10 },
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
        return [{ canvas: [{ type: "line", x1: 0, y1: 0, x2: CONTENT_WIDTH, y2: 0, lineWidth: 0.5, lineColor: GRID }], margin: [0, 6, 0, 10] }];
      case "image": {
        const src = String(node.attrs?.src ?? "");
        const img = src ? await this.loadImage(src) : null;
        // PDF 에는 PNG·JPG 만 넣을 수 있어 그 외(GIF 등)는 표시만 남김
        if (!img || (img.type !== "png" && img.type !== "jpg")) return [{ text: `[이미지${node.attrs?.alt ? `: ${node.attrs.alt}` : ""}]`, color: "#9ca3af", margin: [0, 0, 0, 5] }];
        const mime = img.type === "png" ? "image/png" : "image/jpeg";
        return [{ image: `data:${mime};base64,${img.data.toString("base64")}`, width: Math.min(img.width * PX_TO_PT, CONTENT_WIDTH), alignment: "center", margin: [0, 4, 0, 8] }];
      }
      case "table":
        return [await this.table(node)];
      default:
        return node.content ? this.blocks(node.content) : [];
    }
  }
}

export async function tiptapToPdf(doc: PMNode | null, title: string, loadImage: ImageLoader): Promise<Buffer> {
  await ensureFonts();
  const converter = new Converter(loadImage);
  const content: Content[] = [];
  for (const n of doc?.content ?? []) content.push(...(await converter.block(n)));
  if (!content.length) content.push({ text: title, style: "h1" });

  return pdfmake
    .createPdf({
      info: { title, creator: "BX Hub", producer: "BX Hub" },
      pageSize: "A4",
      pageMargins: [MARGIN_X, 50, MARGIN_X, 56],
      content,
      footer: (current: number, total: number) => ({ text: `${current} / ${total}`, alignment: "center", fontSize: 8, color: "#9ca3af", margin: [0, 20, 0, 0] }),
      defaultStyle: { font: FONT, fontSize: 10.5, lineHeight: 1.35, color: "#111827" },
      styles: {
        h1: { fontSize: 18, bold: true, margin: [0, 10, 0, 6] },
        h2: { fontSize: 14, bold: true, color: "#1f2937", margin: [0, 10, 0, 4] },
        h3: { fontSize: 12, bold: true, color: "#374151", margin: [0, 8, 0, 3] },
      },
    })
    .getBuffer();
}
