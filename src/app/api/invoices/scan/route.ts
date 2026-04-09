import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runImport } from "@/lib/invoices/importEngine";
import { geminiVisionParse } from "@/lib/invoices/geminiVisionParser";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";

const ACCEPTED_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

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
    const supplierHint = form.get("supplier") ? String(form.get("supplier")) : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "Fichier manquant (field: file)." }, { status: 400 });
    }

    // Determine MIME type
    let mimeType = file.type;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!mimeType || mimeType === "application/octet-stream") {
      if (ext === "pdf") mimeType = "application/pdf";
      else if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
      else if (ext === "png") mimeType = "image/png";
      else if (ext === "webp") mimeType = "image/webp";
      else if (ext === "heic" || ext === "heif") mimeType = "image/heic";
    }

    if (!ACCEPTED_TYPES.has(mimeType)) {
      return NextResponse.json({
        ok: false,
        error: `Format non supporté (${mimeType}). Formats acceptés : PDF, JPEG, PNG, WebP.`,
      }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // Auth
    const supabase = createClient(getEnv("NEXT_PUBLIC_SUPABASE_URL"), getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"), {
      global: { headers: { Authorization: req.headers.get("authorization") ?? "" } },
    });
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr) return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId) return NextResponse.json({ ok: false, error: "Non authentifié." }, { status: 401 });

    let etabId: string;
    try {
      ({ etabId } = await resolveEtabId(userId, req.headers));
    } catch (e) {
      if (e instanceof EtabError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    // Call Gemini Vision
    const { invoice, supplierName } = await geminiVisionParse(bytes, mimeType, supplierHint);

    if (mode === "preview") {
      return NextResponse.json({
        ok: true,
        kind: "scan",
        filename: file.name,
        bytes: bytes.byteLength,
        parsed: invoice,
        supplier_detected: supplierName,
      });
    }

    // Commit
    const result = await runImport({
      supabase,
      userId,
      supplierName,
      payload: invoice,
      sourceFileName: file.name,
      rawText: `[vision-scan] ${JSON.stringify(invoice)}`,
      mode,
      defaultUnit: "pc",
      etabId,
    });

    return NextResponse.json({
      ok: true,
      kind: "scan",
      filename: file.name,
      bytes: bytes.byteLength,
      supplier_detected: supplierName,
      invoice: { id: result.invoiceId, already_imported: result.invoiceAlreadyImported },
      inserted: {
        supplier_id: result.supplierId,
        ingredients_created: result.ingredientsCreated,
        offers_inserted: result.offersInserted,
      },
      parsed: invoice,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e || "Erreur scan");
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
