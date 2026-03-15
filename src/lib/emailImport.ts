/**
 * Email invoice import — fetches PDFs from IMAP mailboxes
 *
 * Each mailbox maps to an établissement:
 *   facture@bellomio.fr    → Bello Mio
 *   facture@piccolamia.fr  → Piccola Mia
 *
 * Flow:
 *   1. Connect IMAP (TLS)
 *   2. Fetch UNSEEN emails with .pdf attachments
 *   3. For each PDF: pdfToText → parseInvoice (auto-detect supplier)
 *   4. Log result in email_imports
 *   5. Mark email as SEEN
 */

import { ImapFlow } from "imapflow";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { pdfToText } from "@/lib/pdfToText";
import { parseInvoice } from "@/lib/parsers";
import type { ParseResult } from "@/lib/parsers";

// ── Types ────────────────────────────────────────────────────────────────────

export type MailboxConfig = {
  label: string;
  host: string;
  port: number;
  user: string;
  password: string;
  etablissementSlug: string; // "bello_mio" | "piccola_mia"
};

export type ImportLogEntry = {
  mailbox: string;
  email_from: string | null;
  email_subject: string | null;
  email_date: string | null;
  email_uid: string;
  filename: string;
  fournisseur: string | null;
  etablissement_id: string | null;
  invoice_number: string | null;
  nb_lignes: number;
  status: "ok" | "error" | "duplicate" | "no_match" | "skipped";
  error_detail: string | null;
  invoice_id: string | null;
};

// ── Config from env ──────────────────────────────────────────────────────────

export function getMailboxConfigs(): MailboxConfig[] {
  const configs: MailboxConfig[] = [];

  // Bello Mio
  const bmUser = process.env.IMAP_USER_BELLOMIO;
  const bmPass = process.env.IMAP_PASSWORD_BELLOMIO;
  if (bmUser && bmPass) {
    configs.push({
      label: "Bello Mio",
      host: process.env.IMAP_HOST_BELLOMIO || process.env.IMAP_HOST || "imap.gmail.com",
      port: parseInt(process.env.IMAP_PORT_BELLOMIO || process.env.IMAP_PORT || "993"),
      user: bmUser,
      password: bmPass,
      etablissementSlug: "bello_mio",
    });
  }

  // Piccola Mia
  const pmUser = process.env.IMAP_USER_PICCOLAMIA;
  const pmPass = process.env.IMAP_PASSWORD_PICCOLAMIA;
  if (pmUser && pmPass) {
    configs.push({
      label: "Piccola Mia",
      host: process.env.IMAP_HOST_PICCOLAMIA || process.env.IMAP_HOST || "imap.gmail.com",
      port: parseInt(process.env.IMAP_PORT_PICCOLAMIA || process.env.IMAP_PORT || "993"),
      user: pmUser,
      password: pmPass,
      etablissementSlug: "piccola_mia",
    });
  }

  return configs;
}

// ── Resolve etablissement ID from slug ───────────────────────────────────────

async function resolveEtabId(slug: string): Promise<string | null> {
  // Match by slug in nom (case-insensitive partial)
  const searchTerms: Record<string, string[]> = {
    bello_mio: ["bello", "bellomio"],
    piccola_mia: ["piccola", "piccolamia"],
  };
  const terms = searchTerms[slug] ?? [slug];

  for (const term of terms) {
    const { data } = await supabaseAdmin
      .from("etablissements")
      .select("id")
      .ilike("nom", `%${term}%`)
      .eq("actif", true)
      .limit(1)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  // Fallback: slug field if it exists
  const { data } = await supabaseAdmin
    .from("etablissements")
    .select("id")
    .eq("actif", true)
    .order("nom")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

// ── Check duplicate ──────────────────────────────────────────────────────────

async function isDuplicate(mailbox: string, uid: string): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("email_imports")
    .select("id", { count: "exact", head: true })
    .eq("mailbox", mailbox)
    .eq("email_uid", uid);
  return (count ?? 0) > 0;
}

async function isInvoiceDuplicate(fournisseur: string, invoiceNumber: string): Promise<boolean> {
  if (!invoiceNumber) return false;
  const { count } = await supabaseAdmin
    .from("supplier_invoices")
    .select("id", { count: "exact", head: true })
    .eq("invoice_number", invoiceNumber);
  return (count ?? 0) > 0;
}

// ── Process a single PDF ─────────────────────────────────────────────────────

async function processPdf(
  pdfBuffer: Uint8Array,
  _filename: string,
  etabSlug: string,
): Promise<{ parseResult: ParseResult | null; error: string | null }> {
  try {
    const text = await pdfToText(pdfBuffer);
    if (!text || text.trim().length < 20) {
      return { parseResult: null, error: "PDF vide ou illisible" };
    }

    const result = parseInvoice({
      text,
      etablissement: etabSlug,
    });

    return { parseResult: result, error: null };
  } catch (e) {
    return { parseResult: null, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Save parsed invoice to Supabase ──────────────────────────────────────────

async function saveInvoice(
  result: ParseResult,
  etabId: string,
  filename: string,
): Promise<{ invoiceId: string | null; linesInserted: number; error: string | null }> {
  // 1. Find or create supplier
  const supplierName = result.fournisseur.toUpperCase();
  const { data: supplier } = await supabaseAdmin
    .from("suppliers")
    .select("id")
    .eq("etablissement_id", etabId)
    .ilike("name", supplierName)
    .maybeSingle();

  let supplierId = supplier?.id;
  if (!supplierId) {
    const { data: newSup } = await supabaseAdmin
      .from("suppliers")
      .insert({ name: supplierName, etablissement_id: etabId, is_active: true })
      .select("id")
      .single();
    supplierId = newSup?.id;
  }
  if (!supplierId) return { invoiceId: null, linesInserted: 0, error: "Impossible de créer le fournisseur" };

  // 2. Create supplier_invoice
  const { data: inv, error: invErr } = await supabaseAdmin
    .from("supplier_invoices")
    .insert({
      supplier_id: supplierId,
      etablissement_id: etabId,
      invoice_number: result.invoice_number,
      invoice_date: result.invoice_date ? ddmmyyyyToIso(result.invoice_date) : null,
      total_ht: result.total_ht,
      total_ttc: result.total_ttc,
      source_filename: filename,
      source: "email_auto",
    })
    .select("id")
    .single();

  if (invErr || !inv) return { invoiceId: null, linesInserted: 0, error: invErr?.message ?? "Erreur insert invoice" };

  // 3. Insert invoice lines
  const lines = result.ingredients
    .filter((ing) => ing.confidence !== "low")
    .map((ing) => ({
      invoice_id: inv.id,
      name: ing.name,
      reference: ing.reference ?? null,
      quantity: 1,
      unit: ing.unit_commande === "kg" ? "kg" : "pc",
      unit_price: ing.prix_unitaire,
      total_price: ing.prix_commande,
      piece_weight_g: ing.poids_unitaire ?? null,
    }));

  if (lines.length > 0) {
    await supabaseAdmin.from("supplier_invoice_lines").insert(lines);
  }

  // 4. Upsert supplier offers for high/medium confidence
  for (const ing of result.ingredients.filter((i) => i.confidence !== "low")) {
    // Find or create ingredient
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
        })
        .select("id")
        .single();
      ingredientId = newIng?.id;
    }

    if (ingredientId) {
      const offerUnit = ing.unit_commande === "kg" ? "kg" : "piece";
      await supabaseAdmin
        .from("supplier_offers")
        .upsert({
          ingredient_id: ingredientId,
          supplier_id: supplierId,
          unit: offerUnit,
          unit_price: ing.prix_unitaire,
          establishment: etabId,
          is_active: true,
          valid_from: result.invoice_date ? ddmmyyyyToIso(result.invoice_date) : new Date().toISOString().slice(0, 10),
        }, {
          onConflict: "ingredient_id,supplier_id,unit,establishment",
        });
    }
  }

  return { invoiceId: inv.id, linesInserted: lines.length, error: null };
}

function ddmmyyyyToIso(s: string): string | null {
  const m = s.match(/^(\d{2})[\/\-.](\d{2})[\/\-.](\d{4})$/);
  if (!m) return s; // already ISO or other format
  return `${m[3]}-${m[2]}-${m[1]}`;
}

// ── Main: process one mailbox ────────────────────────────────────────────────

export async function processMailbox(config: MailboxConfig): Promise<ImportLogEntry[]> {
  const logs: ImportLogEntry[] = [];
  const etabId = await resolveEtabId(config.etablissementSlug);

  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: true,
    auth: { user: config.user, pass: config.password },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search unseen messages
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return logs;

      // Limit to 20 emails per run to stay within timeout
      const batch = uids.slice(0, 20);

      for (const uid of batch) {
        const uidStr = String(uid);

        // Check if already processed
        if (await isDuplicate(config.user, uidStr)) {
          // Mark as seen and skip
          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          continue;
        }

        // Fetch message
        const msg = await client.fetchOne(String(uid), {
          envelope: true,
          bodyStructure: true,
          uid: true,
        }, { uid: true });

        if (!msg) {
          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          continue;
        }

        const from = msg.envelope?.from?.[0]?.address ?? null;
        const subject = msg.envelope?.subject ?? null;
        const date = msg.envelope?.date?.toISOString() ?? null;

        // Find PDF attachments in bodyStructure
        const pdfParts = findPdfParts(msg.bodyStructure);

        if (pdfParts.length === 0) {
          // No PDF — mark as seen, log as skipped
          logs.push({
            mailbox: config.user,
            email_from: from,
            email_subject: subject,
            email_date: date,
            email_uid: uidStr,
            filename: "",
            fournisseur: null,
            etablissement_id: etabId,
            invoice_number: null,
            nb_lignes: 0,
            status: "skipped",
            error_detail: "Pas de PJ PDF",
            invoice_id: null,
          });
          await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
          continue;
        }

        // Process each PDF attachment
        for (const part of pdfParts) {
          const filename = part.filename || `attachment-${uidStr}.pdf`;

          try {
            // Download attachment
            const { content } = await client.download(String(uid), part.part, { uid: true });
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const pdfBuffer = new Uint8Array(Buffer.concat(chunks));

            // Parse PDF
            const { parseResult, error: parseError } = await processPdf(
              pdfBuffer, filename, config.etablissementSlug,
            );

            if (parseError || !parseResult) {
              logs.push({
                mailbox: config.user,
                email_from: from,
                email_subject: subject,
                email_date: date,
                email_uid: uidStr,
                filename,
                fournisseur: null,
                etablissement_id: etabId,
                invoice_number: null,
                nb_lignes: 0,
                status: "error",
                error_detail: parseError ?? "Parsing échoué",
                invoice_id: null,
              });
              continue;
            }

            // Check if fournisseur detected
            if (parseResult.fournisseur === "unknown" || parseResult.ingredients.length === 0) {
              logs.push({
                mailbox: config.user,
                email_from: from,
                email_subject: subject,
                email_date: date,
                email_uid: uidStr,
                filename,
                fournisseur: parseResult.fournisseur,
                etablissement_id: etabId,
                invoice_number: parseResult.invoice_number,
                nb_lignes: 0,
                status: "no_match",
                error_detail: `Fournisseur non reconnu ou 0 lignes (${parseResult.fournisseur})`,
                invoice_id: null,
              });
              continue;
            }

            // Check invoice duplicate
            if (parseResult.invoice_number && await isInvoiceDuplicate(parseResult.fournisseur, parseResult.invoice_number)) {
              logs.push({
                mailbox: config.user,
                email_from: from,
                email_subject: subject,
                email_date: date,
                email_uid: uidStr,
                filename,
                fournisseur: parseResult.fournisseur,
                etablissement_id: etabId,
                invoice_number: parseResult.invoice_number,
                nb_lignes: parseResult.ingredients.length,
                status: "duplicate",
                error_detail: `Facture ${parseResult.invoice_number} déjà importée`,
                invoice_id: null,
              });
              continue;
            }

            // Save to Supabase
            if (!etabId) {
              logs.push({
                mailbox: config.user,
                email_from: from,
                email_subject: subject,
                email_date: date,
                email_uid: uidStr,
                filename,
                fournisseur: parseResult.fournisseur,
                etablissement_id: null,
                invoice_number: parseResult.invoice_number,
                nb_lignes: parseResult.ingredients.length,
                status: "error",
                error_detail: "Établissement non trouvé en base",
                invoice_id: null,
              });
              continue;
            }

            const { invoiceId, linesInserted, error: saveError } = await saveInvoice(
              parseResult, etabId, filename,
            );

            logs.push({
              mailbox: config.user,
              email_from: from,
              email_subject: subject,
              email_date: date,
              email_uid: uidStr,
              filename,
              fournisseur: parseResult.fournisseur,
              etablissement_id: etabId,
              invoice_number: parseResult.invoice_number,
              nb_lignes: linesInserted,
              status: saveError ? "error" : "ok",
              error_detail: saveError,
              invoice_id: invoiceId,
            });
          } catch (e) {
            logs.push({
              mailbox: config.user,
              email_from: from,
              email_subject: subject,
              email_date: date,
              email_uid: uidStr,
              filename,
              fournisseur: null,
              etablissement_id: etabId,
              invoice_number: null,
              nb_lignes: 0,
              status: "error",
              error_detail: e instanceof Error ? e.message : String(e),
              invoice_id: null,
            });
          }
        }

        // Mark email as seen
        await client.messageFlagsAdd({ uid }, ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e) {
    logs.push({
      mailbox: config.user,
      email_from: null,
      email_subject: null,
      email_date: null,
      email_uid: "connection_error",
      filename: "",
      fournisseur: null,
      etablissement_id: etabId,
      invoice_number: null,
      nb_lignes: 0,
      status: "error",
      error_detail: `Connexion IMAP: ${e instanceof Error ? e.message : String(e)}`,
      invoice_id: null,
    });
  }

  // Save all logs to database
  if (logs.length > 0) {
    await supabaseAdmin.from("email_imports").insert(logs);
  }

  return logs;
}

// ── Find PDF parts in MIME bodyStructure ──────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPdfParts(structure: any): { part: string; filename: string }[] {
  if (!structure) return [];
  const results: { part: string; filename: string }[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function walk(node: any) {
    const type = `${node.type ?? ""}/${node.subtype ?? ""}`.toLowerCase();
    const fname: string = node.dispositionParameters?.filename
      || node.parameters?.name
      || "";

    // Match PDF by MIME type or filename extension
    if (
      type === "application/pdf" ||
      type === "application/x-pdf" ||
      (fname && fname.toLowerCase().endsWith(".pdf"))
    ) {
      results.push({ part: node.part || "1", filename: fname || "attachment.pdf" });
    }

    // Recurse into child nodes (multipart messages)
    if (node.childNodes) {
      for (const child of node.childNodes) {
        walk(child);
      }
    }
  }

  walk(structure);
  return results;
}
