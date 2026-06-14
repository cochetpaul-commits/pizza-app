// app/api/widget/ca/route.ts
//
// API du widget Scriptable + dashboard web "CA — Bello Mio".
//
// Source de données : table `ventes_lignes` (lignes Popina), agrégée par jour
// via la vue SQL `v_ca_journalier` (déjà créée dans Supabase) + la fonction
// `top_produit_jour`. Le widget ne touche jamais Supabase directement : tout
// passe par cette route, côté serveur, avec la clé service_role.
//
// Renvoie le dernier jour d'exploitation disponible (≤ hier — l'import Popina
// a souvent 1-2 jours de retard), avec comparaison J-7, séries 7 j / 30 j,
// moyenne 7 j, split midi/soir, top produit et infos du service.
//
// Variables d'env Vercel requises :
//   - WIDGET_TOKEN              = 9e929172a974d541b2d8636877aeadb2  (ou le tien)
//   - SUPABASE_SERVICE_ROLE_KEY = (Supabase → Settings → API → service_role)
//   - NEXT_PUBLIC_SUPABASE_URL  = https://qdraedqtdlcjqlbxksqt.supabase.co
//
// Test : https://<app>.vercel.app/api/widget/ca?token=9e929172a974d541b2d8636877aeadb2

import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// --- Établissement (Bello Mio). Piccola Mia n'a pas encore de ventes_lignes. ---
const ETAB_ID = "93dddd48-21f5-44e9-83aa-024af53bce83";
const ETAB_NOM = "Bello Mio";

// --- Types -----------------------------------------------------------------

interface PointSerie { date: string; label: string; ca: number; }
interface WidgetPayload {
  date: string;
  jour: string;
  jour_court: string;
  libelle: string; // "hier" / "avant-hier" / "ven. 12 juin"
  ca_total: number;
  etablissements: { nom: string; ca: number; couverts: number | null }[];
  comparaison_j7: { ca: number | null; variation_pct: number | null };
  moyenne_7j: number | null;
  serie_7j: PointSerie[];
  serie_30j: PointSerie[];
  services: { midi: number | null; soir: number | null };
  top_produit: string | null;
  ticket_moyen: number | null;
  couverts: number | null;
  part_pizza_pct: number | null;
  updated_at: string;
}

interface VueRow {
  date_service: string;
  ca_ttc: number | string | null;
  ca_pizza: number | string | null;
  ca_midi: number | string | null;
  ca_soir: number | string | null;
  tickets: number | null;
  couverts: number | null;
}

// --- Helpers ---------------------------------------------------------------

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
}
function round(n: number, d = 2): number { const f = 10 ** d; return Math.round(n * f) / f; }

// Date locale Paris décalée de `offset` jours, au format YYYY-MM-DD.
function dateISO(offset: number): string {
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  paris.setDate(paris.getDate() + offset);
  return `${paris.getFullYear()}-${String(paris.getMonth() + 1).padStart(2, "0")}-${String(paris.getDate()).padStart(2, "0")}`;
}
function dateUTC(iso: string): Date { const [y, m, d] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
// Ajoute `delta` jours à une date ISO.
function addDays(iso: string, delta: number): string {
  const d = dateUTC(iso); d.setUTCDate(d.getUTCDate() + delta);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}
// Nombre de jours entre deux dates ISO (a - b).
function diffJours(a: string, b: string): number {
  return Math.round((dateUTC(a).getTime() - dateUTC(b).getTime()) / 86400000);
}
function libelleJour(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(dateUTC(iso));
}
function jourCourt(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", timeZone: "UTC" }).format(dateUTC(iso));
}
function dateCourte(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(dateUTC(iso));
}
function initialeJour(iso: string): string {
  return ["D", "L", "M", "M", "J", "V", "S"][dateUTC(iso).getUTCDay()];
}

// --- Handler ---------------------------------------------------------------

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!process.env.WIDGET_TOKEN || token !== process.env.WIDGET_TOKEN) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    const hier = dateISO(-1);
    const debut = dateISO(-40); // marge pour couvrir le J-7 du dernier jour dispo

    const { data, error } = await supabase
      .from("v_ca_journalier")
      .select("date_service, ca_ttc, ca_pizza, ca_midi, ca_soir, tickets, couverts")
      .eq("etablissement_id", ETAB_ID)
      .gte("date_service", debut)
      .lte("date_service", hier)
      .order("date_service", { ascending: true });

    if (error) throw new Error(error.message);
    const rows = (data ?? []) as VueRow[];
    if (!rows.length) return NextResponse.json({ error: "no_data" }, { status: 404 });

    const map = new Map<string, VueRow>();
    rows.forEach((r) => map.set(r.date_service, r));
    const caJour = (iso: string) => num(map.get(iso)?.ca_ttc) ?? 0;

    // Dernier jour d'exploitation disponible (≤ hier).
    const cible = rows[rows.length - 1].date_service;
    const cibleRow = map.get(cible)!;

    const caTotal = round(num(cibleRow.ca_ttc) ?? 0);
    const couverts = cibleRow.couverts ?? null;
    const tickets = cibleRow.tickets ?? null;
    const caPizza = num(cibleRow.ca_pizza);
    const midi = num(cibleRow.ca_midi);
    const soir = num(cibleRow.ca_soir);

    // Ticket moyen = dépense par couvert (sinon par addition).
    const ticketMoyen =
      couverts && couverts > 0 ? round(caTotal / couverts, 1)
      : tickets && tickets > 0 ? round(caTotal / tickets, 1)
      : null;

    const partPizza = caPizza != null && caTotal > 0 ? Math.round((caPizza / caTotal) * 100) : null;

    // Comparaison J-7
    const isoJ7 = addDays(cible, -7);
    const caJ7raw = round(caJour(isoJ7));
    const caJ7 = caJ7raw > 0 ? caJ7raw : null;
    const variationPct = caJ7 != null ? round(((caTotal - caJ7) / caJ7) * 100, 1) : null;

    // Séries finissant sur le jour cible
    const serie = (depuis: number): PointSerie[] => {
      const out: PointSerie[] = [];
      for (let off = depuis; off <= 0; off++) {
        const iso = addDays(cible, off);
        out.push({ date: iso, label: initialeJour(iso), ca: round(caJour(iso)) });
      }
      return out;
    };
    const serie_7j = serie(-6);
    const serie_30j = serie(-29);

    const ouverts = serie_7j.filter((p) => p.ca > 0);
    const moyenne_7j = ouverts.length ? round(ouverts.reduce((a, p) => a + p.ca, 0) / ouverts.length) : null;

    // Top produit du jour cible
    let topProduit: string | null = null;
    try {
      const { data: tp } = await supabase.rpc("top_produit_jour", { p_etab: ETAB_ID, p_date: cible });
      if (typeof tp === "string") topProduit = tp;
    } catch (e) { /* non bloquant */ }

    // Libellé relatif
    const ecart = diffJours(hier, cible); // 0 = hier, 1 = avant-hier, ...
    const libelle = ecart === 0 ? "hier" : ecart === 1 ? "avant-hier" : dateCourte(cible);

    const payload: WidgetPayload = {
      date: cible,
      jour: libelleJour(cible),
      jour_court: jourCourt(cible),
      libelle,
      ca_total: caTotal,
      etablissements: [{ nom: ETAB_NOM, ca: caTotal, couverts }],
      comparaison_j7: { ca: caJ7, variation_pct: variationPct },
      moyenne_7j,
      serie_7j,
      serie_30j,
      services: { midi: midi != null ? round(midi) : null, soir: soir != null ? round(soir) : null },
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
