import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCustomerInvoices, getCustomers, getQuotes, type PlDossier } from "@/lib/pennylane/api";

/**
 * Événementiel Piccola Mia (30/10/2026) : les devis et factures clients sont faits dans Pennylane
 * (SARL I Fratelli). L'app les lit chaque nuit et les range dans evenementiel_pennylane, pour les
 * afficher et compter les factures dans le CA. Rien n'est écrit dans Pennylane.
 */
export const DEPUIS = "2025-01-01";

export type LigneEvenementiel = {
  type: "devis" | "facture"; id: number; etablissement_id: string; numero: string | null; client_id: number | null; client_nom: string | null;
  date: string | null; echeance: string | null; montant_ht: number; montant_ttc: number; statut: string | null; paye: boolean; reste_ttc: number | null;
  objet: string | null; description: string | null; texte_libre: string | null; url_pdf: string | null; devis_id: number | null; avoir_de: number | null; archive: boolean;
  synchro_at: string;
};

const num = (v: string | number | null | undefined) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const vide = (s: string | null | undefined) => { const t = (s ?? "").trim(); return t ? t : null; };

export async function syncEvenementiel(etabId: string, dossier: PlDossier = "piccola"): Promise<{ devis: number; factures: number; clients: number }> {
  const [devis, factures, clients] = await Promise.all([getQuotes(DEPUIS, dossier), getCustomerInvoices(DEPUIS, dossier), getCustomers(dossier)]);
  const nomClient = new Map(clients.map((c) => [c.id, vide(c.name) ?? vide(`${c.first_name ?? ""} ${c.last_name ?? ""}`)]));
  const maintenant = new Date().toISOString();
  const lignes: LigneEvenementiel[] = [
    ...devis.map((d): LigneEvenementiel => ({
      type: "devis", id: d.id, etablissement_id: etabId, numero: vide(d.quote_number) ?? vide(d.label), client_id: d.customer?.id ?? null, client_nom: d.customer ? nomClient.get(d.customer.id) ?? null : null,
      date: d.date, echeance: d.deadline, montant_ht: num(d.currency_amount_before_tax), montant_ttc: num(d.currency_amount), statut: d.status, paye: false, reste_ttc: null,
      objet: vide(d.pdf_invoice_subject), description: vide(d.pdf_description), texte_libre: vide(d.pdf_invoice_free_text), url_pdf: d.public_file_url, devis_id: null, avoir_de: null, archive: !!d.archived_at, synchro_at: maintenant,
    })),
    ...factures.filter((f) => !f.draft).map((f): LigneEvenementiel => ({
      type: "facture", id: f.id, etablissement_id: etabId, numero: vide(f.invoice_number) ?? vide(f.label), client_id: f.customer?.id ?? null, client_nom: f.customer ? nomClient.get(f.customer.id) ?? null : null,
      date: f.date, echeance: f.deadline, montant_ht: num(f.currency_amount_before_tax), montant_ttc: num(f.currency_amount), statut: f.status, paye: !!f.paid, reste_ttc: f.remaining_amount_with_tax == null ? null : num(f.remaining_amount_with_tax),
      objet: vide(f.pdf_invoice_subject), description: vide(f.pdf_description), texte_libre: vide(f.pdf_invoice_free_text), url_pdf: f.public_file_url, devis_id: f.quote?.id ?? null, avoir_de: f.credited_invoice?.id ?? null, archive: !!f.archived_at, synchro_at: maintenant,
    })),
  ];
  for (let i = 0; i < lignes.length; i += 200) {
    const { error } = await supabaseAdmin.from("evenementiel_pennylane").upsert(lignes.slice(i, i + 200), { onConflict: "type,id" });
    if (error) throw new Error(error.message);
  }
  return { devis: devis.length, factures: factures.length, clients: clients.length };
}
