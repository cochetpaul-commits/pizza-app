import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ── Google OAuth token ──
let _cachedToken: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (_cachedToken && Date.now() < _cachedToken.exp - 60_000) return _cachedToken.token;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`OAuth error: ${JSON.stringify(data)}`);
  _cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

// ── Gmail send ──
async function sendGmail(
  token: string,
  from: string,
  to: string[],
  subject: string,
  bodyHtml: string,
  attachment?: { filename: string; content: Buffer; mimeType: string },
): Promise<void> {
  const boundary = "boundary_" + Math.random().toString(36).slice(2);

  let raw = "";
  raw += `From: ${from}\r\n`;
  raw += `To: ${to.join(", ")}\r\n`;
  raw += `Subject: =?UTF-8?B?${Buffer.from(subject).toString("base64")}?=\r\n`;
  raw += `MIME-Version: 1.0\r\n`;
  raw += `Content-Type: multipart/mixed; boundary="${boundary}"\r\n\r\n`;
  raw += `--${boundary}\r\n`;
  raw += `Content-Type: text/html; charset=UTF-8\r\n\r\n`;
  raw += bodyHtml + "\r\n\r\n";

  if (attachment) {
    raw += `--${boundary}\r\n`;
    raw += `Content-Type: ${attachment.mimeType}\r\n`;
    raw += `Content-Disposition: attachment; filename="${attachment.filename}"\r\n`;
    raw += `Content-Transfer-Encoding: base64\r\n\r\n`;
    raw += attachment.content.toString("base64") + "\r\n";
  }

  raw += `--${boundary}--`;

  const encodedMessage = Buffer.from(raw).toString("base64url");

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send error ${res.status}: ${err}`);
  }
}

// ── Route ──

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

  // 1. Get session + lines
  const { data: session, error: sessErr } = await supabaseAdmin
    .from("commande_sessions")
    .select("id, supplier_id, total_ht, status, notes, created_at, suppliers(name)")
    .eq("id", session_id)
    .single();

  if (sessErr || !session) {
    return NextResponse.json({ error: "Session introuvable" }, { status: 404 });
  }

  const supplierId = session.supplier_id;
  const supplierName = (session.suppliers as unknown as { name: string } | null)?.name ?? "Fournisseur";

  // 2. Get contacts with send_orders = true
  const { data: contacts } = await supabaseAdmin
    .from("supplier_contacts")
    .select("name, email")
    .eq("supplier_id", supplierId)
    .eq("send_orders", true);

  const recipients = (contacts ?? []).filter((c) => c.email).map((c) => c.email as string);

  if (recipients.length === 0) {
    // Fallback: try supplier email
    const { data: supplier } = await supabaseAdmin
      .from("suppliers")
      .select("email")
      .eq("id", supplierId)
      .single();

    if (supplier?.email) {
      recipients.push(supplier.email);
    }
  }

  if (recipients.length === 0) {
    return NextResponse.json({
      error: "Aucun destinataire configure. Ajoutez un contact avec 'Envoyer les commandes' dans la fiche fournisseur.",
    }, { status: 400 });
  }

  // 3. Get establishment info
  const { data: etab } = await supabaseAdmin
    .from("etablissements")
    .select("nom, slug")
    .eq("id", etabId)
    .single();

  const etabName = etab?.nom ?? "Restaurant";

  // 4. Generate PDF via internal API call
  const origin = request.headers.get("origin") || request.headers.get("x-forwarded-host") || "http://localhost:3000";
  const protocol = origin.startsWith("http") ? "" : "https://";
  const pdfUrl = `${protocol}${origin}/api/commandes/pdf?session_id=${session_id}`;

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

  // 5. Build email
  const date = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  const totalHT = session.total_ht ? Number(session.total_ht).toLocaleString("fr-FR", { style: "currency", currency: "EUR" }) : "—";

  const contactNames = (contacts ?? []).filter(c => c.email).map(c => c.name).join(", ");

  const subject = `Commande ${etabName} — ${supplierName} — ${date}`;
  const htmlBody = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
      <div style="background: #D4775A; color: white; padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="margin: 0; font-size: 20px;">${etabName}</h1>
        <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">Bon de commande</p>
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

  // 6. Send via Gmail
  try {
    const token = await getAccessToken();
    const fromEmail = process.env.GMAIL_FROM ?? "contact@bello-mio.fr";

    await sendGmail(
      token,
      `${etabName} <${fromEmail}>`,
      recipients,
      subject,
      htmlBody,
      {
        filename: `commande-${supplierName.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.pdf`,
        content: pdfBuffer,
        mimeType: "application/pdf",
      },
    );

    // 7. Update session status only if currently brouillon
    if (session.status === "brouillon") {
      await supabaseAdmin
        .from("commande_sessions")
        .update({ status: "en_attente" })
        .eq("id", session_id);
    }

    return NextResponse.json({
      ok: true,
      recipients,
      subject,
    });
  } catch (err) {
    console.error("[send-email] Gmail error:", err);
    return NextResponse.json({
      error: `Erreur envoi mail: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 });
  }
}
