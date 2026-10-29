import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Charges Pennylane par mois et par poste (charges_mensuelles), partagées entre Analyse › Marge et
 * Objectifs (29/10/2026). La masse salariale est rattachée au mois travaillé (payée le mois suivant) ;
 * la paie exceptionnelle (PPV, soldes de tout compte) et les pourboires centralisés en sont sortis
 * quand la paie du mois est connue.
 */
export type ChargesMois = {
  postes: Record<string, number>;
  paie_connue: boolean;
  paie_exceptionnelle: number;
  pourboires_paie: number;
};

export const moisPlus = (m: string, n: number) => { const x = new Date(m.slice(0, 7) + "-01T12:00:00"); x.setMonth(x.getMonth() + n); return x.toISOString().slice(0, 7); };
export const dernierJourMois = (m: string) => { const [a, mm] = m.split("-").map(Number); return `${m}-${String(new Date(a, mm, 0).getDate()).padStart(2, "0")}`; };

export async function chargesParMois(etabId: string, moisListe: string[]): Promise<{ parMois: Map<string, ChargesMois>; error: string | null }> {
  if (moisListe.length === 0) return { parMois: new Map(), error: null };
  const premier = moisListe[0], dernier = moisListe[moisListe.length - 1];
  const [{ data: charges, error }, { data: ajustements }] = await Promise.all([
    supabaseAdmin.from("charges_mensuelles").select("mois, poste, montant_ht").eq("etablissement_id", etabId)
      .gte("mois", `${premier}-01`).lte("mois", `${moisPlus(dernier, 1)}-01`),
    supabaseAdmin.from("paie_ajustements").select("mois, type, montant").eq("etablissement_id", etabId)
      .gte("mois", `${premier}-01`).lte("mois", `${dernier}-01`),
  ]);
  if (error) return { parMois: new Map(), error: error.message };
  const brut = new Map<string, Record<string, number>>();
  for (const c of charges ?? []) {
    const m = c.poste === "masse_salariale" ? moisPlus(String(c.mois).slice(0, 7), -1) : String(c.mois).slice(0, 7);
    const p = brut.get(m) ?? {};
    p[c.poste as string] = (p[c.poste as string] ?? 0) + Number(c.montant_ht ?? 0);
    brut.set(m, p);
  }
  const exc = new Map<string, number>(), pourb = new Map<string, number>();
  for (const a of ajustements ?? []) {
    const m = String(a.mois).slice(0, 7), v = Number(a.montant ?? 0);
    if (a.type === "pourboires") pourb.set(m, (pourb.get(m) ?? 0) + v); else exc.set(m, (exc.get(m) ?? 0) + v);
  }
  const parMois = new Map<string, ChargesMois>();
  for (const m of moisListe) {
    const p = { ...(brut.get(m) ?? {}) };
    const connue = (p.masse_salariale ?? 0) > 0;
    const e = connue ? exc.get(m) ?? 0 : 0, pb = connue ? pourb.get(m) ?? 0 : 0;
    if (connue) p.masse_salariale = Math.max(0, p.masse_salariale - e - pb);
    parMois.set(m, { postes: p, paie_connue: connue, paie_exceptionnelle: e, pourboires_paie: pb });
  }
  return { parMois, error: null };
}
