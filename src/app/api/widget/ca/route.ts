// app/api/widget/ca/route.ts  (chemin réel : src/app/api/widget/ca/route.ts)
//
// API du widget Scriptable + dashboard web "CA — Bello Mio".
//
// Source : table `ventes_lignes` (Popina), agrégée par jour via la vue
// `v_ca_journalier` + les fonctions `top_produit_jour`, `widget_categories`,
// `widget_top_produits` (toutes créées dans Supabase).
//
// Renvoie : le dernier jour d'exploitation dispo (≤ hier), comparaison J-7,
// séries 7/30 j, moyenne 7 j, CA semaine vs semaine précédente, CA mois en
// cours vs même période M-1, meilleur jour (30 j), split midi/soir (jour + 30 j),
// mix par catégorie et top produits (30 j), top produit du jour, infos service.
//
// Variables d'env Vercel :
//   WIDGET_TOKEN, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ETAB_ID = "93dddd48-21f5-44e9-83aa-024af53bce83";
const ETAB_NOM = "Bello Mio";

// --- Helpers ---------------------------------------------------------------

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
}
function round(n: number, d = 2): number { const f = 10 ** d; return Math.round(n * f) / f; }

function dateISO(offset: number): string {
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  paris.setDate(paris.getDate() + offset);
  return fmt(paris);
}
function fmt(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dateUTC(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmtUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
function addDays(iso: string, n: number): string { const d = dateUTC(iso); d.setUTCDate(d.getUTCDate() + n); return fmtUTC(d); }
function diffJours(a: string, b: string): number { return Math.round((dateUTC(a).getTime() - dateUTC(b).getTime()) / 86400000); }
function libelleJour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateUTC(iso));
}
function jourCourt(iso: string): string { return new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(dateUTC(iso)); }
function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(dateUTC(iso));
}
function moisLong(iso: string): string { return new Intl.DateTimeFormat("fr-FR", { month: "long", timeZone: "UTC" }).format(dateUTC(iso)); }
function initialeJour(iso: string): string { return ["D", "L", "M", "M", "J", "V", "S"][dateUTC(iso).getUTCDay()]; }
function varPct(cur: number, prev: number | null): number | null {
  return prev != null && prev > 0 ? round(((cur - prev) / prev) * 100, 1) : null;
}

interface PointSerie { date: string; label: string; ca: number; }
type Supa = ReturnType<typeof createClient>;

// --- Handler ---------------------------------------------------------------

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.WIDGET_TOKEN || token !== process.env.WIDGET_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  const supabase: Supa = createClient(url, key, { auth: { persistSession: false } });

  try {
    const hier = dateISO(-1);
    const debut = dateISO(-75); // large : couvre 30 j + mois M-1 + J-7

    const { data, error } = await supabase
      .from("v_ca_journalier")
      .select("date_service, ca_ttc, ca_pizza, ca_midi, ca_soir, tickets, couverts")
      .eq("etablissement_id", ETAB_ID)
      .gte("date_service", debut)
      .lte("date_service", hier)
      .order("date_service", { ascending: true });
    if (error) throw new Error(error.message);

    type Row = { date_service: string; ca_ttc: unknown; ca_pizza: unknown; ca_midi: unknown; ca_soir: unknown; tickets: number | null; couverts: number | null };
    const rows = (data ?? []) as Row[];
    if (!rows.length) return NextResponse.json({ error: "no_data" }, { status: 404 });

    const byDate = new Map<string, Row>();
    rows.forEach((r) => byDate.set(r.date_service, r));
    const caDay = (iso: string) => num(byDate.get(iso)?.ca_ttc) ?? 0;
    const caRange = (d1: string, d2: string) => {
      let s = 0;
      for (const r of rows) if (r.date_service >= d1 && r.date_service <= d2) s += num(r.ca_ttc) ?? 0;
      return round(s);
    };

    // Jour cible = dernier jour disponible (≤ hier)
    const cible = rows[rows.length - 1].date_service;
    const cibleRow = byDate.get(cible)!;
    const caTotal = round(num(cibleRow.ca_ttc) ?? 0);
    const couverts = cibleRow.couverts ?? null;
    const tickets = cibleRow.tickets ?? null;
    const caPizza = num(cibleRow.ca_pizza);
    const midi = num(cibleRow.ca_midi);
    const soir = num(cibleRow.ca_soir);
    const ticketMoyen = couverts && couverts > 0 ? round(caTotal / couverts, 1) : (tickets && tickets > 0 ? round(caTotal / tickets, 1) : null);
    const partPizza = caPizza != null && caTotal > 0 ? Math.round((caPizza / caTotal) * 100) : null;

    // Séries
    const serie = (depuis: number): PointSerie[] => {
      const out: PointSerie[] = [];
      for (let off = depuis; off <= 0; off++) {
        const iso = addDays(cible, off);
        out.push({ date: iso, label: initialeJour(iso), ca: round(caDay(iso)) });
      }
      return out;
    };
    const serie_7j = serie(-6);
    const serie_30j = serie(-29);

    const ouverts = serie_7j.filter((p) => p.ca > 0);
    const moyenne_7j = ouverts.length ? round(ouverts.reduce((a, p) => a + p.ca, 0) / ouverts.length) : null;

    // J-7
    const caJ7raw = round(caDay(addDays(cible, -7)));
    const caJ7 = caJ7raw > 0 ? caJ7raw : null;

    // Semaine glissante (7 j) vs 7 j précédents
    const caSem = caRange(addDays(cible, -6), cible);
    const caSemPrec = caRange(addDays(cible, -13), addDays(cible, -7));

    // Mois en cours (du 1er au jour cible) vs même période M-1
    const cd = dateUTC(cible);
    const y = cd.getUTCFullYear(), m = cd.getUTCMonth(), day = cd.getUTCDate();
    const moisDebut = fmtUTC(new Date(Date.UTC(y, m, 1)));
    const caMois = caRange(moisDebut, cible);
    const moisPrecDebut = fmtUTC(new Date(Date.UTC(y, m - 1, 1)));
    const dernierJourMoisPrec = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const moisPrecFin = fmtUTC(new Date(Date.UTC(y, m - 1, Math.min(day, dernierJourMoisPrec))));
    const caMoisPrec = caRange(moisPrecDebut, moisPrecFin);

    // Meilleur jour (30 j)
    let meilleur: PointSerie | null = null;
    for (const p of serie_30j) if (p.ca > 0 && (!meilleur || p.ca > meilleur.ca)) meilleur = p;

    // Midi / soir cumulés 30 j
    let midi30 = 0, soir30 = 0, anyMS = false;
    for (const r of rows) {
      if (r.date_service < addDays(cible, -29) || r.date_service > cible) continue;
      const mi = num(r.ca_midi), so = num(r.ca_soir);
      if (mi != null) { midi30 += mi; anyMS = true; }
      if (so != null) { soir30 += so; anyMS = true; }
    }

    // RPC catégories + top produits (30 j).
    // Cast : ces fonctions ne sont pas dans les types générés Supabase.
    const rpc = (fn: string, args: Record<string, unknown>) =>
      (supabase.rpc as unknown as (f: string, a: Record<string, unknown>) => Promise<{ data: unknown }>)(fn, args);
    const win = addDays(cible, -29);
    const [catRes, topRes] = await Promise.all([
      rpc("widget_categories", { p_etab: ETAB_ID, p_debut: win, p_fin: cible }),
      rpc("widget_top_produits", { p_etab: ETAB_ID, p_debut: win, p_fin: cible, p_limit: 6 }),
    ]);
    const catRows = (catRes.data ?? []) as { categorie: string; ca: unknown; qte: unknown }[];
    const totalCat = catRows.reduce((a, c) => a + (num(c.ca) ?? 0), 0) || 1;
    const categories = catRows.map((c) => ({
      nom: c.categorie, ca: round(num(c.ca) ?? 0), qte: Number(c.qte) || 0,
      pct: Math.round(((num(c.ca) ?? 0) / totalCat) * 100),
    }));
    const top_produits = ((topRes.data ?? []) as { produit: string; categorie: string; ca: unknown; qte: unknown }[]).map((p) => ({
      produit: p.produit, categorie: p.categorie, ca: round(num(p.ca) ?? 0), qte: Number(p.qte) || 0,
    }));

    // Top produit du jour
    let topProduit: string | null = null;
    try {
      const { data: tp } = await rpc("top_produit_jour", { p_etab: ETAB_ID, p_date: cible });
      if (typeof tp === "string") topProduit = tp;
    } catch (_e) { /* non bloquant */ }

    const ecart = diffJours(hier, cible);
    const libelle = ecart === 0 ? "hier" : ecart === 1 ? "avant-hier" : dateCourte(cible);

    const payload = {
      date: cible,
      jour: libelleJour(cible),
      jour_court: jourCourt(cible),
      libelle,
      ca_total: caTotal,
      etablissements: [{ nom: ETAB_NOM, ca: caTotal, couverts }],
      comparaison_j7: { ca: caJ7, variation_pct: varPct(caTotal, caJ7) },
      moyenne_7j,
      serie_7j,
      serie_30j,
      services: { midi: midi != null ? round(midi) : null, soir: soir != null ? round(soir) : null },
      services_30j: anyMS ? { midi: round(midi30), soir: round(soir30) } : { midi: null, soir: null },
      semaine: { ca: caSem, ca_prec: caSemPrec, variation_pct: varPct(caSem, caSemPrec) },
      mois: { ca: caMois, ca_prec: caMoisPrec, variation_pct: varPct(caMois, caMoisPrec), libelle: moisLong(cible) },
      meilleur_jour: meilleur ? { date: meilleur.date, jour: dateCourte(meilleur.date), ca: meilleur.ca } : null,
      categories,
      top_produits,
      top_produit: topProduit,
      ticket_moyen: ticketMoyen,
      couverts,
      part_pizza_pct: partPizza,
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json(payload, {
      headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "unknown_error" }, { status: 500 });
  }
}
