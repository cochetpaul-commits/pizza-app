import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { roleDenied } from "@/lib/getEtablissement";
import { aliasFournisseur, chargerIndexFiches, trouverFiche, estLigneDeFrais } from "@/lib/invoices/rapprochement";
import { normalizeIngredientName } from "@/lib/invoices/categoryDetector";

export const runtime = "nodejs";
export const maxDuration = 60;

type Ligne = { id: string; invoice_id: string; supplier_id: string | null; sku: string | null; name: string | null; quantity: number | null; unit: string | null; unit_price: number | null; total_price: number | null };
type Facture = { id: string; supplier_id: string | null; invoice_date: string | null; invoice_number: string | null; etablissement_id: string | null };

export type ProduitEnAttente = {
  cle: string; sku: string | null; libelle: string; lignes: number; factures: number;
  quantite: number | null; unite: string | null; montant_ht: number;
  dernier_prix: number | null; derniere_date: string | null; derniere_facture_id: string | null; derniere_facture_numero: string | null;
};
export type FournisseurEnAttente = { supplier_id: string; nom: string; lignes: number; montant_ht: number; factures_total: number; produits: ProduitEnAttente[] };

/**
 * GET /api/factures/en-attente?mois=6  (x-etablissement-id)
 * Lignes de facture sans fiche produit (même rapprochement que l'import), groupées
 * par fournisseur puis par référence, avec nombre d'achats et montant HT sur la période.
 */
export async function GET(req: NextRequest) {
  const denied = await roleDenied(req, ["group_admin", "manager"]);
  if (denied) return denied;
  const etabId = req.headers.get("x-etablissement-id") || req.nextUrl.searchParams.get("etab") || "";
  if (!etabId) return NextResponse.json({ error: "établissement manquant" }, { status: 400 });
  const mois = Math.min(24, Math.max(1, Number(req.nextUrl.searchParams.get("mois") ?? 6) || 6));
  const depuis = new Date(); depuis.setMonth(depuis.getMonth() - mois);
  const depuisIso = depuis.toISOString().slice(0, 10);

  const { data: supRows } = await supabaseAdmin.from("suppliers").select("id, name, etablissement_id");
  const suppliers = (supRows ?? []) as Array<{ id: string; name: string; etablissement_id: string | null }>;
  const supName = new Map(suppliers.map((s) => [s.id, s.name]));
  const supEtab = new Map(suppliers.map((s) => [s.id, s.etablissement_id]));

  // Factures de l'établissement (colonne établissement, sinon celui du fournisseur)
  const factures: Facture[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabaseAdmin.from("supplier_invoices")
      .select("id, supplier_id, invoice_date, invoice_number, etablissement_id")
      .gte("invoice_date", depuisIso).order("invoice_date").range(from, from + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    factures.push(...((data ?? []) as Facture[]));
    if (!data || data.length < 1000) break;
  }
  const mienne = (f: Facture) => (f.etablissement_id ?? (f.supplier_id ? supEtab.get(f.supplier_id) : null)) === etabId;
  const fact = factures.filter((f) => f.supplier_id && mienne(f));
  const factById = new Map(fact.map((f) => [f.id, f]));
  const factIds = fact.map((f) => f.id);

  const lignes: Ligne[] = [];
  for (let i = 0; i < factIds.length; i += 150) {
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabaseAdmin.from("supplier_invoice_lines")
        .select("id, invoice_id, supplier_id, sku, name, quantity, unit, unit_price, total_price")
        .in("invoice_id", factIds.slice(i, i + 150)).range(from, from + 999);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      lignes.push(...((data ?? []) as Ligne[]));
      if (!data || data.length < 1000) break;
    }
  }

  // Par fournisseur : index des fiches (références + noms) puis rapprochement ligne à ligne
  const parFourn = new Map<string, Ligne[]>();
  for (const l of lignes) {
    const sid = factById.get(l.invoice_id)?.supplier_id ?? l.supplier_id;
    if (!sid) continue;
    if (!parFourn.has(sid)) parFourn.set(sid, []);
    parFourn.get(sid)!.push(l);
  }

  const out: FournisseurEnAttente[] = [];
  for (const [sid, ls] of parFourn) {
    const alias = await aliasFournisseur(supabaseAdmin, sid, supName.get(sid));
    const skus = Array.from(new Set(ls.map((l) => (l.sku ?? "").trim()).filter(Boolean)));
    const idx = await chargerIndexFiches(supabaseAdmin, sid, alias, skus);
    const groupes = new Map<string, ProduitEnAttente & { _factures: Set<string> }>();
    for (const l of ls) {
      const nm = (l.name ?? "").trim();
      if (!nm && !l.sku) continue;
      if (estLigneDeFrais(nm)) continue; // forfait livraison, transport : un frais, pas un produit
      if (trouverFiche(idx, l.sku, nm)) continue;
      const sku = (l.sku ?? "").trim() || null;
      const cle = sku ?? `n:${normalizeIngredientName(nm)}`;
      const f = factById.get(l.invoice_id);
      let g = groupes.get(cle);
      if (!g) {
        g = { cle, sku, libelle: nm, lignes: 0, factures: 0, quantite: 0, unite: l.unit ?? null, montant_ht: 0, dernier_prix: null, derniere_date: null, derniere_facture_id: null, derniere_facture_numero: null, _factures: new Set() };
        groupes.set(cle, g);
      }
      g.lignes += 1;
      g._factures.add(l.invoice_id);
      g.montant_ht += Number(l.total_price ?? 0);
      if (g.quantite != null) { if ((l.unit ?? null) === g.unite && l.quantity != null) g.quantite += Number(l.quantity); else g.quantite = null; }
      const d = f?.invoice_date ?? null;
      if (d && (!g.derniere_date || d >= g.derniere_date)) {
        g.derniere_date = d; g.dernier_prix = l.unit_price ?? null; g.derniere_facture_id = l.invoice_id; g.derniere_facture_numero = f?.invoice_number ?? null;
        if (nm) g.libelle = nm;
      }
    }
    const produits = Array.from(groupes.values()).map(({ _factures, ...g }) => ({ ...g, factures: _factures.size, montant_ht: Math.round(g.montant_ht * 100) / 100, quantite: g.quantite == null ? null : Math.round(g.quantite * 1000) / 1000 }))
      .sort((a, b) => b.montant_ht - a.montant_ht);
    if (!produits.length) continue;
    out.push({
      supplier_id: sid, nom: supName.get(sid) ?? "?", produits,
      lignes: produits.reduce((a, p) => a + p.lignes, 0),
      montant_ht: Math.round(produits.reduce((a, p) => a + p.montant_ht, 0) * 100) / 100,
      factures_total: fact.filter((f) => f.supplier_id === sid).length,
    });
  }
  out.sort((a, b) => b.montant_ht - a.montant_ht);
  return NextResponse.json({ ok: true, periode: { depuis: depuisIso, mois }, factures: fact.length, lignes: lignes.length, fournisseurs: out });
}
