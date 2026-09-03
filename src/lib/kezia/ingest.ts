import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdfToText } from "@/lib/pdfToText";
import { parseKeziaSynthese } from "@/lib/kezia/keziaParser";
import { keziaDailyRow, estRecapMensuel } from "@/lib/kezia/row";

/**
 * Ingestion serveur d'un « JOURNAL de SYNTHESE » Kezia (caisse Piccola Mia)
 * dans daily_sales — même écriture que le bouton d'import manuel (/api/kezia),
 * mais sans utilisateur : sert au dépôt quotidien automatique (Apps Script
 * qui relaie le mail Kezia, ou lecture du dossier Drive).
 * Idempotent : une ligne par (établissement, date DEBUT, source), mise à jour
 * si elle existe déjà. Le récapitulatif mensuel (DEBUT ≠ FIN) est refusé.
 */
export type IngestResult = { date: string | null; statut: "insere" | "mis_a_jour" | "rejete" | "erreur"; detail?: string };

let piccolaId: string | null = null;
async function etabPiccola(): Promise<string> {
  if (piccolaId) return piccolaId;
  const { data } = await supabaseAdmin.from("etablissements").select("id").ilike("slug", "%piccola%").maybeSingle();
  if (!data?.id) throw new Error("Établissement Piccola Mia introuvable");
  piccolaId = data.id as string;
  return piccolaId;
}

export async function ingestKeziaPdf(bytes: Uint8Array, filename = ""): Promise<IngestResult> {
  try {
    const text = await pdfToText(bytes);
    const parsed = parseKeziaSynthese(text);
    if (estRecapMensuel(parsed, filename)) {
      return { date: null, statut: "rejete", detail: `récapitulatif mensuel (DEBUT ${parsed.date_debut || "?"} ≠ FIN ${parsed.date_fin || "?"}) — jamais écrit comme une journée` };
    }
    if (!parsed.date) return { date: null, statut: "erreur", detail: `date DEBUT introuvable dans ${filename || "le PDF"}` };
    if (!(parsed.ca_ttc > 0) && parsed.tickets === 0) return { date: parsed.date, statut: "erreur", detail: "journal vide (CA 0, 0 ticket) — lecture du PDF douteuse" };
    const etabId = await etabPiccola();
    const row = keziaDailyRow(parsed, text);

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
