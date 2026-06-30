// unpdf : wrapper de pdfjs-dist conçu pour Node serverless (Vercel, Cloudflare
// Workers). Le worker pdfjs est inline, pas de path à résoudre — élimine les
// problèmes de bundling rencontrés avec pdfjs-dist + Vercel.
import { getDocumentProxy } from "unpdf";

type TextItem = { str?: string; transform?: number[]; width?: number };

export async function pdfToText(pdfBytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(pdfBytes);
  const pages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Sort items by Y (descending = top-to-bottom) then X (left-to-right)
    // Insert newline when Y coordinate changes significantly (new row)
    const items = (content.items as TextItem[]).filter(
      (it) => it.str && it.str.trim() !== ""
    );

    if (items.length === 0) {
      pages.push("");
      continue;
    }

    // Group by Y coordinate (transform[5]) — items within ~2pt are same line
    const lines: { y: number; chunks: { x: number; w: number; str: string }[] }[] = [];
    for (const it of items) {
      const y = it.transform?.[5] ?? 0;
      const x = it.transform?.[4] ?? 0;
      const str = it.str ?? "";
      const w = it.width ?? 0;
      const existing = lines.find((l) => Math.abs(l.y - y) < 2);
      if (existing) {
        existing.chunks.push({ x, w, str });
      } else {
        lines.push({ y, chunks: [{ x, w, str }] });
      }
    }

    // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
    lines.sort((a, b) => b.y - a.y);

    const pageText = lines
      .map((line) => {
        line.chunks.sort((a, b) => a.x - b.x);
        // Smart spacing: only insert space when there's a real gap between chunks
        // This prevents "R O U G E" when pdfjs splits text into single characters
        let result = "";
        for (let ci = 0; ci < line.chunks.length; ci++) {
          const chunk = line.chunks[ci];
          if (ci === 0) {
            result = chunk.str;
            continue;
          }
          const prev = line.chunks[ci - 1];
          const prevEnd = prev.x + prev.w;
          const gap = chunk.x - prevEnd;
          // Estimate char width from previous chunk (fallback to font size from transform)
          const avgCharW = prev.w > 0 && prev.str.length > 0
            ? prev.w / prev.str.length
            : 4; // reasonable default
          // Insert space only if gap is larger than ~30% of a character width
          if (gap > avgCharW * 0.3) {
            result += " ";
          }
          result += chunk.str;
        }
        return result;
      })
      .join("\n");
    pages.push(pageText);
  }
  return pages.join("\n");
}
