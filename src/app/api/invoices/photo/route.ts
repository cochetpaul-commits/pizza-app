/**
 * POST /api/invoices/photo
 *
 * Accepts an image (jpg/png/webp) or PDF via FormData.
 * - Images: Google Cloud Vision OCR (DOCUMENT_TEXT_DETECTION) -> text -> parseInvoice
 * - PDFs: pdfToText -> parseInvoice (same as /api/invoices/detect)
 *
 * Query params / form fields:
 *   - file: the image or PDF
 *   - fournisseur: optional supplier slug override
 *   - etablissement: optional etab slug override
 *   - mode: "preview" (default) or "commit"
 */

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdfToText } from "@/lib/pdfToText";
import { parseInvoice, detectSupplier } from "@/lib/parsers";
import { runImport } from "@/lib/invoices/importEngine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// ── Google OAuth token (reuse Gmail credentials) ─────────────────────────────

let _cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.exp - 60_000) return _cachedToken.token;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`OAuth token error: ${JSON.stringify(data)}`);
  }
  _cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

// ── Google Cloud Vision OCR ──────────────────────────────────────────────────

async function ocrImage(imageBytes: Uint8Array): Promise<string> {
  const token = await getAccessToken();
  const base64 = Buffer.from(imageBytes).toString("base64");

  const body = {
    requests: [
      {
        image: { content: base64 },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  };

  const res = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Vision API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text = data.responses?.[0]?.fullTextAnnotation?.text ?? "";
  if (!text) {
    const errorInfo = data.responses?.[0]?.error;
    if (errorInfo) throw new Error(`Vision API: ${errorInfo.message}`);
  }
  return text;
}

// ── Route handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
    }

    const mode = String(form.get("mode") ?? "preview");
    const fournisseurOverride = form.get("fournisseur") ? String(form.get("fournisseur")) : null;
    const etablissementOverride = form.get("etablissement") ? String(form.get("etablissement")) : null;

    const bytes = new Uint8Array(await file.arrayBuffer());
    const isPdf = file.name.toLowerCase().endsWith(".pdf") || file.type === "application/pdf";

    // Extract text: PDF or image OCR
    let text: string;
    if (isPdf) {
      text = await pdfToText(bytes);
    } else {
      text = await ocrImage(bytes);
    }

    if (!text || text.trim().length < 10) {
      return NextResponse.json({
        ok: false,
        error: "Texte extrait vide ou trop court. Verifiez la qualite de l'image.",
        ocrText: text,
      });
    }

    // Detect supplier + etablissement from text
    const detected = detectSupplier(text);
    const fournisseur = fournisseurOverride || detected.fournisseur;
    const etablissement = etablissementOverride || detected.etablissement;

    // If mode is just "detect", return detection + text preview
    if (mode === "detect") {
      return NextResponse.json({
        ok: true,
        detection: {
          supplier: fournisseur ? { slug: fournisseur, name: fournisseur } : null,
          etablissement: etablissement ? { slug: etablissement, name: etablissement } : null,
        },
        textPreview: text.slice(0, 1000),
        source: isPdf ? "pdf" : "ocr",
      });
    }

    // Parse with supplier-specific or generic parser
    const parseResult = parseInvoice({
      text,
      fournisseur,
      etablissement,
    });

    // Resolve etab ID
    const etabSlug = etablissement ?? "bello_mio";
    const etabValue = etabSlug.includes("piccola") ? "piccola" : "bellomio";
    let etabId: string | null = null;
    const terms = etabSlug.includes("piccola") ? ["piccola", "piccolamia"] : ["bello", "bellomio"];
    for (const term of terms) {
      const { data } = await supabaseAdmin
        .from("etablissements")
        .select("id")
        .ilike("nom", `%${term}%`)
        .eq("actif", true)
        .limit(1)
        .maybeSingle();
      if (data?.id) { etabId = data.id; break; }
    }

    // Get user from auth header
    const authHeader = req.headers.get("authorization");
    let userId = "system";
    if (authHeader?.startsWith("Bearer ")) {
      const { data } = await supabaseAdmin.auth.getUser(authHeader.replace("Bearer ", ""));
      if (data.user) userId = data.user.id;
    }

    // Use importEngine for preview/commit (same as PDF import)
    const supplierName = fournisseur
      ? fournisseur.charAt(0).toUpperCase() + fournisseur.slice(1)
      : parseResult.fournisseur ?? "Unknown";

    // Build ParsedInvoice compatible with importEngine
    const payload = {
      invoice_number: parseResult.invoice_number,
      invoice_date: parseResult.invoice_date,
      total_ht: parseResult.total_ht,
      total_ttc: parseResult.total_ttc,
      lines: parseResult.ingredients.map((ing) => ({
        sku: ing.reference ?? null,
        name: ing.name,
        quantity: ing.colisage ?? 1,
        unit: (ing.unit_commande === "kg" ? "kg" : "pc") as "pc" | "kg" | "l",
        unit_price: ing.prix_unitaire,
        total_price: ing.prix_commande,
        tax_rate: null,
        notes: null,
        piece_weight_g: ing.poids_unitaire ?? null,
        piece_volume_ml: ing.volume_unitaire ?? null,
      })),
    };

    const result = await runImport({
      supabase: supabaseAdmin,
      userId,
      supplierName,
      payload,
      sourceFileName: file.name,
      rawText: text,
      mode,
      establishment: etabValue as "bellomio" | "piccola" | "both",
      etabId: etabId ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      source: isPdf ? "pdf" : "ocr",
      fournisseur,
      etablissement,
      filename: file.name,
      invoice: {
        id: result.invoiceId,
        already_imported: result.invoiceAlreadyImported,
      },
      inserted: {
        supplier_id: result.supplierId,
        ingredients_created: result.ingredientsCreated,
        offers_inserted: result.offersInserted,
      },
      parsed: payload,
    });
  } catch (e) {
    console.error("[invoices/photo] error:", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erreur inconnue" },
      { status: 500 },
    );
  }
}
