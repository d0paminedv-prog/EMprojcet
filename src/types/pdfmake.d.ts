// pdfmake 0.3 은 타입 정의를 포함하지 않아 이 앱에서 쓰는 부분만 선언
declare module "pdfmake" {
  type FontFiles = { normal: string; bold: string; italics: string; bolditalics: string };
  interface PdfMake {
    virtualfs: { writeFileSync(name: string, data: Buffer): void; existsSync(name: string): boolean };
    setFonts(fonts: Record<string, FontFiles>): void;
    setUrlAccessPolicy(callback: (url: string) => boolean): void;
    setLocalAccessPolicy(callback: (path: string) => boolean): void;
    createPdf(docDefinition: Record<string, unknown>): { getBuffer(): Promise<Buffer> };
  }
  const pdfmake: PdfMake;
  export default pdfmake;
}
