import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdfToText } from "@/lib/pdfToText";
import { parseKeziaSynthese } from "@/lib/kezia/keziaParser";

/**
 * Ingestion serveur d'un « JOURNAL de SYNTHESE » Kezia (caisse Piccola Mia)
 * dans daily_sales — même écriture que le bouton d'import manuel (/api/kezia),
 * mais sans utilisateur : sert au dépôt quotidien automatique (Apps Script
 * qui relaie le mail Kezia, ou lecture du dossier Drive).
 * Idempotent : une ligne par date, mise à jour si elle existe déjà.
 */
export type IngestResult = { date: string | null; statut: "insere" | "mis_a_jour" | "ignore" | "erreur"; detail?: string };

let piccolaId: string | null = null;
async function etabPiccola(): Promise<string> {
  if (piccolaId) return piccolaId;
  const { data } = await supabaseAdmin.from("etablissements").select("id").ilike("slug", "%piccola%").maybeSingle();
  if (!data?.id) throw new Error("Établissement Piccola Mia introuvable");
  piccolaId = data.id as string;
  return piccolaId;
}

export async function ingestKeziaPdf(bytes: Uint8Array, filename = ""): Promise<IngestResult> {
  // Le journal MENSUEL récapitule le mois : ce n'est pas une journée
  if (/MENSUEL/i.test(filename)) return { date: null, statut: "ignore", detail: "journal mensuel" };
  try {
    const text = await pdfToText(bytes);
    const parsed = parseKeziaSynthese(text);
    if (!parsed.date) return { date: null, statut: "erreur", detail: `date introuvable dans ${filename || "le PDF"}` };
    const etabId = await etabPiccola();

    const row = {
      ca_ttc: parsed.ca_ttc, ca_ht: parsed.ca_ht, tva_total: parsed.tva_total,
      tickets: parsed.tickets, couverts: parsed.couverts, panier_moyen: parsed.panier_moyen,
      especes: parsed.especes, cartes: parsed.cartes, cheques: parsed.cheques, virements: parsed.virements,
      marge_total: parsed.marge_total, taux_marque: parsed.taux_marque,
      rayons: parsed.rayons, tva_details: parsed.tva_details, raw_text: text,
    };

    const { data: existing } = await supabaseAdmin
      .from("daily_sales").select("id")
      .eq("etablissement_id", etabId).eq("date", parsed.date).eq("source", "kezia_pdf").limit(1);

    if (existing && existing.length > 0) {
      const { error } = await supabaseAdmin.from("daily_sales").update(row).eq("id", existing[0].id);
      if (error) throw new Error(error.message);
      return { date: parsed.date, statut: "mis_a_jour" };
    }
    const { error } = await supabaseAdmin.from("daily_sales")
      .insert({ etablissement_id: etabId, date: parsed.date, source: "kezia_pdf", ...row });
    if (error) throw new Error(error.message);
    return { date: parsed.date, statut: "insere" };
  } catch (e) {
    return { date: null, statut: "erreur", detail: e instanceof Error ? e.message.slice(0, 200) : "erreur" };
  }
}

/** Dates déjà présentes (kezia_pdf) pour éviter de retélécharger tout le Drive. */
export async function datesDejaImportees(): Promise<Set<string>> {
  const etabId = await etabPiccola();
  const { data } = await supabaseAdmin.from("daily_sales").select("date")
    .eq("etablissement_id", etabId).eq("source", "kezia_pdf");
  return new Set((data ?? []).map((r) => String(r.date)));
}
