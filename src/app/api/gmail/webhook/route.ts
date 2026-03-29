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

/** Normalize name for fuzzy matching (same as importEngine's normalizeIngredientName) */
function normalizeForMatch(name: string): string {
  return name
    .toLowerCase()
    .replace(/[«»""‟„‹›]/g, '"')
    .replace(/['''‛]/g, "'")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9"'\s%/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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
  const params = new URLSearchParams({ maxResults: "5" });
  if (labelId) params.set("labelIds", labelId);
  // Only look at messages from the last 2 hours to avoid re-processing old emails
  const qParts = ["has:attachment", "filename:pdf", "newer_than:2h"];
  params.set("q", qParts.join(" "));
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

// ── Resolve a service user_id for DB inserts ─────────────────────────────────

let _serviceUserId: string | null = null;

async function getServiceUserId(): Promise<string | null> {
  if (_serviceUserId) return _serviceUserId;
  // Pick the first admin user as the owner for webhook-created records
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("role", "group_admin")
    .limit(1)
    .maybeSingle();
  _serviceUserId = data?.id ?? null;
  if (!_serviceUserId) {
    // Fallback: pick any user
    const { data: fallback } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .limit(1)
      .maybeSingle();
    _serviceUserId = fallback?.id ?? null;
  }
  return _serviceUserId;
}

// ── Process a single Gmail message ───────────────────────────────────────────

async function processMessage(messageId: string) {
  // Check if this message was already successfully processed (has "ok" status)
  const { data: prevImport } = await supabaseAdmin
    .from("email_imports")
    .select("id, status")
    .eq("gmail_message_id", messageId)
    .eq("status", "ok")
    .limit(1)
    .maybeSingle();
  if (prevImport) {
    return { messageId, status: "duplicate", detail: "already processed" };
  }
  // Clean up any previous failed/duplicate attempts for this message
  await supabaseAdmin
    .from("email_imports")
    .delete()
    .eq("gmail_message_id", messageId)
    .neq("status", "ok");

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

      // Resolve a user_id for DB inserts
      const userId = await getServiceUserId();

      // Upsert invoice: if same supplier + invoice_number exists, reuse it (delete old lines)
      let invoiceId: string;

      if (parseResult.invoice_number) {
        const { data: existing } = await supabaseAdmin
          .from("supplier_invoices")
          .select("id")
          .eq("invoice_number", parseResult.invoice_number)
          .eq("supplier_id", supplierId)
          .maybeSingle();

        if (existing?.id) {
          // Already exists → delete old lines and reuse
          invoiceId = existing.id;
          await supabaseAdmin
            .from("supplier_invoice_lines")
            .delete()
            .eq("invoice_id", invoiceId);
        } else {
          // Create new
          const invRow: Record<string, unknown> = {
            supplier_id: supplierId,
            etablissement_id: etabId,
            invoice_number: parseResult.invoice_number,
            invoice_date: parseResult.invoice_date ? ddmmyyyyToIso(parseResult.invoice_date) : null,
            total_ht: parseResult.total_ht,
            total_ttc: parseResult.total_ttc,
            source_filename: pdf.filename,
            source: "gmail_webhook",
          };
          if (userId) invRow.user_id = userId;
          const { data: inv, error: invErr } = await supabaseAdmin
            .from("supplier_invoices")
            .insert(invRow)
            .select("id")
            .single();

          if (invErr || !inv) {
            await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, 0, "error", invErr?.message ?? "Insert invoice failed");
            results.push({ file: pdf.filename, status: "error", detail: invErr?.message });
            continue;
          }
          invoiceId = inv.id;
        }
      } else {
        // No invoice number — always create new
        const invRow: Record<string, unknown> = {
          supplier_id: supplierId,
          etablissement_id: etabId,
          invoice_date: parseResult.invoice_date ? ddmmyyyyToIso(parseResult.invoice_date) : null,
          total_ht: parseResult.total_ht,
          total_ttc: parseResult.total_ttc,
          source_filename: pdf.filename,
          source: "gmail_webhook",
        };
        if (userId) invRow.user_id = userId;
        const { data: inv, error: invErr } = await supabaseAdmin
          .from("supplier_invoices")
          .insert(invRow)
          .select("id")
          .single();

        if (invErr || !inv) {
          await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, null, 0, "error", invErr?.message ?? "Insert invoice failed");
          results.push({ file: pdf.filename, status: "error", detail: invErr?.message });
          continue;
        }
        invoiceId = inv.id;
      }

      const inv = { id: invoiceId };

      // Insert invoice lines (all lines, no confidence filter — this is invoice history)
      const lines = parseResult.ingredients.map((ing) => {
        const line: Record<string, unknown> = {
          invoice_id: inv.id,
          supplier_id: supplierId,
          sku: ing.reference ?? null,
          name: ing.name,
          quantity: 1,
          unit: ing.unit_commande === "kg" ? "kg" : "pc",
          unit_price: ing.prix_unitaire,
          total_price: ing.prix_commande,
        };
        if (userId) line.user_id = userId;
        return line;
      });

      if (lines.length > 0) {
        const { error: linesErr } = await supabaseAdmin.from("supplier_invoice_lines").insert(lines);
        if (linesErr) {
          console.error("Insert invoice lines error:", linesErr);
        }
      }

      // Upsert ingredients + supplier offers
      const supplierNameTitle = fournisseur
        ? fournisseur.charAt(0).toUpperCase() + fournisseur.slice(1)
        : "Unknown";
      const estabValue = etabSlug === "piccola-mia" ? "piccola" : etabSlug === "bello-mio" ? "bellomio" : "both";

      // ── Build lookup maps (same strategy as importEngine) ──
      // Load ALL existing ingredients to match by name/import_name/sku
      const nameToIngId = new Map<string, string>();
      const normalizedToIngId = new Map<string, string>();
      const skuToIngId = new Map<string, string>();

      const { data: allExisting } = await supabaseAdmin
        .from("ingredients")
        .select("id,name,import_name,supplier_sku");

      for (const r of (allExisting ?? []) as Array<{ id: string; name: string; import_name: string | null; supplier_sku: string | null }>) {
        // Primary key = import_name (stable); fallback to name
        const primary = ((r.import_name ?? r.name) ?? "").trim();
        nameToIngId.set(primary.toLowerCase(), r.id);
        normalizedToIngId.set(normalizeForMatch(primary), r.id);
        // Also index current name as fallback
        if (r.import_name && r.name) {
          const legacy = r.name.trim();
          if (legacy.toLowerCase() !== primary.toLowerCase()) {
            nameToIngId.set(legacy.toLowerCase(), r.id);
            normalizedToIngId.set(normalizeForMatch(legacy), r.id);
          }
        }
        // SKU index
        const sku = (r.supplier_sku ?? "").trim();
        if (sku) skuToIngId.set(sku, r.id);
      }

      for (const ing of parseResult.ingredients.filter((i) => i.confidence !== "low")) {
        const ingName = ing.name.trim().toUpperCase();
        if (!ingName) continue;

        const sku = (ing.reference ?? "").trim();

        // Match existing ingredient: SKU → exact name → normalized name → prefix
        let ingredientId =
          (sku && skuToIngId.get(sku)) ||
          nameToIngId.get(ingName.toLowerCase()) ||
          normalizedToIngId.get(normalizeForMatch(ingName)) ||
          null;
        // Fallback: prefix match — existing name is prefix of parsed name (or vice versa)
        if (!ingredientId) {
          const nmLower = ingName.toLowerCase();
          for (const [existingName, existingId] of nameToIngId) {
            if (nmLower.startsWith(existingName + " ") || existingName.startsWith(nmLower + " ")) {
              ingredientId = existingId;
              break;
            }
          }
        }

        if (!ingredientId) {
          // Create ingredient with all required fields
          const ingRow: Record<string, unknown> = {
            name: ingName,
            import_name: ingName,
            category: ing.categorie ?? "autre",
            status: "to_check",
            status_note: `Import auto ${supplierNameTitle}`,
            is_active: true,
            default_unit: ing.unit_commande === "kg" ? "kg" : "pcs",
            supplier: supplierNameTitle,
            supplier_id: supplierId,
            default_supplier_id: supplierId,
            supplier_sku: sku || null,
            piece_weight_g: ing.poids_unitaire ?? null,
            piece_volume_ml: ing.volume_unitaire ?? null,
          };
          if (userId) ingRow.user_id = userId;
          if (etabId) ingRow.etablissement_id = etabId;
          // Set establishments array for multi-etab filtering
          ingRow.establishments = estabValue === "both"
            ? ["bellomio", "piccola"]
            : [estabValue];

          const { data: newIng, error: ingErr } = await supabaseAdmin
            .from("ingredients")
            .insert(ingRow)
            .select("id")
            .single();

          if (ingErr) {
            if ((ingErr as { code?: string }).code === "23505") {
              const { data: retry } = await supabaseAdmin
                .from("ingredients")
                .select("id")
                .ilike("name", ingName)
                .maybeSingle();
              ingredientId = retry?.id ?? null;
            } else {
              console.error("Insert ingredient error:", ingErr.message, ingName);
            }
          } else {
            ingredientId = newIng?.id;
          }

          // Update maps for subsequent iterations
          if (ingredientId) {
            nameToIngId.set(ingName.toLowerCase(), ingredientId);
            normalizedToIngId.set(normalizeForMatch(ingName), ingredientId);
            if (sku) skuToIngId.set(sku, ingredientId);
          }
        }

        if (ingredientId && ing.prix_unitaire != null && ing.prix_unitaire > 0) {
          const unit = ing.unit_commande === "kg" ? "kg" : "pc";
          const offerRow: Record<string, unknown> = {
            ingredient_id: ingredientId,
            supplier_id: supplierId,
            supplier_sku: sku || null,
            supplier_label: ing.name,
            price_kind: "unit",
            unit,
            unit_price: ing.prix_unitaire,
            price: ing.prix_unitaire,
            currency: "EUR",
            establishment: estabValue,
            is_active: true,
            piece_weight_g: ing.poids_unitaire ?? null,
          };
          if (userId) offerRow.user_id = userId;
          if (etabId) offerRow.etablissement_id = etabId;

          // Deactivate previous active offer for this ingredient+supplier
          await supabaseAdmin
            .from("supplier_offers")
            .update({ is_active: false })
            .eq("ingredient_id", ingredientId)
            .eq("supplier_id", supplierId)
            .eq("is_active", true);

          // Insert new offer
          const { error: offerErr } = await supabaseAdmin.from("supplier_offers").insert(offerRow);
          if (offerErr) {
            console.error("Insert offer error:", offerErr.message, ing.name);
          }
        }
      }

      // Log success
      await logImport(messageId, from, subject, emailDate, pdf.filename, fournisseur, etabId, parseResult.invoice_number, lines.length, "ok", null, inv.id);

      // Create notification
      await supabaseAdmin.from("notifications").insert({
        type: "facture_importee",
        titre: `Facture ${supplierName} importée`,
        message: `${pdf.filename} — ${lines.length} lignes, ${parseResult.total_ttc?.toFixed(2) ?? "?"} € TTC`,
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
