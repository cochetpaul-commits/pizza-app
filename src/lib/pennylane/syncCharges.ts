import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSupplierInvoices, getInvoiceCategories, getSuppliers, getTransactions } from "@/lib/pennylane/api";

/**
 * Rapatrie les factures fournisseurs Pennylane dans charges_mensuelles,
 * ventilées par poste à partir des catégories analytiques réelles du
 * dossier (SARL SASHA / Bello Mio).
 *
 * Règles de rattachement à l'EBE :
 *  - dans l'EBE  : achats, charges externes (dont crédits-bails et
 *    locations, compte 612), impôts & taxes, charges de personnel
 *  - hors EBE    : intérêts d'emprunt et prêts (financier), pénalités
 *    (exceptionnel), TVA (non charge), mouvements de trésorerie
 *    (remises CB/chèques/espèces, virements internes, crédits reçus)
 */

/** Libellé exact de catégorie Pennylane → poste. null = hors EBE. */
const MAPPING: Record<string, string | null> = {
  // ── Achats matières ──
  "Achats cuisine (frais & sec)": "achats_matieres",
  "Achats appoint supermarché": "achats_matieres",
  "Boissons 20 %": "achats_matieres",
  "Boissons 5,5 %": "achats_matieres",
  "Cafétéria (café & thé)": "achats_matieres",
  "Packaging & consommables": "achats_matieres",
  "Consignes": "achats_matieres",

  // ── Personnel ──
  "Masse salariale": "masse_salariale",
  "URSSAF & charges sociales": "masse_salariale",
  "Mutuelle salarié": "masse_salariale",
  "Avantages salariés": "masse_salariale",
  "Médecine du travail & santé": "masse_salariale",
  "Taxe apprentissage & formation": "masse_salariale",
  "Formation professionnelle": "masse_salariale",
  "Repas du personnel": "masse_salariale",
  "Tenues de travail": "masse_salariale",
  "Rémunération des gérants": "remuneration_gerants",

  // ── Loyer ──
  "Loyers": "loyer",
  "Redevance terrasse": "loyer",

  // ── Énergie ──
  "Électricité": "energie",
  "Gaz": "energie",
  "Eau": "energie",

  // ── Encaissement / monétique ──
  "Commissions cartes bancaires": "commissions_cb",
  "Frais monétique": "commissions_cb",
  "Frais bancaires": "commissions_cb",

  // ── Entretien ──
  "Hygiène & entretien": "entretien",
  "Maintenance et réparations": "entretien",
  "Blanchisserie": "entretien",
  "Entretien véhicule": "entretien",

  // ── Assurances ──
  "Assurance": "assurances",

  // ── Honoraires ──
  "Compta & Juridique": "honoraires",

  // ── Locations & crédits-bails (charges externes, dans l'EBE) ──
  "Location TPE": "locations",
  "Location caisse Popina": "locations",
  "Location bouleuse": "locations",
  "Location fourgon Peugeot": "locations",
  "Location Gestion Plus (JDC)": "locations",
  "Location hygiène HACCP (JDC)": "locations",
  "Location planning digital (JDC)": "locations",
  "Location économiseur d'électricité": "locations",
  "Crédit bail machine à café": "locations",
  "Crédit bail équipement pizza": "locations",
  "Crédit-bail four mixte": "locations",
  "Crédit-bail lave-vaisselle": "locations",
  "Crédit-bail pétrin": "locations",
  "Crédits-bails Caisse d'Épargne": "locations",
  "Stockage & logistique": "locations",

  // ── Autres charges d'exploitation ──
  "Téléphone & Internet": "autres_charges",
  "Logiciels & Services Web": "autres_charges",
  "Publicité & com": "autres_charges",
  "SACEM & musique": "autres_charges",
  "Déplacements": "autres_charges",
  "Courrier & fournitures bureau": "autres_charges",
  "Achat Fourniture": "autres_charges",
  "Décoration & fleurs": "autres_charges",
  "Ustensiles de cuisine": "autres_charges",
  "Vaisselle & petit équipement": "autres_charges",
  "Réceptions": "autres_charges",
  "Cotisations professionnelles": "autres_charges",
  "CFE & taxes locales": "autres_charges",
  "Gros équipements & travaux": "autres_charges",
  "En attente de catégorisation": "autres_charges",

  // ── Hors EBE ──
  "Intérêts d'emprunt": null,
  "Prêt immobilier": null,
  "Prêt pergolas": null,
  "Prêt relai cuisine": null,
  "Impôts / TVA": null,
  "Pénalités & amendes": null,
  "Rachat parts SARL LUDO": null,
  "Crédits reçus": null,
  "Remboursement Fournisseur": null,
  "Remise American Express": null,
  "Remise Cartes Bleues": null,
  "Remise Chèques": null,
  "Remise Espèces": null,
  "Remise Titres Restaurant": null,
  "Virement Client": null,
  "Virements internes": null,
};

export const LIBELLES: Record<string, string> = {
  achats_matieres: "Achats matières",
  masse_salariale: "Masse salariale chargée",
  remuneration_gerants: "Rémunération des gérants",
  loyer: "Loyer & redevances",
  energie: "Énergie (électricité, gaz, eau)",
  commissions_cb: "Commissions & frais bancaires",
  entretien: "Hygiène, entretien & maintenance",
  assurances: "Assurances",
  honoraires: "Comptabilité & juridique",
  locations: "Locations & crédits-bails",
  autres_charges: "Autres charges d'exploitation",
  a_categoriser: "À catégoriser dans Pennylane",
};

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");

export type SyncResult = {
  mois: string;
  factures: number;
  postes: Record<string, number>;
  parFournisseur: number;
  nonClassees: number;
  horsEbe: number;
  transactions: number;
  erreurTx?: string | null;
};

/** Synchronise un mois (YYYY-MM-01 → fin de mois). Idempotent. */
export async function syncPennylaneMois(etabId: string, moisDebut: string): Promise<SyncResult> {
  const d = new Date(moisDebut + "T12:00:00Z");
  const fin = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
  const from = moisDebut;
  const to = fin.toISOString().slice(0, 10);

  const [invoices, plSuppliers, { data: appSuppliers }] = await Promise.all([
    getSupplierInvoices(from, to),
    getSuppliers(),
    // Les fournisseurs de la mercuriale : s'ils facturent, c'est de la matière
    supabaseAdmin.from("suppliers").select("name").eq("is_active", true),
  ]);

  const plNameById = new Map(plSuppliers.map(s => [s.id, s.name]));
  const mercuriale = new Set((appSuppliers ?? []).map(s => norm(s.name as string)).filter(n => n.length > 3));

  // Catégories analytiques : un appel par facture, par vagues
  const cats = new Map<number, { label: string; weight?: number }[]>();
  // Rafales modérées : l'API Pennylane limite le débit
  const BATCH = 4;
  for (let i = 0; i < invoices.length; i += BATCH) {
    const lot = invoices.slice(i, i + BATCH);
    const res = await Promise.all(lot.map(inv => getInvoiceCategories(inv.id)));
    lot.forEach((inv, k) => cats.set(inv.id, res[k] as { label: string; weight?: number }[]));
    if (i + BATCH < invoices.length) await new Promise(r => setTimeout(r, 250));
  }

  const totaux = new Map<string, number>();
  let parFournisseur = 0, nonClassees = 0, horsEbe = 0;
  const add = (poste: string, montant: number) => totaux.set(poste, (totaux.get(poste) ?? 0) + montant);

  for (const inv of invoices) {
    const ht = Number(inv.currency_amount_before_tax ?? 0);
    if (!Number.isFinite(ht) || ht === 0) continue;
    const c = cats.get(inv.id) ?? [];

    if (c.length > 0) {
      // Ventilation par poids (Pennylane répartit avec `weight`)
      const totalPoids = c.reduce((s, x) => s + (Number(x.weight) || 1), 0);
      for (const cat of c) {
        const part = ht * ((Number(cat.weight) || 1) / totalPoids);
        const poste = cat.label in MAPPING ? MAPPING[cat.label] : "autres_charges";
        if (poste === null) { horsEbe += part; continue; }
        add(poste, part);
      }
      continue;
    }

    // Sans catégorie : un fournisseur de la mercuriale = achats matières
    const nomFournisseur = inv.supplier?.id ? plNameById.get(inv.supplier.id) ?? "" : "";
    const n = norm(nomFournisseur);
    const estMatiere = n.length > 3 && [...mercuriale].some(m => n.includes(m) || m.includes(n));
    if (estMatiere) { add("achats_matieres", ht); parFournisseur++; }
    else { add("a_categoriser", ht); nonClassees++; }
  }

  // ── Charges sans facture (salaires, URSSAF, prélèvements) ──
  // Transactions catégorisées, en sortie, et NON rapprochées à une
  // facture — sinon la charge serait comptée deux fois.
  let transactionsPrises = 0;
  let erreurTx: string | null = null;
  // ATTENTION double comptage : les achats et charges avec facture sont
  // déjà comptés plus haut. On ne prend ici QUE les postes de personnel,
  // qui n'ont jamais de facture fournisseur (virements de paie, URSSAF).
  const ACCEPTES = ["masse_salariale", "remuneration_gerants"];
  try {
    const txs = await getTransactions(from, to);
    for (const t of txs) {
      const montant = Number(t.amount ?? 0);
      if (!(montant < 0)) continue;
      const cats = t.categories ?? [];
      if (cats.length === 0) continue;
      const ht = Math.abs(montant);
      const totalPoids = cats.reduce((s2, x) => s2 + (Number(x.weight) || 1), 0);
      for (const c of cats) {
        const label = c.label ?? "";
        const poste = label in MAPPING ? MAPPING[label] : null;
        if (poste === null || !ACCEPTES.includes(poste)) continue;
        add(poste, ht * ((Number(c.weight) || 1) / totalPoids));
        transactionsPrises++;
      }
    }
  } catch (e) { erreurTx = e instanceof Error ? e.message : "erreur transactions"; }

  // Remplacement des lignes Pennylane du mois
  await supabaseAdmin
    .from("charges_mensuelles").delete()
    .eq("etablissement_id", etabId).eq("mois", moisDebut).eq("source", "pennylane");

  const rows = [...totaux.entries()]
    .filter(([, m]) => Math.abs(m) > 0.5)
    .map(([poste, montant]) => ({
      etablissement_id: etabId,
      mois: moisDebut,
      poste,
      libelle: LIBELLES[poste] ?? poste,
      montant_ht: Math.round(montant * 100) / 100,
      source: "pennylane",
      note: `${invoices.length} factures`,
    }));

  if (rows.length > 0) {
    const { error } = await supabaseAdmin.from("charges_mensuelles").insert(rows);
    if (error) throw new Error(`Écriture charges : ${error.message}`);
  }

  return {
    mois: moisDebut,
    factures: invoices.length,
    postes: Object.fromEntries([...totaux.entries()].map(([k, v]) => [k, Math.round(v)])),
    parFournisseur,
    nonClassees,
    horsEbe: Math.round(horsEbe),
    transactions: transactionsPrises,
    erreurTx,
  };
}
