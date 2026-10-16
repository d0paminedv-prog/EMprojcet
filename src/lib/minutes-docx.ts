import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { Minutes } from "@/db/schema";
import { formatDate } from "./dates";

const FONT = { ascii: "Malgun Gothic", hAnsi: "Malgun Gothic", eastAsia: "맑은 고딕", cs: "Malgun Gothic" };
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D1D5DB" };
const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function heading(text: string) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 320, after: 120 } });
}

function bullet(text: string, level = 0) {
  return new Paragraph({ text, bullet: { level }, spacing: { after: 60 } });
}

function bullets(items: string[], empty = "해당 없음") {
  return items.length ? items.map((i) => bullet(i)) : [new Paragraph({ children: [new TextRun({ text: empty, color: "9CA3AF" })] })];
}

function cell(text: string, opts: { header?: boolean; width?: number } = {}) {
  return new TableCell({
    borders: CELL_BORDERS,
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.header ? { type: ShadingType.CLEAR, color: "auto", fill: "F3F4F6" } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: opts.header })] })],
  });
}

export type MinutesDocMeta = {
  meetingDate: string;
  projectName?: string | null;
  attendees: string[];
  author?: string | null;
};

export async function buildMinutesDocx(minutes: Minutes, meta: MinutesDocMeta): Promise<Buffer> {
  const infoRows: [string, string][] = [
    ["프로젝트", meta.projectName || "-"],
    ["회의 일자", formatDate(meta.meetingDate)],
    ["참석자", meta.attendees.join(", ") || "-"],
    ["작성자", meta.author || "-"],
  ];

  const infoTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: infoRows.map(
      ([k, v]) => new TableRow({ children: [cell(k, { header: true, width: 20 }), cell(v, { width: 80 })] }),
    ),
  });

  const actionTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [
          cell("No", { header: true, width: 8 }),
          cell("할 일", { header: true, width: 57 }),
          cell("담당자", { header: true, width: 17 }),
          cell("기한", { header: true, width: 18 }),
        ],
      }),
      ...minutes.actionItems.map(
        (a, i) =>
          new TableRow({
            children: [cell(String(i + 1)), cell(a.task), cell(a.owner || "-"), cell(a.dueDate || "-")],
          }),
      ),
    ],
  });

  const discussionParagraphs = minutes.discussions.length
    ? minutes.discussions.flatMap((d) => [
        new Paragraph({ children: [new TextRun({ text: d.topic, bold: true })], spacing: { before: 160, after: 80 } }),
        ...d.points.map((p) => bullet(p)),
      ])
    : bullets([]);

  const doc = new Document({
    creator: "Brand Experience Hub",
    title: minutes.title,
    styles: {
      default: {
        document: { run: { font: FONT, size: 21 }, paragraph: { spacing: { line: 300 } } },
        heading1: { run: { font: FONT, size: 36, bold: true, color: "111827" } },
        heading2: { run: { font: FONT, size: 26, bold: true, color: "312E81" } },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1200, bottom: 1200, left: 1100, right: 1100 } } },
        children: [
          new Paragraph({
            children: [new TextRun({ text: "회 의 록", size: 22, color: "6B7280" })],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: minutes.title,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.CENTER,
            spacing: { after: 240 },
          }),
          infoTable,
          heading("1. 회의 요약"),
          new Paragraph({ text: minutes.summary || "-" }),
          heading("2. 안건"),
          ...bullets(minutes.agenda),
          heading("3. 주요 논의 내용"),
          ...discussionParagraphs,
          heading("4. 결정 사항"),
          ...bullets(minutes.decisions),
          heading("5. 액션 아이템"),
          minutes.actionItems.length ? actionTable : bullets([])[0],
          heading("6. 미결·확인 필요 사항"),
          ...bullets(minutes.openIssues),
          heading("7. 다음 회의"),
          new Paragraph({ text: minutes.nextMeeting || "미정" }),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}

export function minutesToMarkdown(minutes: Minutes, meta: MinutesDocMeta): string {
  const list = (items: string[]) => (items.length ? items.map((i) => `- ${i}`).join("\n") : "- 해당 없음");
  return [
    `# ${minutes.title}`,
    "",
    `- 프로젝트: ${meta.projectName || "-"}`,
    `- 회의 일자: ${formatDate(meta.meetingDate)}`,
    `- 참석자: ${meta.attendees.join(", ") || "-"}`,
    "",
    "## 1. 회의 요약",
    minutes.summary || "-",
    "",
    "## 2. 안건",
    list(minutes.agenda),
    "",
    "## 3. 주요 논의 내용",
    ...(minutes.discussions.length
      ? minutes.discussions.flatMap((d) => [`### ${d.topic}`, list(d.points), ""])
      : ["- 해당 없음", ""]),
    "## 4. 결정 사항",
    list(minutes.decisions),
    "",
    "## 5. 액션 아이템",
    minutes.actionItems.length
      ? ["| 할 일 | 담당자 | 기한 |", "| --- | --- | --- |", ...minutes.actionItems.map((a) => `| ${a.task} | ${a.owner || "-"} | ${a.dueDate || "-"} |`)].join("\n")
      : "- 해당 없음",
    "",
    "## 6. 미결·확인 필요 사항",
    list(minutes.openIssues),
    "",
    "## 7. 다음 회의",
    minutes.nextMeeting || "미정",
    "",
  ].join("\n");
}
