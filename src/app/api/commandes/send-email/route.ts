import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Adresse d'envoi (domaine verifie dans Resend)
const FROM_EMAIL = process.env.RESEND_FROM ?? "commande@bellomio.fr";
// CC automatique (boite commune pour historique)
const CC_EMAIL = "contact@bellomio.fr";

/**
 * Envoie une commande fournisseur par email via Resend.
 * - From : commande@bellomio.fr (domaine verifie)
 * - Reply-To : commande@bellomio.fr (reponses centralisees)
 * - CC : contact@bellomio.fr
 * - PDF bon de commande attache
 */
export async function POST(request: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: "RESEND_API_KEY manquante dans les variables d'environnement" },
      { status: 500 },
    );
  }

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
    .select("id, supplier_id, total_ht, notes, suppliers(name)")
    .eq("id", session_id)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const supplierId = session.supplier_id;
  const supplierName = (session.suppliers as unknown as { name: string } | null)?.name ?? "Fournisseur";

  // 2. Destinataires : contacts send_orders, fallback suppliers.email
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
      error: "Aucun destinataire configure. Ajoutez un email sur la fiche fournisseur.",
    }, { status: 400 });
  }

  // 3. Etablissement
  const { data: etab } = await supabaseAdmin
    .from("etablissements")
    .select("nom")
    .eq("id", etabId)
    .single();
  const etabName = etab?.nom ?? "Restaurant";

  // 4. Genere le PDF en appelant la route interne
  const host = request.headers.get("host") ?? "localhost:3000";
  const proto = request.headers.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const pdfUrl = `${proto}://${host}/api/commandes/pdf?session_id=${session_id}`;

  let pdfBuffer: Buffer;
  try {
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        Authorization: request.headers.get("authorization") ?? "",
        "x-etablissement-id": etabId,
      },
    });
    if (!pdfRes.ok) throw new Error(`PDF generation failed: ${pdfRes.status}`);
    pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
  } catch (err) {
    console.error("[send-email] PDF generation error:", err);
    return NextResponse.json({ error: "Erreur generation PDF" }, { status: 500 });
  }

  // 5. Sujet + corps HTML
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const totalHT = session.total_ht
    ? Number(session.total_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" })
    : "—";
  const contactNames = (contacts ?? []).filter(c => c.email).map(c => c.name).filter(Boolean).join(", ");
  const subject = `Commande ${etabName} — ${supplierName} — ${date}`;

  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #D4775A; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${etabName}</h1>
        <p style="margin: 4px 0 0; opacity: 0.85; font-size: 14px;">Bon de commande</p>
      </div>
      <div style="background: #fff; border: 1px solid #e0d8ce; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <p>Bonjour${contactNames ? ` ${contactNames}` : ""},</p>
        <p>Veuillez trouver ci-joint notre bon de commande.</p>
        <table style="width: 100%; margin: 16px 0; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #999; font-size: 13px;">Fournisseur</td>
            <td style="padding: 8px 0; font-weight: 600;">${supplierName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #999; font-size: 13px;">Date</td>
            <td style="padding: 8px 0; font-weight: 600;">${date}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #999; font-size: 13px;">Total HT</td>
            <td style="padding: 8px 0; font-weight: 600; color: #D4775A;">${totalHT}</td>
          </tr>
        </table>
        ${session.notes ? `<p style="margin-top: 12px; padding: 12px; background: #f5f0e8; border-radius: 8px; font-size: 13px;"><strong>Notes :</strong> ${session.notes}</p>` : ""}
        <p style="margin-top: 20px; color: #999; font-size: 12px;">Cordialement,<br/>${etabName}</p>
      </div>
    </div>
  `;

  // 6. Envoi via Resend
  const resend = new Resend(process.env.RESEND_API_KEY);
  const filename = `commande-${supplierName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`;

  try {
    const { data, error } = await resend.emails.send({
      from: `${etabName} <${FROM_EMAIL}>`,
      to: recipients,
      cc: [CC_EMAIL],
      replyTo: FROM_EMAIL,
      subject,
      html: htmlBody,
      attachments: [
        {
          filename,
          content: pdfBuffer,
        },
      ],
    });

    if (error) {
      console.error("[send-email] Resend error:", error);
      return NextResponse.json({
        error: `Erreur envoi mail: ${error.message ?? JSON.stringify(error)}`,
      }, { status: 500 });
    }

    // 7. Marque l'envoi en DB
    await supabaseAdmin
      .from("commande_sessions")
      .update({
        email_sent_at: new Date().toISOString(),
        email_sent_to: recipients.join(", "),
      })
      .eq("id", session_id);

    return NextResponse.json({
      ok: true,
      id: data?.id ?? null,
      recipients,
      cc: CC_EMAIL,
      subject,
    });
  } catch (err) {
    console.error("[send-email] unexpected error:", err);
    return NextResponse.json({
      error: `Erreur envoi mail: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
