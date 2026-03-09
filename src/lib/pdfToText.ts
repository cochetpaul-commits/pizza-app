import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import path from "node:path";

// Pointer vers le vrai worker pour le mode fake (Node.js / serverless)
// On utilise require.resolve qui fonctionne même après bundling Turbopack
pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
  process.cwd(),
  "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
);

export async function pdfToText(pdfBytes: Uint8Array): Promise<string> {
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: unknown) => (item as { str?: string }).str ?? "")
      .join(" ");
    pages.push(pageText);
  }
  return pages.join("\n");
}
