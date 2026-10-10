import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { destinatairesBloques, DOMAINE_AUTORISE_HORS_PRODUCTION } from "@/lib/envoiGardeFou";

export const runtime = "nodejs";

/**
 * Réclamations fournisseur (10/10/2026), nourries par le contrôle de réception : chaque ligne
 * signalée avec un montant à réclamer devient un litige « à réclamer ».
 * GET   : litiges de l'établissement, avec fournisseur, commande, contacts mail.
 * PATCH { ids, statut, note? } : change le statut (à réclamer, réclamé, avoir reçu, abandonné).
 * POST  { supplier_id, ids, destinataires, sujet, texte } : envoie la réclamation par mail
 *       (garde-fou hors production) et passe les lignes en « réclamé ».
 */
const FROM_EMAIL = process.env.RESEND_FROM ?? "commande@bellomio.fr";
const STATUTS = ["a_reclamer", "reclame", "avoir_recu", "abandonne"] as const;
type Statut = (typeof STATUTS)[number];

async function auth(req: NextRequest) {
  try { return { a: await getEtablissement(req) }; } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
}

type LigneDb = {
  id: string; session_id: string; quantite: number; unite: string | null; prix_unitaire_ht: number | null; qty_received: number | null;
  etat_reception: string | null; prix_recu: number | null; montant_reclame: number | null; litige_statut: Statut; litige_reclame_at: string | null; litige_note: string | null; reception_note: string | null;
  ingredients: { name: string } | null;
  commande_sessions: { id: string; etablissement_id: string | null; supplier_id: string | null; created_at: string; received_at: string | null; document_lu: { numero?: string | null } | null; suppliers: { name: string; email: string | null } | null } | null;
};

export async function GET(req: NextRequest) {
  const c = await auth(req);
  if ("erreur" in c) return c.erreur;
  const { data, error } = await supabaseAdmin
    .from("commande_lignes")
    .select("id, session_id, quantite, unite, prix_unitaire_ht, qty_received, etat_reception, prix_recu, montant_reclame, litige_statut, litige_reclame_at, litige_note, reception_note, ingredients(name), commande_sessions!inner(id, etablissement_id, supplier_id, created_at, received_at, document_lu, suppliers(name, email))")
    .not("litige_statut", "is", null)
    .eq("commande_sessions.etablissement_id", c.a.etabId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const lignes = (data ?? []) as unknown as LigneDb[];

  const supplierIds = [...new Set(lignes.map((l) => l.commande_sessions?.supplier_id).filter((x): x is string => !!x))];
  const { data: contacts } = supplierIds.length
    ? await supabaseAdmin.from("supplier_contacts").select("supplier_id, email, send_orders").in("supplier_id", supplierIds)
    : { data: [] as { supplier_id: string; email: string | null; send_orders: boolean | null }[] };

  const fournisseurs = supplierIds.map((id) => {
    const s = lignes.find((l) => l.commande_sessions?.supplier_id === id)?.commande_sessions?.suppliers;
    const mails = [
      ...(contacts ?? []).filter((x) => x.supplier_id === id && x.email).sort((a, b) => Number(!!b.send_orders) - Number(!!a.send_orders)).map((x) => String(x.email).trim()),
      ...(s?.email ? [s.email.trim()] : []),
    ];
    return { id, nom: s?.name ?? "Fournisseur", emails: [...new Set(mails)] };
  });

  return NextResponse.json({
    fournisseurs,
    lignes: lignes.map((l) => ({
      id: l.id, session_id: l.session_id, supplier_id: l.commande_sessions?.supplier_id ?? null,
      produit: l.ingredients?.name ?? "?", quantite: Number(l.quantite), unite: l.unite,
      prix_unitaire_ht: l.prix_unitaire_ht != null ? Number(l.prix_unitaire_ht) : null,
      qty_received: l.qty_received != null ? Number(l.qty_received) : null,
      etat: l.etat_reception, prix_recu: l.prix_recu != null ? Number(l.prix_recu) : null,
      montant: l.montant_reclame != null ? Number(l.montant_reclame) : 0,
      statut: l.litige_statut, reclame_at: l.litige_reclame_at, note: l.litige_note, commentaire: l.reception_note,
      commande_du: l.commande_sessions?.created_at ?? null, recue_le: l.commande_sessions?.received_at ?? null,
      document_numero: l.commande_sessions?.document_lu?.numero ?? null,
    })),
  });
}

/** Lignes du demandeur seulement (établissement courant) */
async function idsAutorises(ids: string[], etabId: string): Promise<string[]> {
  if (!ids.length) return [];
  const { data } = await supabaseAdmin.from("commande_lignes").select("id, commande_sessions!inner(etablissement_id)").in("id", ids).eq("commande_sessions.etablissement_id", etabId);
  return (data ?? []).map((x) => x.id as string);
}

export async function PATCH(req: NextRequest) {
  const c = await auth(req);
  if ("erreur" in c) return c.erreur;
  const body = await req.json().catch(() => null) as { ids?: string[]; statut?: Statut; note?: string | null } | null;
  if (!body?.ids?.length || !body.statut || !STATUTS.includes(body.statut)) return NextResponse.json({ error: "ids et statut requis" }, { status: 400 });
  const ids = await idsAutorises(body.ids, c.a.etabId);
  if (!ids.length) return NextResponse.json({ error: "Aucune ligne autorisée" }, { status: 403 });
  const maj: Record<string, unknown> = { litige_statut: body.statut };
  if (body.note !== undefined) maj.litige_note = body.note?.trim() || null;
  if (body.statut === "reclame") maj.litige_reclame_at = new Date().toISOString();
  const { error } = await supabaseAdmin.from("commande_lignes").update(maj).in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, n: ids.length });
}

const echapper = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function POST(req: NextRequest) {
  const c = await auth(req);
  if ("erreur" in c) return c.erreur;
  const body = await req.json().catch(() => null) as { ids?: string[]; destinataires?: string[]; sujet?: string; texte?: string } | null;
  const destinataires = [...new Set((body?.destinataires ?? []).map((e) => e.trim()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];
  if (!body?.ids?.length || !destinataires.length || !body.sujet?.trim() || !body.texte?.trim()) return NextResponse.json({ error: "Lignes, destinataire, objet et texte requis" }, { status: 400 });
  const bloques = destinatairesBloques(destinataires);
  if (bloques.length) return NextResponse.json({ error: `Envoi bloqué hors production : ${bloques.join(", ")} n'est pas une adresse @${DOMAINE_AUTORISE_HORS_PRODUCTION}. Rien n'a été envoyé.` }, { status: 400 });
  const ids = await idsAutorises(body.ids, c.a.etabId);
  if (!ids.length) return NextResponse.json({ error: "Aucune ligne autorisée" }, { status: 403 });

  const { data: etab } = await supabaseAdmin.from("etablissements").select("nom").eq("id", c.a.etabId).maybeSingle();
  const nomEtab = (etab?.nom as string | undefined) ?? "Bello Mio";
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${echapper(body.texte.trim()).replace(/\n/g, "<br>")}</div>`;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({ from: `${nomEtab} <${FROM_EMAIL}>`, to: destinataires, replyTo: FROM_EMAIL, subject: body.sujet.trim(), html, text: body.texte.trim() });
    if (error) return NextResponse.json({ error: `Erreur envoi mail : ${error.message ?? JSON.stringify(error)}` }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ error: `Erreur envoi mail : ${e instanceof Error ? e.message : "inconnue"}` }, { status: 500 });
  }
  const maintenant = new Date().toISOString();
  await supabaseAdmin.from("commande_lignes").update({ litige_statut: "reclame", litige_reclame_at: maintenant, litige_note: `Réclamé par mail à ${destinataires.join(", ")}` }).in("id", ids);
  return NextResponse.json({ ok: true, destinataires });
}
