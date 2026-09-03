import type { KeziaDaily } from "@/lib/kezia/keziaParser";

/**
 * Ligne `daily_sales` (source kezia_pdf) construite à partir d'un journal parsé.
 * Une seule fabrique pour l'import automatique (/api/cron/kezia-ingest), le
 * bouton d'import manuel (/api/kezia) et le script de relecture, afin que
 * toutes les écritures aient exactement le même format que l'historique :
 *
 *  - `rayons` : objet `{ rayons: [{ nom, qte, ca_ht, ca_ttc, marge, taux_marque, repartition }], total: {…} }`,
 *    taux et répartition EN POURCENTAGE dans le jsonb (23.76), pas en fraction ;
 *  - `taux_marque` (colonne numeric(5,4)) : en fraction (0.2044) ;
 *  - `reglements` : un objet par mode non nul `{ ESPECES: { montant, qte, remboursement? } }` ;
 *  - `tva_details` : `[{ taux, montant, base_ht, base_ttc }]` ;
 *  - `updated_at` renseigné à chaque écriture ; `raw_text` conservé (a permis de
 *    reconstruire des journées perdues).
 */
export function keziaDailyRow(parsed: KeziaDaily, rawText: string) {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  const rayons = parsed.rayons.map((r) => ({
    nom: r.name,
    qte: r3(r.qty),
    ca_ht: r2(r.ca_ht),
    ca_ttc: r2(r.ca_ttc),
    marge: r2(r.marge),
    taux_marque: r2(r.marge_pct * 100),
    repartition: r2(r.repart_pct * 100),
  }));
  const total = {
    qte: r3(rayons.reduce((a, r) => a + r.qte, 0)),
    ca_ht: r2(rayons.reduce((a, r) => a + r.ca_ht, 0)),
    ca_ttc: r2(rayons.reduce((a, r) => a + r.ca_ttc, 0)),
    marge: r2(rayons.reduce((a, r) => a + r.marge, 0)),
  };
  return {
    ca_ttc: r2(parsed.ca_ttc),
    ca_ht: r2(parsed.ca_ht),
    tva_total: r2(parsed.tva_total),
    tickets: parsed.tickets,
    couverts: parsed.couverts,
    panier_moyen: r2(parsed.panier_moyen),
    especes: r2(parsed.especes),
    cartes: r2(parsed.cartes),
    cheques: r2(parsed.cheques),
    virements: r2(parsed.virements),
    marge_total: r2(parsed.marge_total),
    taux_marque: Math.round(parsed.taux_marque * 10000) / 10000,
    rayons: { rayons, total },
    tva_details: parsed.tva_details.map((t) => ({ taux: t.taux, montant: r2(t.montant), base_ht: r2(t.base_ht), base_ttc: r2(t.base_ttc) })),
    reglements: parsed.reglements,
    raw_text: rawText,
    updated_at: new Date().toISOString(),
  };
}

/** Récapitulatif mensuel (« JOURNAL_SYNTHESE_MENSUEL ») : DEBUT ≠ FIN. Ne doit jamais devenir une journée. */
export function estRecapMensuel(parsed: KeziaDaily, filename = ""): boolean {
  if (/MENSUEL/i.test(filename)) return true;
  return !!parsed.date_debut && !!parsed.date_fin && parsed.date_debut !== parsed.date_fin;
}
