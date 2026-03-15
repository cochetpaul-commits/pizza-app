import path from "node:path";

// Polyfill DOMMatrix for Node.js / Vercel serverless (pdfjs-dist requires it)
// Must run BEFORE pdfjs-dist is imported — hence dynamic import below
if (typeof globalThis.DOMMatrix === "undefined") {
  globalThis.DOMMatrix = class DOMMatrix {
    m11 = 1; m12 = 0; m13 = 0; m14 = 0;
    m21 = 0; m22 = 1; m23 = 0; m24 = 0;
    m31 = 0; m32 = 0; m33 = 1; m34 = 0;
    m41 = 0; m42 = 0; m43 = 0; m44 = 1;
    a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
    is2D = true; isIdentity = true;
    constructor(init?: number[] | string) {
      if (Array.isArray(init) && init.length >= 6) {
        [this.a, this.b, this.c, this.d, this.e, this.f] = init;
        this.m11 = this.a; this.m12 = this.b;
        this.m21 = this.c; this.m22 = this.d;
        this.m41 = this.e; this.m42 = this.f;
      }
    }
    multiply() { return new DOMMatrix(); }
    inverse() { return new DOMMatrix(); }
    translate() { return new DOMMatrix(); }
    scale() { return new DOMMatrix(); }
    transformPoint() { return { x: 0, y: 0, z: 0, w: 1 }; }
    toFloat32Array() { return new Float32Array(16); }
    toFloat64Array() { return new Float64Array(16); }
  } as unknown as typeof globalThis.DOMMatrix;
}

// Dynamic import — polyfill must be registered before pdfjs-dist loads
let pdfjsLib: typeof import("pdfjs-dist/legacy/build/pdf.mjs") | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = path.join(
      process.cwd(),
      "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"
    );
  }
  return pdfjsLib;
}

export async function pdfToText(pdfBytes: Uint8Array): Promise<string> {
  const pdfjs = await getPdfjs();
  const loadingTask = pdfjs.getDocument({ data: pdfBytes, useWorkerFetch: false, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Sort items by Y (descending = top-to-bottom) then X (left-to-right)
    // Insert newline when Y coordinate changes significantly (new row)
    type TextItem = { str?: string; transform?: number[] };
    const items = (content.items as TextItem[]).filter(
      (it) => it.str && it.str.trim() !== ""
    );

    if (items.length === 0) {
      pages.push("");
      continue;
    }

    // Group by Y coordinate (transform[5]) — items within ~2pt are same line
    const lines: { y: number; chunks: { x: number; str: string }[] }[] = [];
    for (const it of items) {
      const y = it.transform?.[5] ?? 0;
      const x = it.transform?.[4] ?? 0;
      const str = it.str ?? "";
      const existing = lines.find((l) => Math.abs(l.y - y) < 2);
      if (existing) {
        existing.chunks.push({ x, str });
      } else {
        lines.push({ y, chunks: [{ x, str }] });
      }
    }

    // Sort lines top-to-bottom (higher Y = higher on page in PDF coords)
    lines.sort((a, b) => b.y - a.y);

    const pageText = lines
      .map((line) => {
        line.chunks.sort((a, b) => a.x - b.x);
        return line.chunks.map((c) => c.str).join(" ");
      })
      .join("\n");
    pages.push(pageText);
  }
  return pages.join("\n");
}
