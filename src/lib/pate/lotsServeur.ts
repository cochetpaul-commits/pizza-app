import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { calculerPate, type EmpatementType, type FlourMixItem, type PateResult } from "@/lib/pateEngine";
import { calculerTb, lireEtapesFournee, type EtapeFournee, type LotPourTb, type TbCalculee } from "@/lib/pate/fournee";

/** Côté serveur (02/11/2026) : lecture d'une recette de pâte, calcul figé, TB du moment. Partagé par les routes /api/pate. */
export type RecetteLigne = Record<string, unknown> & { id: string; name: string; type: string };

const n = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };

export function typeRecette(r: RecetteLigne): EmpatementType {
  const t = String(r.type ?? "direct");
  return t === "biga" || t === "focaccia" ? t : "direct";
}

export function calculRecette(r: RecetteLigne, nbPatons: number, poidsPaton?: number): PateResult {
  let mix: FlourMixItem[] = [];
  try { mix = (typeof r.flour_mix === "string" ? JSON.parse(r.flour_mix) : r.flour_mix) as FlourMixItem[]; } catch { mix = []; }
  return calculerPate({
    type: typeRecette(r), nbPatons, poidsPaton: poidsPaton ?? n(r.ball_weight, 260),
    recipe: {
      hydration_total: n(r.hydration_total, 65), salt_percent: n(r.salt_percent), honey_percent: n(r.honey_percent), oil_percent: n(r.oil_percent),
      yeast_percent: n(r.yeast_percent), biga_yeast_percent: n(r.biga_yeast_percent) || 0.5, biga_percent: n(r.biga_percent) || 50, biga_hydration: n(r.biga_hydration) || 45,
      biga_flour: (r.biga_flour as string | null) ?? null, water_start_pct: r.water_start_pct == null ? 80 : n(r.water_start_pct), loss_margin_pct: n(r.loss_margin_pct), mixer_max_balls: n(r.mixer_max_balls),
    },
    flourMix: Array.isArray(mix) && mix.length ? mix : undefined,
  });
}

export function etapesRecette(r: RecetteLigne): EtapeFournee[] {
  return lireEtapesFournee(r.etapes_fournee, typeRecette(r));
}

/** Ce qui est figé dans le lot : paramètres, pesées, étapes, fenêtre des bacs */
export function recetteFigee(r: RecetteLigne, calcul: PateResult) {
  return {
    recette: {
      name: r.name, type: typeRecette(r), hydration_total: n(r.hydration_total), salt_percent: n(r.salt_percent), honey_percent: n(r.honey_percent), oil_percent: n(r.oil_percent),
      yeast_percent: n(r.yeast_percent), biga_percent: n(r.biga_percent), biga_hydration: n(r.biga_hydration), biga_yeast_percent: n(r.biga_yeast_percent), biga_flour: r.biga_flour ?? null,
      water_start_pct: r.water_start_pct, loss_margin_pct: r.loss_margin_pct, flour_mix: r.flour_mix ?? [], tb_manuelle: n(r.tb_manuelle, 56),
      fenetre_bacs_min_h: r.fenetre_bacs_min_h ?? null, fenetre_bacs_max_h: r.fenetre_bacs_max_h ?? null,
    },
    calcul,
    etapes: etapesRecette(r),
  };
}

/** TB du moment pour un type de pâte : lots clôturés de l'établissement, valeur manuelle de la recette en secours */
export async function tbDuMoment(etabId: string, type: EmpatementType, tbManuelle: number | null | undefined): Promise<TbCalculee> {
  const { data } = await supabaseAdmin
    .from("pate_lots")
    .select("type, t_farine, t_cuisine, t_eau_utilisee, t_biga, t_pate_sortie, cloture_at")
    .eq("etablissement_id", etabId).eq("statut", "cloture").eq("type", type)
    .order("cloture_at", { ascending: false }).limit(30);
  const lots = ((data ?? []) as Record<string, unknown>[]).map((l): LotPourTb => ({
    type: l.type === "biga" ? "biga" : "direct",
    t_farine: l.t_farine == null ? null : Number(l.t_farine), t_cuisine: l.t_cuisine == null ? null : Number(l.t_cuisine),
    t_eau_utilisee: l.t_eau_utilisee == null ? null : Number(l.t_eau_utilisee), t_biga: l.t_biga == null ? null : Number(l.t_biga),
    t_pate_sortie: l.t_pate_sortie == null ? null : Number(l.t_pate_sortie), cloture_at: (l.cloture_at as string | null) ?? null,
  }));
  return calculerTb(lots, type, tbManuelle);
}

export async function chargerLot(id: string, etabId: string) {
  const [{ data: lot }, { data: etapes }] = await Promise.all([
    supabaseAdmin.from("pate_lots").select("*").eq("id", id).eq("etablissement_id", etabId).maybeSingle(),
    supabaseAdmin.from("pate_lot_etapes").select("*").eq("lot_id", id).order("ordre"),
  ]);
  return lot ? { ...lot, etapes: etapes ?? [] } : null;
}
