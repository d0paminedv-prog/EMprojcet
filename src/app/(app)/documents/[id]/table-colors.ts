import { TableCell, TableHeader } from "@tiptap/extension-table";
import { normalizeColor } from "@/lib/colors";

/**
 * 표 셀 배경색(색 채우기) 속성. 셀 속성이라 팀원 화면에 실시간으로 반영되고 Word·PDF 로도 내보내집니다.
 * Word·웹에서 붙여넣은 표의 셀 배경색도 읽어 옵니다.
 */
const backgroundColor = {
  default: null,
  parseHTML: (element: HTMLElement) => normalizeColor(element.getAttribute("data-background-color")) ?? normalizeColor(element.style.backgroundColor),
  renderHTML: (attributes: Record<string, unknown>) => {
    const color = normalizeColor(attributes.backgroundColor);
    return color ? { "data-background-color": color, style: `background-color: ${color}` } : {};
  },
};

export const ColoredTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor };
  },
});

export const ColoredTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), backgroundColor };
  },
});
