/**
 * PDF → 텍스트. 브라우저 안에서 pdf.js로 뽑는다(서버로 안 간다).
 * 같은 줄(y가 비슷한 항목)을 이어 붙이고, 줄이 바뀌면 개행을 넣는다.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const lines: string[] = [];
    let lastY: number | null = null;
    let cur = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      const y = Math.round(item.transform[5]);
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(cur);
        cur = "";
      }
      cur += item.str;
      if (item.hasEOL) {
        lines.push(cur);
        cur = "";
        lastY = null;
        continue;
      }
      lastY = y;
    }
    if (cur) lines.push(cur);
    pages.push(lines.join("\n"));
  }
  return pages.join("\n\n");
}
