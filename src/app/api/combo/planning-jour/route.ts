import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { getPlannings, COMBO_LOCATIONS, type ComboShift } from "@/lib/combo/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/combo/planning-jour?date=YYYY-MM-DD
 *
 * Les shifts du jour lus directement dans Combo (le planning n'est pas tenu dans l'application).
 * Réponse : { date, source: "combo", shifts: [{ employe, debut, fin, poste }] }, triés par heure de début.
 * Mémoire de 10 minutes par établissement et par jour pour ne pas appeler Combo à chaque ouverture de l'Accueil.
 */

type ShiftJour = { employe: string; debut: string; fin: string; poste: string };
const cache = new Map<string, { quand: number; shifts: ShiftJour[] }>();
const DUREE_CACHE = 10 * 60 * 1000;

const heureParis = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
const capitalise = (s: string) => s.trim().toLowerCase().replace(/(^|[\s-])([a-zà-ÿ])/g, (m) => m.toUpperCase());

export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const date = req.nextUrl.searchParams.get("date") ?? new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "date invalide (YYYY-MM-DD)" }, { status: 400 });

  const { data: etab } = await supabaseAdmin.from("etablissements").select("slug").eq("id", etabId).maybeSingle();
  const slug = (etab?.slug as string | undefined) ?? "";
  const locationId = slug.includes("piccola") ? COMBO_LOCATIONS.piccola : COMBO_LOCATIONS.bello_mio;

  const cle = `${locationId}:${date}`;
  const enMemoire = cache.get(cle);
  if (enMemoire && Date.now() - enMemoire.quand < DUREE_CACHE) {
    return NextResponse.json({ date, source: "combo", shifts: enMemoire.shifts, cache: true });
  }

  let plannings: ComboShift[];
  try {
    plannings = await getPlannings(locationId, date, date);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: `Combo indisponible : ${message}` }, { status: 502 });
  }

  const shifts: ShiftJour[] = plannings
    .filter((p) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date(p.starts_at)) === date)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
    .map((p) => ({
      employe: `${capitalise(p.firstname)} ${p.lastname.toUpperCase()}`.trim(),
      debut: heureParis(p.starts_at),
      fin: heureParis(p.ends_at),
      poste: p.label_name || p.team_name || "",
    }));

  cache.set(cle, { quand: Date.now(), shifts });
  return NextResponse.json({ date, source: "combo", shifts });
}
