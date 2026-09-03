import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cronAuth";
import { getSupplierInvoices } from "@/lib/pennylane/api";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Diagnostic (secret cron) : quels modèles Gemini la clé de prod accepte-t-elle,
 * avec quel type de pièce jointe (texte seul, image PNG, PDF scanné) ?
 * ?facture=FA006478 : teste aussi le PDF d'une facture Pennylane (dossier Bello).
 */
const PNG_1x1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

async function tryModel(key: string, model: string, parts: unknown[]) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts }], generationConfig: { temperature: 0.1 } }),
  });
  const txt = await res.text();
  let body = "";
  if (res.ok) {
    try { body = String(JSON.parse(txt)?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").slice(0, 80); } catch { body = txt.slice(0, 80); }
  } else {
    body = txt.replace(/\s+/g, " ").slice(0, 220);
  }
  return { status: res.status, body };
}

export async function GET(req: NextRequest) {
  const denied = cronUnauthorized(req);
  if (denied) return denied;
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "GEMINI_API_KEY absente" }, { status: 400 });

  let pdfB64: string | null = null;
  const facture = req.nextUrl.searchParams.get("facture");
  if (facture) {
    const invs = await getSupplierInvoices("2026-08-15", new Date().toISOString().slice(0, 10), "bello");
    const inv = invs.find((i) => (i.invoice_number ?? "").includes(facture));
    if (inv?.public_file_url) {
      const rep = await fetch(inv.public_file_url);
      pdfB64 = Buffer.from(await rep.arrayBuffer()).toString("base64");
    }
  }

  // ?models=a,b pour limiter (chaque essai PDF pèse ~300 Ko ; 60 s max par appel)
  const models = (req.nextUrl.searchParams.get("models") ?? "gemini-3.6-flash,gemini-2.5-flash").split(",").map((m) => m.trim()).filter(Boolean);
  const out: Record<string, unknown> = {};
  for (const m of models) {
    const r: Record<string, unknown> = {};
    r.texte = await tryModel(key, m, [{ text: "Réponds uniquement: OK" }]);
    r.png = await tryModel(key, m, [{ text: "Décris cette image en 3 mots." }, { inline_data: { mime_type: "image/png", data: PNG_1x1 } }]);
    if (pdfB64) {
      r.pdf_inline_data = await tryModel(key, m, [{ text: "Quel est le total TTC de cette facture ?" }, { inline_data: { mime_type: "application/pdf", data: pdfB64 } }]);
      r.pdf_inlineData_camel = await tryModel(key, m, [{ text: "Quel est le total TTC de cette facture ?" }, { inlineData: { mimeType: "application/pdf", data: pdfB64 } }]);
    }
    out[m] = r;
  }
  return NextResponse.json({ pdf_charge: !!pdfB64, resultats: out });
}
