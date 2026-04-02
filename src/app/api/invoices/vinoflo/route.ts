// src/app/api/invoices/vinoflo/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { runImport } from "@/lib/invoices/importEngine";
import { parseVinofloInvoiceText } from "@/lib/invoices/vinoflo";
import { parseVinofloCommande } from "@/lib/invoices/vinofloCommande";
import { ocrPdf } from "@/lib/ocrVision";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";

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
      return NextResponse.json({ ok: false, error: "Seuls les .pdf sont supportés sur VINOFLO." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    let text: string;

    // Vinoflo PDFs always have garbled text with pdfjs — use Claude Vision directly
    if (process.env.ANTHROPIC_API_KEY) {
      console.log("[vinoflo] Using Claude Vision for clean text extraction");
      try {
        text = await ocrPdf(bytes);
      } catch (err) {
        console.error("[vinoflo] Claude Vision failed, falling back to pdfToText:", err);
        text = await pdfToText(bytes);
      }
    } else {
      text = await pdfToText(bytes);
    }

    let payload = parseVinofloInvoiceText(text);
    // Fallback to commande parser if no lines found
    if (payload.lines.length === 0) {
      payload = parseVinofloCommande(text);
    }

    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifié (Supabase user manquant)." }, { status: 401 });

    let etabId: string;
    try {
      ({ etabId } = await resolveEtabId(userId, req.headers));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    const result = await runImport({
      supabase, userId, supplierName: "VINOFLO",
      payload, sourceFileName: file.name, rawText: text, mode, establishment,
      defaultUnit: "pc", etabId,
      filterLine: (l) => l.notes !== "taxe_alcool",
    });

    return NextResponse.json({
      ok: true, kind: "vinoflo", filename: file.name, bytes: bytes.byteLength,
      invoice: { id: result.invoiceId, already_imported: result.invoiceAlreadyImported },
      inserted: { supplier_id: result.supplierId, ingredients_created: result.ingredientsCreated, offers_inserted: result.offersInserted },
      parsed: payload,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e || "Erreur import") }, { status: 500 });
  }
}
