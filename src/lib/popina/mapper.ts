// src/lib/popina/mapper.ts
// Convertit les Orders Popina (API) en rows pour la table ventes_lignes.

import type { PopinaOrder, PopinaOrderItem, PopinaPayment } from "@/lib/popinaClient";

export type VentesLigneRow = {
  etablissement_id: string;
  ouvert_a: string | null;
  ferme_a: string | null;
  date_service: string;
  service: "midi" | "soir";
  salle: string;
  table_num: string;
  couverts: number;
  num_fiscal: string;
  statut: string;
  client: string;
  operateur: string;
  categorie: string;
  sous_categorie: string;
  type_ligne: "Produit" | "Paiement";
  description: string;
  menu: string;
  quantite: number;
  tarification: string;
  annule: boolean;
  raison_annulation: string;
  perdu: boolean;
  raison_perte: string;
  transfere: boolean;
  taux_tva: string;
  prix_unitaire: number;
  remise_totale: number;
  ttc: number;
  tva: number;
  ht: number;
  import_file: string;
};

const PARIS_FMT = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" });

function parisHour(iso: string | undefined | null): number {
  if (!iso) return 12;
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(new Date(iso));
  return parseInt(s, 10);
}

function parisDay(iso: string | undefined | null): string | null {
  if (!iso) return null;
  return PARIS_FMT.format(new Date(iso));
}

function fmtTauxTva(taxRate: number | undefined | null): string {
  // taxRate Popina = en millièmes (1000 = 10%, 2000 = 20%)
  if (taxRate == null || taxRate === 0) return "";
  const pct = taxRate / 100;
  // Format CSV existant: "10,00 %" (espace insécable)
  return `${pct.toFixed(2).replace(".", ",")} %`;
}

function cents(v: number | undefined | null): number {
  return Number(((v ?? 0) / 100).toFixed(2));
}

/** Convertit un order Popina en lignes ventes_lignes (items + paiements) */
export function orderToVentesLignes(
  order: PopinaOrder,
  etablissement_id: string,
  date_service: string,
  import_file: string,
): VentesLigneRow[] {
  const ouvert_a = order.openedAt ?? null;
  const ferme_a = order.closedAt ?? null;
  const service: "midi" | "soir" = parisHour(ouvert_a) < 17 ? "midi" : "soir";
  const salle = order.orderPlace ?? "";
  const table_num = ""; // Popina ne renvoie pas de num de table
  const couverts = order.guests ?? 0;
  const num_fiscal = order.orderNumber ?? "";
  const operateur = order.operatorName ?? "";
  const orderCanceled = !!order.isCanceled;
  const orderTransferred = !!order.isTransferred;

  const rows: VentesLigneRow[] = [];

  // ── Produits ────────────────────────────────────────────────────────────
  for (const item of order.items ?? []) {
    rows.push(itemToRow(item, {
      etablissement_id, ouvert_a, ferme_a, date_service, service,
      salle, table_num, couverts, num_fiscal, operateur, import_file,
      statut: orderCanceled ? "Annulé" : "Payé",
    }));
  }

  // ── Paiements ───────────────────────────────────────────────────────────
  for (const pay of order.payments ?? []) {
    rows.push(paymentToRow(pay, {
      etablissement_id, ouvert_a, ferme_a, date_service, service,
      salle, table_num, couverts, num_fiscal, operateur, import_file,
      statut: orderCanceled ? "Annulé" : "Payé",
      transfere: orderTransferred,
    }));
  }

  return rows;
}

type CommonCtx = {
  etablissement_id: string;
  ouvert_a: string | null;
  ferme_a: string | null;
  date_service: string;
  service: "midi" | "soir";
  salle: string;
  table_num: string;
  couverts: number;
  num_fiscal: string;
  operateur: string;
  import_file: string;
  statut: string;
};

function itemToRow(item: PopinaOrderItem, ctx: CommonCtx): VentesLigneRow {
  const ttc = cents(item.total);
  const tva = cents(item.tax?.taxAmount);
  const ht = cents(item.tax?.taxableAmount);
  return {
    etablissement_id: ctx.etablissement_id,
    ouvert_a: ctx.ouvert_a,
    ferme_a: ctx.ferme_a,
    date_service: ctx.date_service,
    service: ctx.service,
    salle: ctx.salle,
    table_num: ctx.table_num,
    couverts: ctx.couverts,
    num_fiscal: ctx.num_fiscal,
    statut: ctx.statut,
    client: "",
    operateur: ctx.operateur,
    categorie: item.category ?? "",
    sous_categorie: item.subCategory ?? "",
    type_ligne: "Produit",
    description: item.description ?? "",
    menu: "",
    quantite: item.quantity ?? 0,
    tarification: item.tier ?? "Normal",
    annule: !!item.isCanceled,
    raison_annulation: item.cancelReason ?? "",
    perdu: !!item.isLoss,
    raison_perte: item.lossReason ?? "",
    transfere: !!item.isTransferred,
    taux_tva: fmtTauxTva(item.tax?.taxRate),
    prix_unitaire: cents(item.unitPrice),
    remise_totale: 0,
    ttc,
    tva,
    ht,
    import_file: ctx.import_file,
  };
}

function paymentToRow(pay: PopinaPayment, ctx: CommonCtx & { transfere: boolean }): VentesLigneRow {
  return {
    etablissement_id: ctx.etablissement_id,
    ouvert_a: ctx.ouvert_a,
    ferme_a: ctx.ferme_a,
    date_service: ctx.date_service,
    service: ctx.service,
    salle: ctx.salle,
    table_num: ctx.table_num,
    couverts: ctx.couverts,
    num_fiscal: ctx.num_fiscal,
    statut: ctx.statut,
    client: "",
    operateur: ctx.operateur,
    categorie: "",
    sous_categorie: "",
    type_ligne: "Paiement",
    description: pay.paymentName ?? "",
    menu: "",
    quantite: 1,
    tarification: "",
    annule: false,
    raison_annulation: "",
    perdu: false,
    raison_perte: "",
    transfere: ctx.transfere,
    taux_tva: "",
    prix_unitaire: 0,
    remise_totale: 0,
    ttc: cents(pay.paymentAmount),
    tva: 0,
    ht: 0,
    import_file: ctx.import_file,
  };
}

/** Wrapper : convertit tous les orders d'un jour en lignes prêtes à insérer */
export function ordersToVentesLignes(
  orders: PopinaOrder[],
  etablissement_id: string,
  date_service: string,
  import_file: string,
): VentesLigneRow[] {
  const rows: VentesLigneRow[] = [];
  for (const order of orders) {
    rows.push(...orderToVentesLignes(order, etablissement_id, date_service, import_file));
  }
  return rows;
}

export { parisDay };
