import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdfToText } from "@/lib/pdfToText";
import { parseInvoice } from "@/lib/parsers";
import {
  getGmailMessage,
  getAttachmentBuffer,
  getHeader,
  findPdfAttachments,
} from "@/lib/gmail/client";
import {
  detectFournisseurFromEmail,
  detectEtablissementFromRecipients,
} from "@/lib/gmail/supplier-router";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ── Helpers ──────────────────────────────────────────────────────────────────

function ddmmyyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{2})[/\-.](\d{2})[/\-.](\d{4})$/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

async function resolveEtabId(slug: string | null): Promise<string | null> {
  if (!slug) return null;
  const terms: Record<string, string[]> = {
    "bello-mio": ["bello", "bellomio"],
    "piccola-mia": ["piccola", "piccolamia"],
  };
  for (const term of terms[slug] ?? [slug]) {
    const { data } = await supabaseAdmin
      .from("etablissements")
      .select("id")
      .ilike("nom", `%${term}%`)
      .eq("actif", true)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

async function findOrCreateSupplier(name: string, etabId: string | null): Promise<string | null> {
  // Search case-insensitive
  const { data: existing } = await supabaseAdmin
    .from("suppliers")
    .select("id")
    .ilike("name", `%${name}%`)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  // Also try exact match lowercase
  const { data: exact } = await supabaseAdmin
    .from("suppliers")
    .select("id")
    .ilike("name", name)
    .maybeSingle();
  if (exact?.id) return exact.id;

  // Create new supplier
  const { data: created, error } = await supabaseAdmin
    .from("suppliers")
    .insert({ name, is_active: true, ...(etabId ? { etablissement_id: etabId } : {}) })
    .select("id")
    .single();
  if (error) {
    console.error("findOrCreateSupplier insert error:", error);
  }
  return created?.id ?? null;
}

// ── Webhook handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // 1. Verify webhook secret
  const secret = process.env.GMAIL_WEBHOOK_SECRET;
  const token = req.headers.get("x-goog-channel-token");
  if (secret && token !== secret) {
    // Also check authorization header (Pub/Sub push format)
    const auth = req.headers.get("authorization");
    if (!auth?.includes(secret)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // 2. Decode Pub/Sub message
  try {
    const body = await req.json();
    const pubsubData = body.message?.data;
    if (!pubsubData) {
      // Might be a direct notification with historyId
      return NextResponse.json({ ok: true, skipped: "no message data" });
    }
    const decoded = JSON.parse(Buffer.from(pubsubData, "base64").toString());
    // Pub/Sub notification contains { emailAddress, historyId }
    // We need to fetch recent history to get messageIds
    // For simplicity, we'll use the historyId approach
    if (!decoded.historyId) {
      return NextResponse.json({ ok: true, skipped: "no historyId" });
    }
    // Get recent messages from history
    let messages = await getRecentMessages(decoded.historyId);
    // If history returns nothing, fall back to listing recent label messages
    if (messages.length === 0) {
      messages = await listRecentLabelMessages();
    }
    if (messages.length === 0) {
      return NextResponse.json({ ok: true, skipped: "no new messages" });
    }

    const results = [];
    for (const msgId of messages) {
      const result = await processMessage(msgId);
      results.push(result);
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (e) {
    console.error("Gmail webhook error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

// Also support GET for manual testing
export async function GET(req: Request) {
  const url = new URL(req.url);
  const msgId = url.searchParams.get("messageId");
  if (!msgId) {
    return NextResponse.json({ error: "?messageId= required" }, { status: 400 });
  }
  const result = await processMessage(msgId);
  return NextResponse.json(result);
}

// ── Fetch recent messages via history ────────────────────────────────────────

async function getRecentMessages(historyId: string): Promise<string[]> {
  const token = await getAccessTokenDirect();
  const labelId = process.env.GMAIL_LABEL_ID;
  const params = new URLSearchParams({
    startHistoryId: historyId,
    historyTypes: "messageAdded",
    ...(labelId ? { labelId } : {}),
  });

  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/history?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    // historyId too old or invalid — list recent messages instead
    return listRecentLabelMessages();
  }

  const data = await res.json();
  const messageIds: string[] = [];
  for (const record of data.history ?? []) {
    for (const msg of record.messagesAdded ?? []) {
      if (msg.message?.id && !messageIds.includes(msg.message.id)) {
        messageIds.push(msg.message.id);
      }
    }
  }
  return messageIds;
}

async function listRecentLabelMessages(): Promise<string[]> {
  const token = await getAccessTokenDirect();
  const labelId = process.env.GMAIL_LABEL_ID;
  const params = new URLSearchParams({ maxResults: "10" });
  if (labelId) params.set("labelIds", labelId);
  else params.set("q", "has:attachment filename:pdf");
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.messages ?? []).map((m: { id: string }) => m.id);
}

// Token helper (avoid circular import issues)
let _cachedToken: { token: string; exp: number } | null = null;

async function getAccessTokenDirect(): Promise<string> {
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
  _cachedToken = { token: data.access_token, exp: Date.now() + (data.expires_in ?? 3600) * 1000 };
  return data.access_token;
}

// ── Process a single Gmail message ───────────────────────────────────────────

async function processMessage(messageId: string) {
  // Check dedup
  const { count } = await supabaseAdmin
    .from("email_imports")
    .select("id", { count: "exact", head: true })
    .eq("gmail_message_id", messageId);
  if ((count ?? 0) > 0) {
    return { messageId, status: "duplicate", detail: "already processed" };
  }

  // Fetch message
  const msg = await getGmailMessage(messageId);

  const from = getHeader(msg.payload, "From") ?? "";
  const to = getHeader(msg.payload, "To") ?? "";
  const cc = getHeader(msg.payload, "Cc") ?? "";
  const subject = getHeader(msg.payload, "Subject") ?? "";
  const emailDate = msg.internalDate
    ? new Date(parseInt(msg.internalDate)).toISOString()
    : null;

  // Check label filter
  const labelId = process.env.GMAIL_LABEL_ID;
  if (labelId && !msg.labelIds.includes(labelId)) {
    return { messageId, status: "skipped", detail: "wrong label" };
  }

  // Find PDF attachments
  const pdfs = findPdfAttachments(msg.payload);
  if (pdfs.length === 0) {
    return { messageId, status: "skipped", detail: "no PDF attachment" };
  }

  // Detect fournisseur + etablissement
  const fournisseur = detectFournisseurFromEmail(from, subject);
  const etabSlug = detectEtablissementFromRecipients(to, cc, from, subject);
  const etabId = await resolveEtabId(etabSlug);

  const results = [];

  for (const pdf of pdfs) {
    try {
      // Download PDF
      const buffer = await getAttachmentBuffer(messageId, pdf.attachmentId);

      // Parse
      const text = await pdfToText(new Uint8Array(buffer));
      const parseResult = parseInvoice({
        text,
        fournisseur,
        etablissement: etabSlug,
      });

      const nbLignes = parseResult.ingredients.length;

      if (nbLignes === 0) {
        // Log no_match
        await supabaseAdmin.from("email_imports").insert({
          gmail_message_id: messageId,
          email_from: from,
          email_subject: subject,
          email_date: emailDate,
          mailbox: "gestionifratelligroup@gmail.com",
          filename: pdf.filename,
          fournisseur: fournisseur ?? "unknown",
          etablissement_id: etabId,
          invoice_number: parseResult.invoice_number,
          nb_lignes: 0,
          status: "no_match",
          error_detail: `Fournisseur non reconnu ou 0 lignes (${fournisseur ?? "unknown"})`,
        });
        results.push({ file: pdf.filename, status: "no_match", fournisseur });
        continue;
      }

      // Find or create supplier
      const supplierName = fournisseur
        ? fournisseur.charAt(0).toUpperCase() + fournisseur.slice(1)
        : "Unknown";
      const supplierId = await findOrCreateSupplier(supplierName, etabId);

      if (!supplierId) {
        await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, 0, "error", "Impossible de créer le fournisseur");
        results.push({ file: pdf.filename, status: "error", detail: "supplier creation failed" });
        continue;
      }

      // Check invoice duplicate
      if (parseResult.invoice_number) {
        const { count: invCount } = await supabaseAdmin
          .from("supplier_invoices")
          .select("id", { count: "exact", head: true })
          .eq("invoice_number", parseResult.invoice_number);
        if ((invCount ?? 0) > 0) {
          await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, 0, "duplicate", "Facture déjà importée");
          results.push({ file: pdf.filename, status: "duplicate", invoice: parseResult.invoice_number });
          continue;
        }
      }

      // Insert supplier_invoice
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("supplier_invoices")
        .insert({
          supplier_id: supplierId,
          etablissement_id: etabId,
          invoice_number: parseResult.invoice_number,
          invoice_date: parseResult.invoice_date ? ddmmyyyyToIso(parseResult.invoice_date) : null,
          total_ht: parseResult.total_ht,
          total_ttc: parseResult.total_ttc,
          source_filename: pdf.filename,
          source: "gmail_webhook",
        })
        .select("id")
        .single();

      if (invErr || !inv) {
        await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, 0, "error", invErr?.message ?? "Insert invoice failed");
        results.push({ file: pdf.filename, status: "error", detail: invErr?.message });
        continue;
      }

      // Insert invoice lines
      const lines = parseResult.ingredients
        .filter((ing) => ing.confidence !== "low")
        .map((ing) => ({
          invoice_id: inv.id,
          supplier_id: supplierId,
          sku: ing.reference ?? null,
          name: ing.name,
          quantity: 1,
          unit: ing.unit_commande === "kg" ? "kg" : "pc",
          unit_price: ing.prix_unitaire,
          total_price: ing.prix_commande,
        }));

      if (lines.length > 0) {
        const { error: linesErr } = await supabaseAdmin.from("supplier_invoice_lines").insert(lines);
        if (linesErr) {
          console.error("Insert invoice lines error:", linesErr);
        }
      }

      // Upsert supplier offers
      for (const ing of parseResult.ingredients.filter((i) => i.confidence !== "low")) {
        const { data: existingIng } = await supabaseAdmin
          .from("ingredients")
          .select("id")
          .ilike("name", ing.name)
          .maybeSingle();

        let ingredientId = existingIng?.id;
        if (!ingredientId) {
          const { data: newIng } = await supabaseAdmin
            .from("ingredients")
            .insert({
              name: ing.name,
              category: ing.categorie,
              status: "actif",
              supplier_id: supplierId,
              supplier_sku: ing.reference ?? null,
              piece_weight_g: ing.poids_unitaire ?? null,
              piece_volume_ml: ing.volume_unitaire ?? null,
              ...(etabId ? { etablissement_id: etabId } : {}),
            })
            .select("id")
            .single();
          ingredientId = newIng?.id;
        }

        if (ingredientId) {
          await supabaseAdmin.from("supplier_offers").upsert(
            {
              ingredient_id: ingredientId,
              supplier_id: supplierId,
              unit: ing.unit_commande === "kg" ? "kg" : "piece",
              unit_price: ing.prix_unitaire,
              establishment: etabSlug === "piccola-mia" ? "piccola" : etabSlug === "bello-mio" ? "bellomio" : "both",
              is_active: true,
              valid_from: new Date().toISOString().slice(0, 10),
            },
            { onConflict: "ingredient_id,supplier_id,unit" },
          );
        }
      }

      // Log success
      await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, nbLignes, "ok", null, inv.id);

      // Create notification
      await supabaseAdmin.from("notifications").insert({
        type: "facture_importee",
        titre: `Facture ${supplierName} importée`,
        message: `${pdf.filename} — ${nbLignes} lignes, ${parseResult.total_ttc?.toFixed(2) ?? "?"} € TTC`,
        metadata: { invoice_id: inv.id, fournisseur, filename: pdf.filename },
      }).then(() => {}, () => {}); // ignore notification errors

      results.push({
        file: pdf.filename,
        status: "ok",
        fournisseur,
        invoice: parseResult.invoice_number,
        nb_lignes: nbLignes,
        total_ttc: parseResult.total_ttc,
      });
    } catch (e) {
      const detail = e instanceof Error ? e.message : "Unknown error";
      await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, null, 0, "error", detail);
      results.push({ file: pdf.filename, status: "error", detail });
    }
  }

  return { messageId, results };
}

// ── Log helper ───────────────────────────────────────────────────────────────

async function logImport(
  gmailMessageId: string,
  from: string,
  subject: string,
  emailDate: string | null,
  filename: string,
  fournisseur: string | null,
  etabId: string | null,
  invoiceNumber: string | null,
  nbLignes: number,
  status: string,
  errorDetail: string | null,
  invoiceId?: string,
) {
  await supabaseAdmin.from("email_imports").insert({
    gmail_message_id: gmailMessageId,
    email_from: from,
    email_subject: subject,
    email_date: emailDate,
    mailbox: "gestionifratelligroup@gmail.com",
    filename,
    fournisseur: fournisseur ?? "unknown",
    etablissement_id: etabId,
    invoice_number: invoiceNumber,
    nb_lignes: nbLignes,
    status,
    error_detail: errorDetail,
    invoice_id: invoiceId ?? null,
  });
}
