import { Extension } from "@tiptap/core";
import { Fragment, Slice } from "@tiptap/pm/model";
import { Plugin } from "@tiptap/pm/state";
import { dropPoint } from "@tiptap/pm/transform";

/** 붙여넣거나 끌어다 놓은 이미지 파일 (detail: { files, pos }) — 편집기 화면에서 업로드 후 그 위치에 넣음 */
export const IMAGE_FILES_EVENT = "bx:image-files";
export type ImageFilesDetail = { files: File[]; pos: number };

const IMAGE_TYPES = /^image\/(png|jpe?g|gif|webp)$/;

function imageFiles(data: DataTransfer | null): File[] {
  return Array.from(data?.files ?? []).filter((f) => IMAGE_TYPES.test(f.type));
}

/** 글이 들어 있는 HTML 인지 (웹·Word 에서 글과 이미지를 함께 복사한 경우는 기본 붙여넣기) */
function htmlHasText(html: string): boolean {
  return !!new DOMParser().parseFromString(html, "text/html").body.textContent?.trim();
}

/** 클립보드 이미지(캡처 등) 붙여넣기, 이미지 파일 끌어다 놓기 */
export const ImagePasteDrop = Extension.create({
  name: "bxImagePasteDrop",
  addProseMirrorPlugins() {
    const emit = (dom: HTMLElement, detail: ImageFilesDetail) => dom.dispatchEvent(new CustomEvent<ImageFilesDetail>(IMAGE_FILES_EVENT, { detail }));
    return [
      new Plugin({
        props: {
          handlePaste: (view, event) => {
            const files = imageFiles(event.clipboardData);
            if (!files.length) return false;
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (html && htmlHasText(html)) return false;
            emit(view.dom, { files, pos: view.state.selection.from });
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved) return false;
            const files = imageFiles(event.dataTransfer);
            if (!files.length) return false;
            event.preventDefault();
            const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
            const pos = at?.pos ?? view.state.selection.from;
            // 글 중간에 떨어뜨려도 제목·문단을 쪼개지 않도록 가까운 블록 경계에 넣음
            const image = view.state.schema.nodes.image?.create({ src: "" });
            const boundary = image ? dropPoint(view.state.doc, pos, new Slice(Fragment.from(image), 0, 0)) : null;
            emit(view.dom, { files, pos: boundary ?? pos });
            return true;
          },
        },
      }),
    ];
  },
});
