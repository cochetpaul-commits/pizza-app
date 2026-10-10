import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";
import { PARSERS } from "@/lib/invoices/registry";
import { geminiVisionParse } from "@/lib/invoices/geminiVisionParser";
import { aliasFournisseur, chargerIndexFiches, trouverFiche } from "@/lib/invoices/rapprochement";
import type { ParsedInvoice } from "@/lib/invoices/importEngine";
import type { DocumentLu } from "@/lib/rapprochementReception";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Bon de livraison ou facture joint à la réception d'une commande (10/10/2026).
 * POST   FormData { session_id, file } : dépose le fichier (espace privé), le lit — parser du
 *        fournisseur pour un PDF texte reconnu, lecture d'image sinon — et retrouve la fiche
 *        produit de chaque ligne (référence fournisseur puis libellé). Rien n'est importé dans
 *        les prix : le document sert au contrôle. Le rapprochement avec la commande se fait à l'écran.
 * DELETE ?session_id : retire le document.
 */
const BUCKET = "reception-documents";
const TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif" };

async function sessionAutorisee(req: NextRequest, sessionId: string) {
  let auth: { etabId: string; userId: string; isGroupAdmin: boolean };
  try { auth = await getEtablissement(req); } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
  const { data: s } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, etablissement_id, supplier_id, document_path, suppliers(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return { erreur: NextResponse.json({ error: "Commande introuvable" }, { status: 404 }) };
  if (s.etablissement_id && s.etablissement_id !== auth.etabId && !auth.isGroupAdmin) return { erreur: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  return { auth, session: s as unknown as { id: string; etablissement_id: string | null; supplier_id: string | null; document_path: string | null; suppliers: { name: string } | null } };
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const sessionId = form ? String(form.get("session_id") ?? "") : "";
  const file = form?.get("file");
  if (!sessionId || !(file instanceof File)) return NextResponse.json({ error: "session_id et fichier requis" }, { status: 400 });
  const c = await sessionAutorisee(req, sessionId);
  if ("erreur" in c) return c.erreur;
  const { session } = c;

  const ext = (file.name.split(".").pop() ?? "").toLowerCase();
  const mime = file.type && file.type !== "application/octet-stream" ? file.type : TYPES[ext] ?? "";
  if (!Object.values(TYPES).includes(mime)) return NextResponse.json({ error: "Format non pris en charge : PDF, JPEG, PNG, WebP ou HEIC." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop lourd (15 Mo au plus)." }, { status: 400 });

  const octets = new Uint8Array(await file.arrayBuffer());
  const fournisseur = session.suppliers?.name ?? "";

  // 1. Dépôt (remplace le document précédent)
  const propre = file.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80);
  const chemin = `${session.etablissement_id ?? "sans-etab"}/${session.id}/${Date.now()}-${propre}`;
  const { error: errUp } = await supabaseAdmin.storage.from(BUCKET).upload(chemin, octets.slice(), { contentType: mime, upsert: false });
  if (errUp) return NextResponse.json({ error: `Dépôt impossible : ${errUp.message}` }, { status: 500 });
  if (session.document_path) await supabaseAdmin.storage.from(BUCKET).remove([session.document_path]);

  // 2. Lecture : parser dédié si PDF texte d'un fournisseur connu, lecture d'image sinon
  let lu: ParsedInvoice | null = null;
  let lecture: DocumentLu["lecture"] = "scan";
  let avertissement: string | null = null;
  try {
    if (mime === "application/pdf") {
      const texte = await pdfToText(octets.slice()).catch(() => "");
      const slug = texte.trim().length > 80 ? detectInvoice(texte).supplier?.slug ?? null : null;
      const parser = slug ? PARSERS[slug] : undefined;
      if (parser) {
        const p = parser.parse(texte);
        if (p.lines.length > 0) { lu = p; lecture = "parser"; }
      }
    }
    if (!lu) lu = (await geminiVisionParse(octets.slice(), mime, fournisseur || null)).invoice;
  } catch (e) {
    avertissement = `Document enregistré, mais sa lecture a échoué : ${e instanceof Error ? e.message.split("\n")[0] : "erreur inconnue"}. Contrôlez les lignes à la main.`;
  }

  // 3. Fiche produit de chaque ligne (même logique que l'import des factures)
  let document: DocumentLu | null = null;
  if (lu) {
    let trouver: (sku: string | null, nom: string | null) => string | null = () => null;
    if (session.supplier_id) {
      const alias = await aliasFournisseur(supabaseAdmin, session.supplier_id, fournisseur);
      const idx = await chargerIndexFiches(supabaseAdmin, session.supplier_id, alias, lu.lines.map((l) => l.sku).filter((s): s is string => !!s));
      trouver = (sku, nom) => trouverFiche(idx, sku, nom);
    }
    document = {
      numero: lu.invoice_number, date: lu.invoice_date, total_ht: lu.total_ht, total_ttc: lu.total_ttc, lecture,
      lignes: lu.lines.filter((l) => l.name || l.sku).map((l) => ({
        sku: l.sku, nom: (l.name ?? l.sku ?? "").trim(), quantite: l.quantity, unite: l.unit,
        prix_unitaire: l.unit_price, total: l.total_price, ingredient_id: trouver(l.sku, l.name),
      })),
    };
  }

  const { error } = await supabaseAdmin.from("commande_sessions").update({
    document_path: chemin, document_nom: file.name, document_type: mime, document_lu: document, document_at: new Date().toISOString(),
  }).eq("id", session.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: signe } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(chemin, 3600);
  return NextResponse.json({ ok: true, avertissement, document: { nom: file.name, type: mime, url: signe?.signedUrl ?? null, lu: document } });
}

export async function DELETE(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  const c = await sessionAutorisee(req, sessionId);
  if ("erreur" in c) return c.erreur;
  if (c.session.document_path) await supabaseAdmin.storage.from(BUCKET).remove([c.session.document_path]);
  const { error } = await supabaseAdmin.from("commande_sessions").update({ document_path: null, document_nom: null, document_type: null, document_lu: null, document_at: null }).eq("id", sessionId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
