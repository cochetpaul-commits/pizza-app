import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { ocrPdf } from "@/lib/ocrVision";
import { runImport } from "@/lib/invoices/importEngine";
import { detectInvoice, supplierSlugToRoute } from "@/lib/invoices/invoiceDetector";
import {
  aiParseInvoice,
  templateParseInvoice,
  saveTemplate,
  getTemplate,
  bumpTemplateSuccess,
} from "@/lib/invoices/aiParser";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveEtabId, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";

// Known supplier slugs that have dedicated parsers
const KNOWN_PARSER_SLUGS = new Set([
  "mael", "metro", "masse", "cozigou", "vinoflo",
  "carniato", "barspirits", "sum", "armor", "lmdw", "sdpf", "elien",
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
    const establishment = String(form.get("establishment") ?? "both") as
      | "bellomio"
      | "piccola"
      | "both";
    const supplierNameHint = form.get("supplier_name")
      ? String(form.get("supplier_name"))
      : null;

    // ── Validate input ───────────────────────────────────────────────────────
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "Fichier manquant (field: file)." },
        { status: 400 },
      );
    }
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json(
        { ok: false, error: "Seuls les fichiers .pdf sont supportés." },
        { status: 400 },
      );
    }

    // ── Auth ─────────────────────────────────────────────────────────────────
    const supabase = createClient(
      getEnv("NEXT_PUBLIC_SUPABASE_URL"),
      getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      { global: { headers: { Authorization: req.headers.get("authorization") ?? "" } } },
    );

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr)
      return NextResponse.json({ ok: false, error: authErr.message }, { status: 401 });
    const userId = auth?.user?.id ?? null;
    if (!userId)
      return NextResponse.json(
        { ok: false, error: "Non authentifié (Supabase user manquant)." },
        { status: 401 },
      );

    let etabId: string;
    try {
      ({ etabId } = await resolveEtabId(userId, req.headers));
    } catch (e) {
      if (e instanceof EtabError)
        return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
      throw e;
    }

    // ── Extract text ─────────────────────────────────────────────────────────
    const bytes = new Uint8Array(await file.arrayBuffer());
    let rawText = await pdfToText(bytes);
    let ocrUsed = false;

    console.log(`[ai-parse] pdfToText extracted ${rawText.length} chars from "${file.name}"`);

    // If PDF has no text (scan/image), try OCR via Google Vision
    if (rawText.trim().length < 30) {
      console.log(`[ai-parse] PDF is a scan — trying OCR via Claude Vision...`);
      try {
        rawText = await ocrPdf(bytes);
        ocrUsed = true;
        console.log(`[ai-parse] OCR extracted ${rawText.length} chars`);
      } catch (ocrErr) {
        console.error(`[ai-parse] OCR failed:`, ocrErr);
        return NextResponse.json({
          ok: false,
          error: `Le PDF est un scan et l'OCR a echoue: ${ocrErr instanceof Error ? ocrErr.message : String(ocrErr)}`,
        }, { status: 400 });
      }

      if (rawText.trim().length < 30) {
        return NextResponse.json({
          ok: false,
          error: `Aucun texte extractible du PDF, meme apres OCR (${rawText.trim().length} car.).`,
        }, { status: 400 });
      }
    }

    // ── Detect supplier ──────────────────────────────────────────────────────
    const detection = detectInvoice(rawText);
    const detectedName = detection.supplier?.name ?? supplierNameHint;
    const detectedSlug = detection.supplier?.slug ?? null;

    // If supplier has a dedicated parser, redirect to it
    if (detectedSlug && KNOWN_PARSER_SLUGS.has(detectedSlug)) {
      const route = supplierSlugToRoute(detectedSlug);
      const origin = new URL(req.url).origin;
      const targetUrl = `${origin}/api/invoices/${route}`;

      // Re-create FormData to forward
      const fwd = new FormData();
      fwd.append("file", file);
      fwd.append("mode", mode);
      fwd.append("establishment", establishment);

      const fwdRes = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: req.headers.get("authorization") ?? "",
          "x-etablissement-id": req.headers.get("x-etablissement-id") ?? "",
        },
        body: fwd,
      });

      const fwdJson = await fwdRes.json();
      // Enrich forwarded response with supplier info for batch display
      return NextResponse.json({
        ...fwdJson,
        supplier_detected: detectedName ?? fwdJson.supplier_detected ?? null,
        parse_method: "dedicated",
      }, { status: fwdRes.status });
    }

    // ── Try template parsing ─────────────────────────────────────────────────
    const supplierName = detectedName ?? "INCONNU";
    let parsedInvoice: import("@/lib/invoices/importEngine").ParsedInvoice | null = null;
    let parseMethod: "template" | "ai" = "ai";
    let resolvedSupplierName = supplierName;

    if (detectedName) {
      const template = await getTemplate(supabaseAdmin, detectedName);
      if (template) {
        const templateResult = templateParseInvoice(rawText, template);
        if (templateResult && templateResult.lines.length > 0) {
          parsedInvoice = templateResult;
          parseMethod = "template";
          resolvedSupplierName = template.supplier_name || detectedName;
          bumpTemplateSuccess(supabaseAdmin, template.id).catch(() => null);
        }
      }
    }

    // ── Fall back to AI parsing ──────────────────────────────────────────────
    let aiSupplierName = resolvedSupplierName;

    if (!parsedInvoice) {
      const aiResult = await aiParseInvoice(rawText, supplierName === "INCONNU" ? null : supplierName);
      parsedInvoice = aiResult.invoice;
      parseMethod = "ai";

      // If supplier was unknown, use AI-detected name
      if (aiResult.supplierInfo?.name && (supplierName === "INCONNU" || !detectedName)) {
        aiSupplierName = aiResult.supplierInfo.name;
      }

      // Create or find the supplier
      let supplierId: string | null = null;

      // Try to find existing supplier
      const { data: existingSupplier } = await supabaseAdmin
        .from("suppliers")
        .select("id")
        .ilike("name", aiSupplierName)
        .limit(1)
        .maybeSingle();

      if (existingSupplier) {
        supplierId = existingSupplier.id;
      } else if (aiResult.supplierInfo?.name) {
        // Create new supplier from AI-extracted info
        const { data: newSupplier } = await supabaseAdmin
          .from("suppliers")
          .insert({
            user_id: userId,
            name: aiResult.supplierInfo.name,
            siret: aiResult.supplierInfo.siret,
            address: aiResult.supplierInfo.address,
            phone: aiResult.supplierInfo.phone,
            email: aiResult.supplierInfo.email,
            is_active: true,
            etablissement_id: etabId,
          })
          .select("id")
          .single();

        supplierId = newSupplier?.id ?? null;
        console.log(`[ai-parse] Created new supplier: "${aiResult.supplierInfo.name}" (${supplierId})`);
      }

      // Save template for future use
      saveTemplate(
        supabaseAdmin,
        supplierId,
        aiSupplierName,
        aiResult.hints,
        rawText.slice(0, 5000),
      ).catch((err) => console.error("[ai-parse] saveTemplate error:", err));
    }

    // ── Run import engine ────────────────────────────────────────────────────
    const result = await runImport({
      supabase,
      userId,
      supplierName: aiSupplierName,
      payload: parsedInvoice,
      sourceFileName: file.name,
      rawText,
      mode,
      establishment,
      defaultUnit: "g",
      etabId,
    });

    return NextResponse.json({
      ok: true,
      kind: "ai-parse",
      parse_method: parseMethod,
      supplier_detected: aiSupplierName !== "INCONNU" ? aiSupplierName : (detectedName ?? resolvedSupplierName),
      filename: file.name,
      bytes: bytes.byteLength,
      raw_text_length: rawText.length,
      ocr_used: ocrUsed,
      invoice: {
        id: result.invoiceId,
        already_imported: result.invoiceAlreadyImported,
      },
      inserted: {
        supplier_id: result.supplierId,
        ingredients_created: result.ingredientsCreated,
        offers_inserted: result.offersInserted,
      },
      parsed: parsedInvoice,
    });
  } catch (e: unknown) {
    console.error("[ai-parse] Error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e || "Erreur import IA") },
      { status: 500 },
    );
  }
}
