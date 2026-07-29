import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pdfToText } from "@/lib/pdfToText";
import { detectInvoice } from "@/lib/invoices/invoiceDetector";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = SupabaseClient<any, any, any>;

export const runtime = "nodejs";
export const maxDuration = 120; // 2 min max for Vercel cron

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const IMAP_HOST = process.env.IMAP_HOST ?? "glacier.mxrouting.net";
const IMAP_PORT = parseInt(process.env.IMAP_PORT ?? "993");

const ACCOUNTS = [
  {
    user: process.env.IMAP_USER_BELLOMIO ?? "",
    pass: process.env.IMAP_PASSWORD_BELLOMIO ?? "",
    etabSlug: "bello_mio",
    label: "Bello Mio",
  },
  {
    user: process.env.IMAP_USER_PICCOLAMIA ?? "",
    pass: process.env.IMAP_PASSWORD_PICCOLAMIA ?? "",
    etabSlug: "piccola_mia",
    label: "Piccola Mia",
  },
];

const STORAGE_BUCKET = "email-invoices";

type ImportedFile = {
  account: string;
  uid: string;
  filename: string;
  supplier: string | null;
  status: string;
};

async function ensureBucket(supabase: AnySupabase) {
  const { data } = await supabase.storage.getBucket(STORAGE_BUCKET);
  if (!data) {
    await supabase.storage.createBucket(STORAGE_BUCKET, { public: false });
  }
}

async function processAccount(
  account: typeof ACCOUNTS[0],
  supabase: AnySupabase,
  etabId: string | null,
): Promise<ImportedFile[]> {
  if (!account.user || !account.pass) return [];

  const results: ImportedFile[] = [];

  const client = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: account.user, pass: account.pass },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      // Search unseen messages
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) return results;

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), {
            envelope: true,
            bodyStructure: true,
            uid: true,
          });

          if (!msg) continue;

          const uidStr = String(msg.uid);
          const subject = msg.envelope?.subject ?? "(sans objet)";
          const fromAddr = msg.envelope?.from?.[0]?.address ?? "";
          const emailDate = msg.envelope?.date ?? null;

          // Check if already processed
          const { data: existing } = await supabase
            .from("email_invoices")
            .select("id")
            .eq("email_account", account.user)
            .eq("email_uid", uidStr)
            .limit(1);

          if (existing && existing.length > 0) {
            // Already processed — mark as seen and skip
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            continue;
          }

          // Find PDF attachments in body structure
          const attachments = findPdfParts(msg.bodyStructure);

          if (attachments.length === 0) {
            // No PDF — mark as seen, skip
            await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            continue;
          }

          for (const att of attachments) {
            const filename = att.filename ?? `facture_${uidStr}.pdf`;

            // Download the attachment
            const { content } = await client.download(String(uid), att.part, { uid: true });
            const chunks: Buffer[] = [];
            for await (const chunk of content) {
              chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            }
            const pdfBytes = new Uint8Array(Buffer.concat(chunks));

            // Detect supplier from PDF text
            let detectedSupplier: string | null = null;
            let detectedSupplierName: string | null = null;
            let detectedEtab: string | null = null;
            let errorMsg: string | null = null;

            try {
              const text = await pdfToText(pdfBytes);
              const detection = detectInvoice(text);
              detectedSupplier = detection.supplier?.slug ?? null;
              detectedSupplierName = detection.supplier?.name ?? null;
              detectedEtab = detection.etablissement?.slug ?? account.etabSlug;
            } catch (e) {
              errorMsg = e instanceof Error ? e.message : String(e);
            }

            // Store PDF in Supabase Storage
            const storagePath = `${account.etabSlug}/${new Date().toISOString().slice(0, 7)}/${uidStr}_${filename}`;
            await supabase.storage
              .from(STORAGE_BUCKET)
              .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: true });

            // Insert into email_invoices table
            await supabase.from("email_invoices").insert({
              etablissement_id: etabId,
              email_account: account.user,
              email_subject: subject.slice(0, 500),
              email_from: fromAddr.slice(0, 255),
              email_date: emailDate,
              email_uid: `${uidStr}_${filename}`,
              filename,
              storage_path: storagePath,
              detected_supplier: detectedSupplier,
              detected_supplier_name: detectedSupplierName,
              detected_etab: detectedEtab ?? account.etabSlug,
              status: errorMsg ? "error" : "pending",
              error_message: errorMsg,
            });

            results.push({
              account: account.user,
              uid: uidStr,
              filename,
              supplier: detectedSupplierName,
              status: errorMsg ? "error" : "pending",
            });
          }

          // Mark as seen after processing
          await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });

        } catch (msgErr) {
          console.error(`[email-import] Error processing UID ${uid}:`, msgErr);
        }
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e) {
    console.error(`[email-import] IMAP error for ${account.user}:`, e);
    try { await client.logout(); } catch { /* ignore */ }
  }

  return results;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findPdfParts(structure: any, parentPart = ""): { part: string; filename: string | null }[] {
  const results: { part: string; filename: string | null }[] = [];
  if (!structure) return results;

  const part = parentPart || structure.part || "";

  // Check if this part is a PDF
  if (
    structure.type === "application/pdf" ||
    (structure.disposition === "attachment" && structure.parameters?.name?.toLowerCase().endsWith(".pdf")) ||
    structure.parameters?.name?.toLowerCase()?.endsWith(".pdf")
  ) {
    const name = structure.dispositionParameters?.filename
      ?? structure.parameters?.name
      ?? null;
    results.push({ part: part || "1", filename: name });
  }

  // Recurse into child parts
  if (structure.childNodes && Array.isArray(structure.childNodes)) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const childPart = part ? `${part}.${i + 1}` : String(i + 1);
      results.push(...findPdfParts(structure.childNodes[i], childPart));
    }
  }

  return results;
}

/**
 * GET /api/invoices/email-import
 * Called by Vercel cron every hour. Fetches unseen emails with PDF attachments.
 */
export async function GET(req: Request) {
  // Verify cron secret or allow manual trigger
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow without secret in dev
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  await ensureBucket(supabase);

  // Resolve etablissement IDs
  const { data: etabs } = await supabase.from("etablissements").select("id, slug");
  const etabMap: Record<string, string> = {};
  for (const e of etabs ?? []) {
    if (e.slug?.includes("bello")) etabMap["bello_mio"] = e.id;
    if (e.slug?.includes("piccola")) etabMap["piccola_mia"] = e.id;
  }

  const allResults: ImportedFile[] = [];

  for (const account of ACCOUNTS) {
    const etabId = etabMap[account.etabSlug] ?? null;
    const results = await processAccount(account, supabase, etabId);
    allResults.push(...results);
  }

  return NextResponse.json({
    ok: true,
    processed: allResults.length,
    results: allResults,
  });
}
