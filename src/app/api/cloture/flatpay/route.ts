import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cleTransaction, type TransactionFlatpay } from "@/lib/flatpay";
import { accesCloture } from "../acces";

export const runtime = "nodejs";

/**
 * POST { transactions } : transactions lues dans un export Flatpay (lecture faite dans le navigateur,
 * src/lib/flatpay.ts). Enregistrées une seule fois (clé : source, heure, carte, montant, terminal),
 * pour le contrôle ticket par ticket de la nuit. Renvoie le nombre d'ajouts par jour de service.
 */
export async function POST(req: NextRequest) {
  const a = await accesCloture(req);
  if ("erreur" in a) return a.erreur;
  const body = await req.json().catch(() => null) as { transactions?: TransactionFlatpay[] } | null;
  const tx = (body?.transactions ?? []).filter((t) => t && t.horodatage && Number.isFinite(t.montant) && ["cb", "amex", "conecs"].includes(t.mode)).slice(0, 5000);
  if (!tx.length) return NextResponse.json({ error: "Aucune transaction lisible dans l'export." }, { status: 400 });
  const lot = crypto.randomUUID();
  const lignes = tx.map((t) => ({
    etablissement_id: a.etabId, cle: cleTransaction(t), horodatage: t.horodatage, jour: t.jour, mode: t.mode, type_carte: t.typeCarte || null,
    montant_centimes: Math.round(t.montant * 100), statut: t.statut || null, operation: t.operation || null, terminal: t.terminal, emetteur: t.emetteur,
    source: t.source, lot_id: lot, imported_by: a.userId,
  }));
  const ajoutees: Record<string, number> = {};
  for (let i = 0; i < lignes.length; i += 500) {
    const { data, error } = await supabaseAdmin.from("flatpay_transactions").upsert(lignes.slice(i, i + 500), { onConflict: "etablissement_id,cle", ignoreDuplicates: true }).select("jour");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    for (const d of data ?? []) ajoutees[d.jour as string] = (ajoutees[d.jour as string] ?? 0) + 1;
  }
  return NextResponse.json({ ok: true, lues: tx.length, ajoutees });
}
