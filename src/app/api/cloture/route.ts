import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculerCloture, noteManquante, type SaisieCloture } from "@/lib/cloture";
import { accesCloture } from "./acces";

export const runtime = "nodejs";

/**
 * Clôture de caisse du soir (10/10/2026).
 * GET ?jour=YYYY-MM-DD : la clôture du jour (saisie, verdict, corrections), les transactions
 *     Flatpay déjà importées pour ce jour. GET ?historique=1 : les 60 dernières clôtures.
 * PUT { jour, saisie, corrections, notes, valider? } : enregistre (le verdict est recalculé ici) ;
 *     « valider » n'est accepté que si la caisse tombe juste.
 */
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: NextRequest) {
  const a = await accesCloture(req);
  if ("erreur" in a) return a.erreur;
  if (req.nextUrl.searchParams.get("historique")) {
    const { data, error } = await supabaseAdmin.from("clotures")
      .select("jour, niveau, statut, pourboires_paie, corrections, validee_at, updated_at, resultat")
      .eq("etablissement_id", a.etabId).order("jour", { ascending: false }).limit(60);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ clotures: data ?? [] });
  }
  const jour = req.nextUrl.searchParams.get("jour") ?? "";
  if (!JOUR.test(jour)) return NextResponse.json({ error: "jour requis (AAAA-MM-JJ)" }, { status: 400 });
  const [{ data: cloture }, { data: tx }] = await Promise.all([
    supabaseAdmin.from("clotures").select("*").eq("etablissement_id", a.etabId).eq("jour", jour).maybeSingle(),
    supabaseAdmin.from("flatpay_transactions").select("horodatage, jour, mode, type_carte, montant_centimes, statut, operation, terminal, emetteur, source")
      .eq("etablissement_id", a.etabId).eq("jour", jour).order("horodatage"),
  ]);
  return NextResponse.json({
    cloture: cloture ?? null,
    transactions: (tx ?? []).map((t) => ({
      horodatage: t.horodatage, jour: t.jour, mode: t.mode, typeCarte: t.type_carte ?? "", montant: (t.montant_centimes as number) / 100,
      statut: t.statut ?? "", operation: t.operation ?? "", terminal: t.terminal, emetteur: t.emetteur, source: t.source,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const a = await accesCloture(req);
  if ("erreur" in a) return a.erreur;
  const body = await req.json().catch(() => null) as { jour?: string; saisie?: SaisieCloture; corrections?: string[]; notes?: string | null; valider?: boolean } | null;
  if (!body?.jour || !JOUR.test(body.jour) || !body.saisie?.z || !body.saisie.popina || !body.saisie.tiroir) return NextResponse.json({ error: "jour et saisie requis" }, { status: 400 });
  const { data: existante } = await supabaseAdmin.from("clotures").select("statut").eq("etablissement_id", a.etabId).eq("jour", body.jour).maybeSingle();
  // Un ajustement en « prix sur mesure » est déclaré par l'équipe (bouton dans l'écran) : la note de correction
  // est alors obligatoire pour valider (règle de Paul, 14/10/2026)
  const saisie: SaisieCloture = { ...body.saisie, ajustement: typeof body.saisie.ajustement === "number" ? body.saisie.ajustement : null };
  const resultat = calculerCloture(saisie);
  const corrections = (body.corrections ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 50);
  if (body.valider && resultat.niveau !== "ok") return NextResponse.json({ error: "La caisse ne tombe pas juste : corrige d'abord l'écart, puis recopie les montants Popina." }, { status: 400 });
  if (body.valider && noteManquante(resultat, corrections)) return NextResponse.json({ error: "Note la correction en prix sur mesure (la table et le montant) avant de valider." }, { status: 400 });
  if (body.valider && resultat.manquePourValider.length) return NextResponse.json({ error: `Pour valider, il manque ${resultat.manquePourValider.join(" et ")}.` }, { status: 400 });
  const maintenant = new Date().toISOString();
  const ligne = {
    etablissement_id: a.etabId, jour: body.jour, saisie, resultat, niveau: resultat.niveau,
    corrections,
    notes: body.notes?.trim() || null, pourboires_paie: resultat.niveau === "vide" ? null : resultat.pourboiresPaie,
    updated_by: a.userId, updated_at: maintenant,
    ...(body.valider ? { statut: "validee", validee_at: maintenant } : existante?.statut === "validee" && resultat.niveau !== "ok" ? { statut: "en_cours", validee_at: null } : {}),
    ...(existante ? {} : { created_by: a.userId }),
  };
  const { data, error } = await supabaseAdmin.from("clotures").upsert(ligne, { onConflict: "etablissement_id,jour" }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ cloture: data });
}
