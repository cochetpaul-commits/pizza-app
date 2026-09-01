import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured } from "@/lib/pennylane/api";
import { LIBELLES } from "@/lib/pennylane/syncCharges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/rentabilite?etablissement_id=X&from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Cascade CA → marge brute → EBE, en assemblant les sources réelles :
 *  - CA HT           : ventes_lignes (Popina)
 *  - Coût théorique  : recettes × ventes (/api/ventes/marges)
 *  - Achats matières : charges_mensuelles (Pennylane) sinon supplier_invoices (app, partiel)
 *  - Variation stock : inventaires clôturés valorisés
 *  - Masse salariale : charges_mensuelles (Silae / DSN)
 *  - Exploitation    : charges_mensuelles (Pennylane)
 *
 * Chaque ligne porte son `statut` : ok | partiel | manquant — l'écran ne
 * doit jamais présenter une estimation comme un chiffre certain.
 */

type Ligne = {
  poste: string;
  montant: number | null;
  statut: "ok" | "partiel" | "manquant";
  source: string;
  detail?: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!etabId || !from || !to) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }

  // Dossier Pennylane de cet établissement (bello → SARL SASHA, piccola → SARL I FRATELLI)
  const { data: etabRow } = await supabaseAdmin
    .from("etablissements").select("slug").eq("id", etabId).maybeSingle();
  const dossier = ((etabRow?.slug as string | null) ?? "").includes("bello") ? "bello" as const : "piccola" as const;

  // ── 1. CA réel (Popina) — agrégat SQL (ventes_ca_periode), plus de pagination ──
  let caHt = 0, caTtc = 0;
  {
    const { data: agg, error: aggErr } = await supabaseAdmin.rpc("ventes_ca_periode", { p_etab: etabId, p_from: from, p_to: to });
    if (aggErr) return NextResponse.json({ error: aggErr.message }, { status: 500 });
    const row = Array.isArray(agg) ? agg[0] : agg;
    caHt = Number(row?.ca_ht ?? 0);
    caTtc = Number(row?.ca_ttc ?? 0);
  }

  // ── 2. Coût matière théorique (recettes × ventes) ──────────────
  let theorique: { cout: number; caCouvert: number; pct: number; couverture: number } | null = null;
  try {
    const origin = new URL(req.url).origin;
    const res = await fetch(
      `${origin}/api/ventes/marges?etablissement_id=${etabId}&from=${from}&to=${to}`,
      { cache: "no-store" },
    );
    if (res.ok) {
      const m = await res.json();
      const products = (m.products ?? []) as { matched?: boolean; ca_ht?: number; cout_total?: number | null }[];
      const matched = products.filter(p => p.matched);
      const caCouvert = matched.reduce((s, p) => s + (p.ca_ht ?? 0), 0);
      const cout = matched.reduce((s, p) => s + (p.cout_total ?? 0), 0);
      theorique = {
        cout,
        caCouvert,
        // Taux calculé sur le périmètre réellement couvert (et non sur le CA total)
        pct: caCouvert > 0 ? (cout / caCouvert) * 100 : 0,
        couverture: caHt > 0 ? (caCouvert / caHt) * 100 : 0,
      };
    }
  } catch { /* le théorique reste optionnel */ }

  // ── 3. Charges saisies / importées sur la période ──────────────
  const moisFrom = from.slice(0, 8) + "01";
  const { data: charges } = await supabaseAdmin
    .from("charges_mensuelles")
    .select("poste, libelle, montant_ht, source")
    .eq("etablissement_id", etabId)
    .gte("mois", moisFrom).lte("mois", to);

  const parPoste = new Map<string, { total: number; sources: Set<string>; detail: { libelle: string; montant: number }[] }>();
  for (const c of charges ?? []) {
    const key = c.poste as string;
    let e = parPoste.get(key);
    if (!e) { e = { total: 0, sources: new Set(), detail: [] }; parPoste.set(key, e); }
    e.total += Number(c.montant_ht ?? 0);
    e.sources.add(c.source as string);
    if (c.libelle) e.detail.push({ libelle: c.libelle as string, montant: Number(c.montant_ht ?? 0) });
  }

  // ── 4. Achats matières : Pennylane si présent, sinon app (partiel) ──
  let achats: Ligne;
  const achatsCharges = parPoste.get("achats_matieres");
  if (achatsCharges && achatsCharges.total > 0) {
    achats = {
      poste: "Achats matières",
      montant: achatsCharges.total,
      statut: "ok",
      source: [...achatsCharges.sources].join(", "),
    };
  } else {
    const { data: fact } = await supabaseAdmin
      .from("supplier_invoices")
      .select("total_ht")
      .eq("etablissement_id", etabId)
      .gte("invoice_date", from).lte("invoice_date", to);
    const totalApp = (fact ?? []).reduce((s, f) => s + Number(f.total_ht ?? 0), 0);
    achats = {
      poste: "Achats matières",
      montant: totalApp || null,
      statut: "partiel",
      source: "factures scannées dans l'app",
      detail: "Seuls les fournisseurs de la mercuriale sont couverts — brancher Pennylane pour l'exhaustivité",
    };
  }

  // ── 5. Variation de stock (inventaires clôturés valorisés) ─────
  const { data: invs } = await supabaseAdmin
    .from("inventaires")
    .select("date, total_valeur")
    .eq("etablissement_id", etabId)
    .eq("statut", "cloture")
    .gt("total_valeur", 0)
    .order("date", { ascending: true });
  const valorises = invs ?? [];
  const avant = [...valorises].reverse().find(i => i.date < from);
  const apres = valorises.filter(i => i.date >= from && i.date <= to).pop();
  const variationStock: Ligne = avant && apres
    ? {
        poste: "Variation de stock",
        // Stock qui baisse = consommation supplémentaire (charge positive)
        montant: Number(avant.total_valeur) - Number(apres.total_valeur),
        statut: "ok",
        source: `inventaires du ${avant.date} et du ${apres.date}`,
      }
    : {
        poste: "Variation de stock",
        montant: null,
        statut: "manquant",
        source: "inventaires",
        detail: "Il faut deux inventaires clôturés et valorisés encadrant la période",
      };

  // ── 6. Masse salariale + exploitation ──────────────────────────
  const ms = parPoste.get("masse_salariale");
  const masseSalariale: Ligne = ms && ms.total > 0
    ? { poste: "Masse salariale chargée", montant: ms.total, statut: "ok", source: [...ms.sources].join(", ") }
    : { poste: "Masse salariale chargée", montant: null, statut: "manquant", source: "Silae / DSN",
        detail: "Combo donne les heures, pas le coût employeur — import de la paie nécessaire" };

  const POSTES_EXPLOITATION = ["loyer", "energie", "commissions_cb", "entretien", "assurances", "honoraires", "locations", "autres_charges", "a_categoriser", "remuneration_gerants"];
  const exploitationDetail: { libelle: string; montant: number }[] = [];
  let exploitationTotal = 0;
  for (const p of POSTES_EXPLOITATION) {
    const e = parPoste.get(p);
    if (e && Math.abs(e.total) > 0.5) {
      exploitationTotal += e.total;
      exploitationDetail.push({ libelle: e.detail[0]?.libelle ?? p, montant: e.total });
    }
  }
  const exploitation: Ligne = exploitationTotal > 0
    ? { poste: "Charges d'exploitation", montant: exploitationTotal, statut: "ok", source: "Pennylane" }
    : { poste: "Charges d'exploitation", montant: null, statut: "manquant", source: "Pennylane",
        detail: pennylaneConfigured(dossier) ? "Lancer la synchronisation Pennylane" : "Clé API Pennylane non configurée" };

  // ── 6b. Détail Pennylane : poste → catégorie → factures / transactions ──
  type DetailRow = { date: string | null; poste: string; categorie: string; fournisseur: string | null; libelle: string | null; montant_ht: number; type: string };
  const { data: detailRows } = await supabaseAdmin
    .from("charges_detail")
    .select("date, poste, categorie, fournisseur, libelle, montant_ht, type")
    .eq("etablissement_id", etabId)
    .gte("mois", moisFrom).lte("mois", to)
    .order("date", { ascending: false });
  const postesMap = new Map<string, { poste: string; libelle: string; total: number; cats: Map<string, { categorie: string; total: number; lignes: { date: string | null; fournisseur: string | null; libelle: string | null; montant: number; type: string }[] }> }>();
  for (const r of (detailRows ?? []) as DetailRow[]) {
    let pEntry = postesMap.get(r.poste);
    if (!pEntry) { pEntry = { poste: r.poste, libelle: LIBELLES[r.poste] ?? r.poste, total: 0, cats: new Map() }; postesMap.set(r.poste, pEntry); }
    const m = Number(r.montant_ht ?? 0);
    pEntry.total += m;
    let cEntry = pEntry.cats.get(r.categorie);
    if (!cEntry) { cEntry = { categorie: r.categorie, total: 0, lignes: [] }; pEntry.cats.set(r.categorie, cEntry); }
    cEntry.total += m;
    cEntry.lignes.push({ date: r.date, fournisseur: r.fournisseur, libelle: r.libelle, montant: m, type: r.type });
  }
  const ORDRE_POSTES = ["achats_matieres", "masse_salariale", "remuneration_gerants", "loyer", "energie", "commissions_cb", "entretien", "assurances", "honoraires", "locations", "autres_charges", "a_categoriser"];
  const detailPennylane = [...postesMap.values()]
    .sort((a, b) => ORDRE_POSTES.indexOf(a.poste) - ORDRE_POSTES.indexOf(b.poste))
    .map(p => ({
      poste: p.poste, libelle: p.libelle, total: Math.round(p.total * 100) / 100,
      categories: [...p.cats.values()].sort((a, b) => b.total - a.total).map(c => ({
        categorie: c.categorie, total: Math.round(c.total * 100) / 100, nb: c.lignes.length,
        lignes: c.lignes.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "")),
      })),
    }));

  // ── 7. Cascade ─────────────────────────────────────────────────
  const coutMatiere = (achats.montant ?? 0) + (variationStock.montant ?? 0);
  const margeBrute = achats.montant != null ? caHt - coutMatiere : null;
  const ebe = margeBrute != null && masseSalariale.montant != null && exploitation.montant != null
    ? margeBrute - masseSalariale.montant - exploitation.montant
    : null;

  return NextResponse.json({
    periode: { from, to },
    ca: { ht: caHt, ttc: caTtc },
    theorique,
    lignes: [achats, variationStock, masseSalariale, exploitation],
    margeBrute: margeBrute != null ? {
      montant: margeBrute,
      pct: caHt > 0 ? (margeBrute / caHt) * 100 : 0,
      foodCostPct: caHt > 0 ? (coutMatiere / caHt) * 100 : 0,
      fiable: achats.statut === "ok" && variationStock.statut === "ok",
    } : null,
    ebe: ebe != null ? { montant: ebe, pct: caHt > 0 ? (ebe / caHt) * 100 : 0 } : null,
    exploitationDetail: exploitationDetail.sort((a, b) => b.montant - a.montant).slice(0, 12),
    detailPennylane,
    pennylane: pennylaneConfigured(dossier),
  });
}
