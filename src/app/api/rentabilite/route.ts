import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pennylaneConfigured } from "@/lib/pennylane/api";

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

  // ── 1. CA réel (Popina) ────────────────────────────────────────
  const PAGE = 1000;
  let caHt = 0, caTtc = 0, offset = 0, hasMore = true;
  while (hasMore) {
    const { data } = await supabaseAdmin
      .from("ventes_lignes")
      .select("ht, ttc")
      .eq("etablissement_id", etabId)
      .gte("date_service", from).lte("date_service", to)
      .eq("type_ligne", "Produit").eq("annule", false)
      .range(offset, offset + PAGE - 1);
    for (const r of data ?? []) { caHt += Number(r.ht ?? 0); caTtc += Number(r.ttc ?? 0); }
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
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
        detail: pennylaneConfigured() ? "Lancer la synchronisation Pennylane" : "Clé API Pennylane non configurée" };

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
    pennylane: pennylaneConfigured(),
  });
}
