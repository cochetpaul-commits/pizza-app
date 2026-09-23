import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { runImport, type ParsedInvoice, type ParsedLine } from "@/lib/invoices/importEngine";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";
import { PARSERS } from "@/lib/invoices/registry";
import { normalizeIngredientName } from "@/lib/invoices/categoryDetector";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/factures/rapprocher
 * Rejoue le rapprochement à partir des lignes DÉJÀ en base (parsed_json des
 * factures), sans relire le PDF ni Pennylane.
 *  - { supplier_id, offset?, limit? } : toutes les factures du fournisseur, par lots
 *    (fonction serveur limitée à 60 s ; l'écran enchaîne les lots). Aucune fiche créée.
 *  - { invoice_id, sku?, nom?, creer: true } : crée la fiche d'UNE ligne (référence
 *    ou libellé) avec la logique de l'import, puis son prix.
 * Règles du moteur : un prix plus récent n'est jamais écrasé, une offre identique à
 * la même date n'est pas dupliquée, un avoir ne crée jamais de prix.
 */
export async function POST(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const body = await req.json().catch(() => ({})) as { supplier_id?: string; invoice_id?: string; sku?: string | null; nom?: string | null; creer?: boolean; offset?: number; limit?: number };
  const limit = Math.min(20, Math.max(1, Number(body.limit ?? 5) || 5));
  const offset = Math.max(0, Number(body.offset ?? 0) || 0);

  type Inv = { id: string; user_id: string | null; supplier_id: string | null; supplier_name: string | null; invoice_number: string | null; invoice_date: string | null; etablissement_id: string | null; raw_text: string | null; parsed_json: ParsedInvoice | null };
  let factures: Inv[] = []; let total = 0;
  const sel = "id, user_id, supplier_id, supplier_name, invoice_number, invoice_date, etablissement_id, raw_text, parsed_json";
  if (body.invoice_id) {
    const { data, error } = await supabaseAdmin.from("supplier_invoices").select(sel).eq("id", body.invoice_id).limit(1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    factures = (data ?? []) as Inv[]; total = factures.length;
  } else if (body.supplier_id) {
    const { count } = await supabaseAdmin.from("supplier_invoices").select("id", { count: "exact", head: true }).eq("supplier_id", body.supplier_id).not("parsed_json", "is", null).not("invoice_number", "is", null);
    total = count ?? 0;
    const { data, error } = await supabaseAdmin.from("supplier_invoices").select(sel).eq("supplier_id", body.supplier_id)
      .not("parsed_json", "is", null).not("invoice_number", "is", null).order("invoice_date", { ascending: true }).order("id").range(offset, offset + limit - 1);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    factures = (data ?? []) as Inv[];
  } else {
    return NextResponse.json({ error: "supplier_id ou invoice_id requis" }, { status: 400 });
  }

  const { data: supRows } = await supabaseAdmin.from("suppliers").select("id, name, etablissement_id");
  const sup = new Map(((supRows ?? []) as Array<{ id: string; name: string; etablissement_id: string | null }>).map((s) => [s.id, s]));
  const { data: etabRows } = await supabaseAdmin.from("etablissements").select("id, slug");
  const slugById = new Map(((etabRows ?? []) as Array<{ id: string; slug: string }>).map((e) => [e.id, e.slug]));

  const creer = body.creer === true && !!body.invoice_id && (!!body.sku || !!body.nom);
  const skuVoulu = (body.sku ?? "").trim();
  const nomVoulu = normalizeIngredientName((body.nom ?? "").trim());
  const filterLine = (body.sku || body.nom)
    ? (l: ParsedLine) => (skuVoulu ? (l.sku ?? "").trim() === skuVoulu : normalizeIngredientName((l.name ?? "").trim()) === nomVoulu)
    : undefined;

  const details: Array<{ facture: string | null; date: string | null; offres: number; fiches: number; sans_fiche: number; erreur?: string }> = [];
  let offres = 0, fiches = 0, sansFiche = 0;
  for (const f of factures) {
    try {
      if (!f.parsed_json || !f.supplier_id || !f.invoice_number) { details.push({ facture: f.invoice_number, date: f.invoice_date, offres: 0, fiches: 0, sans_fiche: 0, erreur: "facture sans détail lu ou sans numéro" }); continue; }
      const s = sup.get(f.supplier_id);
      const etabId = f.etablissement_id ?? s?.etablissement_id ?? undefined;
      const slug = etabId ? (slugById.get(etabId) ?? "") : "";
      const det = f.raw_text ? detectInvoice(f.raw_text) : null;
      const entry = det?.supplier ? PARSERS[det.supplier.slug] : undefined;
      const r = await runImport({
        supabase: supabaseAdmin, userId: f.user_id ?? "", supplierName: s?.name ?? f.supplier_name ?? "", payload: f.parsed_json,
        sourceFileName: `rapprochement_${f.id}`, rawText: f.raw_text ?? `rapprochement_${f.id}`, mode: "commit",
        defaultUnit: entry?.defaultUnit ?? "pc", establishment: slug.includes("piccola") ? "piccola" : "bellomio", etabId,
        creerFiches: creer, filterLine,
        // Relance : on comble les trous, on n'écrase jamais un prix existant de date égale ou plus récente (vécu 23/09 : prix Excel de Paul remplacés)
        seulementCombler: !creer,
      });
      offres += r.offersInserted; fiches += r.ingredientsCreated; sansFiche += r.lignesSansFiche.length;
      details.push({ facture: f.invoice_number, date: f.invoice_date, offres: r.offersInserted, fiches: r.ingredientsCreated, sans_fiche: r.lignesSansFiche.length });
    } catch (e) {
      details.push({ facture: f.invoice_number, date: f.invoice_date, offres: 0, fiches: 0, sans_fiche: 0, erreur: e instanceof Error ? e.message.slice(0, 200) : "erreur" });
    }
  }
  const suivant = body.supplier_id && offset + limit < total ? offset + limit : null;
  return NextResponse.json({ ok: true, traitees: factures.length, total, suivant, offres, fiches, sans_fiche: sansFiche, details });
}
