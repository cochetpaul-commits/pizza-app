import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";
import { destinatairesBloques, DOMAINE_AUTORISE_HORS_PRODUCTION } from "@/lib/envoiGardeFou";
import { chargerEnvoi, corpsMail, refusDroit, type Envoi } from "@/lib/commandeEnvoi";
import { precommandeEnRetard } from "@/lib/commandeLivraison";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Adresse d'envoi (domaine vérifié dans Resend). Plus de copie fixe : la trace est le journal commande_envois.
const FROM_EMAIL = process.env.RESEND_FROM ?? "commande@bellomio.fr";

/**
 * GET  ?session_id=… → aperçu pour l'écran de confirmation (rien n'est envoyé) :
 *                      produits, total HT, date et adresse de livraison, destinataires, droits, blocage hors production.
 * POST { session_id } → envoi par Resend aux contacts cochés « Commandes », PDF joint ;
 *                      la commande passe en « envoyee » et l'envoi est inscrit au journal (réussi ou non).
 */

async function contexte(req: NextRequest, sessionId: string | null) {
  let auth: { etabId: string; userId: string };
  try {
    auth = await getEtablissement(req);
  } catch (e) {
    if (e instanceof EtabError) return { erreur: NextResponse.json({ error: e.message }, { status: e.status }) };
    throw e;
  }
  if (!sessionId) return { erreur: NextResponse.json({ error: "session_id requis" }, { status: 400 }) };
  const envoi = await chargerEnvoi(sessionId, auth.etabId, new Date(), auth.userId);
  if (!envoi) return { erreur: NextResponse.json({ error: "Commande introuvable" }, { status: 404 }) };
  const refus = await refusDroit(auth.userId, envoi.fournisseur.id);
  return { ...auth, envoi, refus };
}

function problemes(envoi: Envoi): string | null {
  if (envoi.lignes.length === 0) return "La commande est vide.";
  if (envoi.destinataires.length === 0) return "Aucun contact coché « Commandes » sur la fiche fournisseur : rien ne peut être envoyé.";
  const bloques = destinatairesBloques(envoi.destinataires);
  if (bloques.length) return `Envoi bloqué hors production : ${bloques.join(", ")} n'est pas une adresse @${DOMAINE_AUTORISE_HORS_PRODUCTION}. Rien n'a été envoyé.`;
  if (envoi.session.status === "recue" || envoi.session.status === "annulee") return "Cette commande est déjà reçue ou annulée.";
  return null;
}

export async function GET(request: NextRequest) {
  const c = await contexte(request, request.nextUrl.searchParams.get("session_id"));
  if ("erreur" in c) return c.erreur;
  const { envoi, refus } = c;
  return NextResponse.json({
    fournisseur: envoi.fournisseur.nom,
    type: envoi.type,
    // Limite Maël : précommande le mercredi avant 12 h. Au-delà, avertissement seulement (jamais bloqué)
    avertissement: envoi.type === "precommande" && precommandeEnRetard() ? "Attention : la limite Maël pour la précommande est mercredi 12 h." : null,
    nb_produits: envoi.lignes.length,
    total_ht: envoi.totalHt,
    livraison: envoi.livraison,
    adresse: envoi.etab.adresse ? `${envoi.etab.nom}, ${envoi.etab.adresse}` : envoi.etab.nom,
    destinataires: envoi.destinataires,
    deja_envoyee_le: envoi.session.email_sent_at,
    refus: refus ?? problemes(envoi),
  });
}

export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: "RESEND_API_KEY manquante dans les variables d'environnement" }, { status: 500 });
  }
  const body = await request.json().catch(() => ({}));
  const c = await contexte(request, (body as { session_id?: string }).session_id ?? null);
  if ("erreur" in c) return c.erreur;
  const { envoi, refus, etabId, userId } = c;
  if (refus) return NextResponse.json({ error: refus }, { status: 403 });
  const pb = problemes(envoi);
  if (pb) return NextResponse.json({ error: pb, bloque_hors_production: pb.startsWith("Envoi bloqué") }, { status: pb.startsWith("Envoi bloqué") ? 403 : 400 });

  const sessionId = envoi.session.id;
  const journal = (x: { succes: boolean; sujet: string; resend_id?: string | null; erreur?: string | null }) =>
    supabaseAdmin.from("commande_envois").insert({
      session_id: sessionId, envoye_par: userId, destinataires: envoi.destinataires, sujet: x.sujet,
      livraison_prevue: envoi.livraison?.date ?? null, resend_id: x.resend_id ?? null, succes: x.succes, erreur: x.erreur ?? null,
    });

  // PDF (route interne, mêmes droits que l'appelant)
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  let pdfBuffer: Buffer;
  try {
    const pdfRes = await fetch(`${proto}://${host}/api/commandes/pdf?session_id=${sessionId}`, {
      headers: { Authorization: request.headers.get("authorization") ?? "", "x-etablissement-id": etabId },
    });
    if (!pdfRes.ok) throw new Error(`PDF ${pdfRes.status}`);
    pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  } catch (err) {
    console.error("[send-email] PDF generation error:", err);
    return NextResponse.json({ error: "Erreur génération PDF : rien n'a été envoyé" }, { status: 500 });
  }

  // Renvoi : le fournisseur doit comprendre que ce bon REMPLACE le précédent
  const remplace = envoi.session.email_sent_at
    ? new Date(envoi.session.email_sent_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" })
    : null;
  const sujet = `${remplace ? "[MISE À JOUR] " : ""}${envoi.type === "precommande" ? "Précommande" : "Commande"} ${envoi.etab.nom} — livraison ${envoi.livraison?.libelle ?? "à convenir"}`;
  const fichier = `commande-${envoi.fournisseur.nom.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${envoi.livraison?.date ?? new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: `${envoi.etab.nom} <${FROM_EMAIL}>`,
      to: envoi.destinataires,
      replyTo: FROM_EMAIL,
      subject: sujet,
      html: corpsMail(envoi, remplace),
      attachments: [{ filename: fichier, content: pdfBuffer }],
    });
    if (error) {
      console.error("[send-email] Resend error:", error);
      await journal({ succes: false, sujet, erreur: error.message ?? JSON.stringify(error) });
      return NextResponse.json({ error: `Erreur envoi mail : ${error.message ?? JSON.stringify(error)}` }, { status: 500 });
    }
    await journal({ succes: true, sujet, resend_id: data?.id ?? null });
    await supabaseAdmin.from("commande_sessions").update({
      status: "envoyee",
      email_sent_at: new Date().toISOString(),
      email_sent_to: envoi.destinataires.join(", "),
      updated_at: new Date().toISOString(),
    }).eq("id", sessionId);
    return NextResponse.json({ ok: true, id: data?.id ?? null, recipients: envoi.destinataires, subject: sujet, livraison: envoi.livraison });
  } catch (err) {
    console.error("[send-email] unexpected error:", err);
    await journal({ succes: false, sujet, erreur: err instanceof Error ? err.message : String(err) });
    return NextResponse.json({ error: `Erreur envoi mail : ${err instanceof Error ? err.message : String(err)}` }, { status: 500 });
  }
}
