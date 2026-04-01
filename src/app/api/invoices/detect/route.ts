import { NextResponse } from "next/server";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";

export const runtime = "nodejs";

/**
 * POST /api/invoices/detect
 * Accept a PDF file, extract text, and detect supplier + establishment.
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      return NextResponse.json({ error: "Seuls les fichiers PDF sont acceptés." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const rawText = await pdfToText(bytes);
    const detection = detectInvoice(rawText);

    return NextResponse.json({ ok: true, detection });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[detect] error:", msg);
    return NextResponse.json({ ok: false, error: `Erreur analyse PDF: ${msg}` }, { status: 500 });
  }
}
