import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { EtabError } from "@/lib/getEtablissement";
import { acteurPate } from "@/lib/pate/acces";
import { chargerLot, tbDuMoment } from "@/lib/pate/lotsServeur";
import { alertePate, conseilEau, eauBiga, eauPetrissage } from "@/lib/pate/fournee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (v: unknown): number | null => { if (v === "" || v == null) return null; const x = Number(v); return Number.isFinite(x) ? x : null; };
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  let acteur;
  try { acteur = await acteurPate(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { id } = await ctx.params;
  const lot = await chargerLot(id, acteur.etabId);
  if (!lot) return NextResponse.json({ error: "Lot introuvable" }, { status: 404 });
  const tb = await tbDuMoment(acteur.etabId, lot.type === "biga" ? "biga" : "direct", Number(lot.recette_figee?.recette?.tb_manuelle ?? 56));
  return NextResponse.json({ lot, tb, acteur: { nom: acteur.nom, peutLancer: acteur.peutLancer, source: acteur.source } });
}

/**
 * PATCH /api/pate/lots/[id] { action, ... }
 * temps_biga { t_farine, t_cuisine } · biga_froid { t_eau_utilisee?, t_biga_sortie? } · temps_final { t_farine, t_cuisine, t_biga? }
 * etape { etape_id, demarre?: true, termine?: true } · cloture { voile_ok, t_pate_sortie, t_eau_utilisee?, commentaire? }
 * essai { essai, essai_variable?, essai_valeur?, essai_evaluation? } · commentaire { commentaire } · annuler
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  let acteur;
  try { acteur = await acteurPate(req); } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const { id } = await ctx.params;
  const lot = await chargerLot(id, acteur.etabId);
  if (!lot) return NextResponse.json({ error: "Lot introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  const ferme = lot.statut === "cloture" || lot.statut === "annule";
  const maintenant = new Date().toISOString();
  const maj: Record<string, unknown> = { updated_at: maintenant };
  const type = lot.type === "biga" ? "biga" : "direct";

  if (ferme && action !== "essai" && action !== "commentaire" && action !== "corriger") return NextResponse.json({ error: "Ce lot est clôturé." }, { status: 409 });

  if (action === "temps_biga") {
    const tf = num(body.t_farine), tc = num(body.t_cuisine);
    if (tf == null || tc == null) return NextResponse.json({ error: "Températures de la farine et de la cuisine attendues." }, { status: 400 });
    const eau = eauBiga(tf, tc);
    Object.assign(maj, { t_farine_biga: tf, t_cuisine_biga: tc, t_eau_biga_calc: eau });
  } else if (action === "biga_froid") {
    if (type !== "biga") return NextResponse.json({ error: "Pas de biga sur une pâte directe." }, { status: 400 });
    Object.assign(maj, { biga_froid_at: maintenant, statut: "biga_au_froid", t_eau_biga_utilisee: num(body.t_eau_utilisee) ?? lot.t_eau_biga_calc ?? null, t_biga_sortie: num(body.t_biga_sortie) });
  } else if (action === "temps_final") {
    const tf = num(body.t_farine), tc = num(body.t_cuisine), tb_ = num(body.t_biga);
    if (tf == null || tc == null || (type === "biga" && tb_ == null)) return NextResponse.json({ error: "Températures de la farine, de la cuisine et de la biga attendues." }, { status: 400 });
    const tb = await tbDuMoment(acteur.etabId, type, Number(lot.recette_figee?.recette?.tb_manuelle ?? 56));
    const eau = eauPetrissage(tb.tb, tf, tc, type === "biga" ? tb_ : null);
    Object.assign(maj, { t_farine: tf, t_cuisine: tc, t_biga: type === "biga" ? tb_ : null, tb_utilisee: tb.tb, tb_source: tb.source, t_eau_calc: eau, statut: "petrissage", petrissage_debut_at: lot.petrissage_debut_at ?? maintenant });
    // Le chrono démarre avec la vitesse 1 (04/11/2026) : un seul chrono continu pour tout le pétrissage
    if (body.demarrer_chrono === true) Object.assign(maj, { chrono_debut_at: maintenant, chrono_avance: 0, petrissage_fin_at: null });
  } else if (action === "confirmer_biga") {
    maj.biga_confirmee = true;
  } else if (action === "demarrer_chrono") {
    if (lot.t_eau_calc == null) return NextResponse.json({ error: "Températures du pétrissage d'abord." }, { status: 400 });
    Object.assign(maj, { chrono_debut_at: maintenant, chrono_avance: 0, petrissage_fin_at: null });
  } else if (action === "avancer") {
    const i = Math.max(0, Math.min(50, Math.round(Number(body.index) || 0)));
    maj.chrono_avance = Math.max(Number(lot.chrono_avance ?? 0), i);
  } else if (action === "fin_petrissage") {
    if (!lot.chrono_debut_at) return NextResponse.json({ error: "Le chrono n'a pas été lancé." }, { status: 400 });
    maj.petrissage_fin_at = maintenant;
    // Les étapes du pétrissage sont faites : on les horodate pour l'historique
    await supabaseAdmin.from("pate_lot_etapes").update({ termine_at: maintenant, valide_par: acteur.employeId, valide_par_nom: acteur.nom }).eq("lot_id", id).eq("phase", "final").is("termine_at", null);
  } else if (action === "etape") {
    const etapeId = String(body.etape_id ?? "");
    const etape = (lot.etapes as { id: string }[]).find((e) => e.id === etapeId);
    if (!etape) return NextResponse.json({ error: "Étape introuvable" }, { status: 404 });
    const majEtape: Record<string, unknown> = {};
    if (body.demarre === true) majEtape.demarre_at = maintenant;
    if (body.termine === true) { majEtape.termine_at = maintenant; majEtape.valide_par = acteur.employeId; majEtape.valide_par_nom = acteur.nom; }
    if (body.reprendre === true) { majEtape.demarre_at = null; majEtape.termine_at = null; }
    const { error } = await supabaseAdmin.from("pate_lot_etapes").update(majEtape).eq("id", etapeId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (action === "cloture") {
    if (!acteur.peutLancer) return NextResponse.json({ error: "Clôturer un lot est réservé aux pizzaiolos formés et aux responsables." }, { status: 403 });
    const t = num(body.t_pate_sortie);
    if (body.voile_ok !== true) return NextResponse.json({ error: "Le test du voile doit être coché avant de clôturer." }, { status: 400 });
    if (t == null) return NextResponse.json({ error: "La température de la pâte en sortie de pétrin est obligatoire." }, { status: 400 });
    Object.assign(maj, {
      voile_ok: true, t_pate_sortie: t, t_eau_utilisee: num(body.t_eau_utilisee) ?? lot.t_eau_calc ?? null,
      eau_bassinage_restante_g: num(body.eau_bassinage_restante_g),
      commentaire: typeof body.commentaire === "string" ? body.commentaire.trim() || null : lot.commentaire,
      statut: "cloture", boulage_at: maintenant, cloture_at: maintenant,
    });
  } else if (action === "essai") {
    Object.assign(maj, {
      essai: body.essai === true, essai_variable: String(body.essai_variable ?? "").trim() || null, essai_valeur: String(body.essai_valeur ?? "").trim() || null,
      ...(body.essai_evaluation && typeof body.essai_evaluation === "object" ? { essai_evaluation: body.essai_evaluation } : {}),
    });
  } else if (action === "revenir") {
    // Défaire la dernière action (02/11/2026) : l'étape validée la plus récente, sinon la dernière bascule de phase
    type E = { id: string; phase: string; ordre: number; termine_at: string | null };
    const etapes = (lot.etapes as E[]);
    const phase = lot.statut === "biga_en_cours" ? "biga" : "final";
    const faites = etapes.filter((e) => e.phase === phase && e.termine_at).sort((a, b) => b.ordre - a.ordre);
    if (phase === "final" && lot.petrissage_fin_at) {
      // Fin du pétrissage appuyée trop tôt : le chrono reprend là où il en était
      maj.petrissage_fin_at = null;
      await supabaseAdmin.from("pate_lot_etapes").update({ termine_at: null, valide_par: null, valide_par_nom: null }).eq("lot_id", id).eq("phase", "final").gte("termine_at", lot.petrissage_fin_at);
    } else if (phase === "final" && Number(lot.chrono_avance ?? 0) > 0) {
      maj.chrono_avance = Number(lot.chrono_avance) - 1;
    } else if (phase === "final" && lot.chrono_debut_at) {
      // Chrono lancé trop tôt : retour à la mise en place, températures gardées
      Object.assign(maj, { chrono_debut_at: null, chrono_avance: 0 });
    } else if (faites.length) {
      const { error } = await supabaseAdmin.from("pate_lot_etapes").update({ termine_at: null, demarre_at: null, valide_par: null, valide_par_nom: null }).eq("id", faites[0].id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else if (phase === "final" && lot.t_eau_calc != null) {
      Object.assign(maj, { t_farine: null, t_cuisine: null, t_biga: null, t_eau_calc: null, tb_utilisee: null, tb_source: null, petrissage_debut_at: null, statut: type === "biga" ? "biga_au_froid" : "petrissage" });
    } else if (phase === "final" && type === "biga" && lot.statut === "biga_au_froid") {
      // Biga mise au froid trop tôt : retour à la biga, sa dernière étape rouverte
      Object.assign(maj, { statut: "biga_en_cours", biga_froid_at: null });
      const derniere = etapes.filter((e) => e.phase === "biga" && e.termine_at).sort((a, b) => b.ordre - a.ordre)[0];
      if (derniere) await supabaseAdmin.from("pate_lot_etapes").update({ termine_at: null, demarre_at: null, valide_par: null, valide_par_nom: null }).eq("id", derniere.id);
    } else if (phase === "biga" && lot.t_eau_biga_calc != null) {
      Object.assign(maj, { t_farine_biga: null, t_cuisine_biga: null, t_eau_biga_calc: null });
    } else {
      return NextResponse.json({ error: "Rien à défaire." }, { status: 400 });
    }
  } else if (action === "corriger") {
    // Correction après coup : heure de mise au froid, température de sortie de la biga, eau utilisée
    if (body.biga_froid_at !== undefined) {
      const d = new Date(String(body.biga_froid_at));
      if (Number.isNaN(d.getTime()) || d.getTime() > Date.now() + 5 * 60000) return NextResponse.json({ error: "Heure invalide" }, { status: 400 });
      maj.biga_froid_at = d.toISOString();
    }
    if (body.t_biga_sortie !== undefined) maj.t_biga_sortie = num(body.t_biga_sortie);
    if (body.t_eau_biga_utilisee !== undefined) maj.t_eau_biga_utilisee = num(body.t_eau_biga_utilisee);
  } else if (action === "commentaire") {
    maj.commentaire = String(body.commentaire ?? "").trim() || null;
  } else if (action === "annuler") {
    if (!acteur.peutLancer) return NextResponse.json({ error: "Annuler un lot est réservé aux pizzaiolos formés et aux responsables." }, { status: 403 });
    Object.assign(maj, { statut: "annule", cloture_at: maintenant, commentaire: String(body.commentaire ?? "").trim() || lot.commentaire });
  } else {
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  }

  if (Object.keys(maj).length > 1) {
    const { error } = await supabaseAdmin.from("pate_lots").update(maj).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const apres = await chargerLot(id, acteur.etabId);
  const tb = await tbDuMoment(acteur.etabId, type, Number(lot.recette_figee?.recette?.tb_manuelle ?? 56));
  const conseils = {
    eau_biga: apres?.t_eau_biga_calc != null ? conseilEau(Number(apres.t_eau_biga_calc)) : null,
    eau: apres?.t_eau_calc != null ? conseilEau(Number(apres.t_eau_calc)) : null,
    pate: apres?.t_pate_sortie != null ? alertePate(Number(apres.t_pate_sortie)) : null,
  };
  return NextResponse.json({ lot: apres, tb, conseils });
}
