import { NextResponse } from "next/server";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";

export const runtime = "nodejs";

/**
 * POST /api/invoices/detect
 * Accept a PDF file, extract text, and detect supplier + establishment.
 */
export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const rawText = await pdfToText(bytes);
  const detection = detectInvoice(rawText);

  return NextResponse.json({
    detection,
    textPreview: rawText.slice(0, 500),
  });
}
