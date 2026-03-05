import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText, runImport } from "@/lib/invoices/importEngine";
import { parseMaelInvoiceText } from "@/lib/invoices/mael";

export const runtime = "nodejs";

function getEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    const mode = String(form.get("mode") ?? "preview");
    const establishment = (String(form.get("establishment") ?? "both")) as "bellomio" | "piccola" | "both";

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant (field: file)." }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ ok: false, error: "Seuls les .pdf sont supportés sur MAEL." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const text = await pdfToText(bytes, { prefix: "pizzaapp-mael-", flags: ["-layout"] });
    const payload = parseMaelInvoiceText(text);

    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifié (Supabase user manquant)." }, { status: 401 });

    const result = await runImport({
      supabase, userId, supplierName: "MAEL",
      payload, sourceFileName: file.name, rawText: text, mode, establishment,
      defaultUnit: "g",
    });

    return NextResponse.json({
      ok: true, kind: "mael", filename: file.name, bytes: bytes.byteLength,
      invoice: { id: result.invoiceId, already_imported: result.invoiceAlreadyImported },
      inserted: { supplier_id: result.supplierId, ingredients_created: result.ingredientsCreated, offers_inserted: result.offersInserted },
      parsed: payload,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e || "Erreur import") }, { status: 500 });
  }
}
