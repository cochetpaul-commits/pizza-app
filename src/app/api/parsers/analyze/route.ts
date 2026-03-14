import { NextResponse } from "next/server";
import { pdfToText } from "@/lib/pdfToText";
import { parseInvoice } from "@/lib/parsers";

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const fournisseur = (form.get("fournisseur") as string) || null;
    const etablissement = (form.get("etablissement") as string) || null;

    if (!file) {
      return NextResponse.json({ error: "Fichier PDF requis" }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await pdfToText(bytes);

    const result = parseInvoice({ text, fournisseur, etablissement });

    return NextResponse.json({ ok: true, ...result, raw_text_preview: text.slice(0, 3000) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
