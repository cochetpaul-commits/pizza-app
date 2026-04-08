import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Adresse mise en CC sur tous les envois de commande
const CC_EMAIL = "contact@bellomio.fr";

/**
 * Prépare les métadonnées d'un email de commande (destinataires, sujet, corps).
 * Aucun envoi serveur : le client ouvre l'app mail native avec ces infos.
 */
export async function POST(request: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const body = await request.json();
  const { session_id } = body;
  if (!session_id) {
    return NextResponse.json({ error: "session_id requis" }, { status: 400 });
  }

  // 1. Session + fournisseur
  const { data: session, error: sessErr } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, supplier_id, total_ht, notes, created_at, suppliers(name)")
    .eq("id", session_id)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const supplierId = session.supplier_id;
  const supplierName = (session.suppliers as unknown as { name: string } | null)?.name ?? "Fournisseur";

  // 2. Destinataires : contacts send_orders=true, fallback suppliers.email
  const { data: contacts } = await supabaseAdmin
    .from("supplier_contacts")
    .select("name, email")
    .eq("supplier_id", supplierId)
    .eq("send_orders", true);

  const recipients = (contacts ?? []).filter((c) => c.email).map((c) => c.email as string);

  if (recipients.length === 0) {
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("email")
      .eq("id", supplierId)
      .single();
    if (supplier?.email) recipients.push(supplier.email);
  }

  if (recipients.length === 0) {
    return NextResponse.json({
      error: "Aucun destinataire configuré. Ajoutez un email sur la fiche fournisseur (ou un contact 'Envoyer les commandes').",
    }, { status: 400 });
  }

  // 3. Etablissement
  const { data: etab } = await supabaseAdmin
    .from("etablissements")
    .select("nom")
    .eq("id", etabId)
    .single();
  const etabName = etab?.nom ?? "Restaurant";

  // 4. Sujet + corps texte
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const totalHT = session.total_ht
    ? Number(session.total_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
    : null;
  const contactNames = (contacts ?? []).filter(c => c.email).map(c => c.name).filter(Boolean).join(", ");

  const subject = `Commande ${etabName} — ${supplierName} — ${date}`;

  const greeting = contactNames ? `Bonjour ${contactNames},` : "Bonjour,";
  const lines = [
    greeting,
    "",
    "Veuillez trouver ci-joint notre bon de commande.",
    "",
    `Fournisseur : ${supplierName}`,
    `Date : ${date}`,
    ...(totalHT ? [`Total HT : ${totalHT}`] : []),
    ...(session.notes ? ["", `Notes : ${session.notes}`] : []),
    "",
    "Cordialement,",
    etabName,
  ];
  const bodyText = lines.join("\n");

  const filename = `commande-${supplierName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;

  return NextResponse.json({
    ok: true,
    recipients,
    cc: CC_EMAIL,
    subject,
    bodyText,
    filename,
  });
}
