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
    pass: process.env.IMAP_PASSWORD_BELLOMIO ?? process.env.IMAP_PASS_BELLOMIO ?? "",
    etabSlug: "bello_mio",
    label: "Bello Mio",
  },
  {
    user: process.env.IMAP_USER_PICCOLAMIA ?? "",
    pass: process.env.IMAP_PASSWORD_PICCOLAMIA ?? process.env.IMAP_PASS_PICCOLAMIA ?? "",
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
  reqUrl: string,
  dbg?: string[],
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
      // Use NOOP to refresh mailbox state, then get real count
      try { await client.noop(); } catch { /* ignore */ }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const totalMsgs = (client.mailbox as any)?.exists ?? 0;
      dbg?.push(`${account.label}: ${totalMsgs} mails`);
      if (totalMsgs === 0) { lock.release(); await client.logout(); return results; }

      // Fetch 1 message at offset from the end
      const offset = parseInt(new URL(reqUrl).searchParams.get("offset") ?? "0") || 0;
      // Use "*" for offset 0 to always get the absolute last message
      const seqStr = offset === 0 ? "*" : String(Math.max(1, totalMsgs - offset));
      dbg?.push(`  Fetch seq ${seqStr} (offset ${offset})...`);

      let msgCount = 0;
      for await (const msg of client.fetch(`${seqStr}:${seqStr}`, { envelope: true, bodyStructure: true, uid: true })) {
        msgCount++;
        try {
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

          if (existing && existing.length > 0) { continue; }

          // Find PDF attachments in body structure
          const attachments = findPdfParts(msg.bodyStructure);
          // Debug: collect all part types
          const partTypes: string[] = [];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const collectTypes = (s: any) => {
            if (!s) return;
            if (s.type) partTypes.push(`${s.type}${s.dispositionParameters?.filename ? ` [${s.dispositionParameters.filename}]` : s.parameters?.name ? ` [${s.parameters.name}]` : ""}`);
            if (s.childNodes) for (const c of s.childNodes) collectTypes(c);
          };
          collectTypes(msg.bodyStructure);
          dbg?.push(`  #${msgCount} UID ${uidStr}: "${subject.slice(0, 35)}" — ${attachments.length} PDF | ${partTypes.join(", ").slice(0, 100)}`);

          if (attachments.length === 0) { continue; }

          for (const att of attachments) {
            const filename = att.filename ?? `facture_${uidStr}.pdf`;

            // Download the attachment
            const { content } = await client.download(uidStr, att.part, { uid: true });
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

        } catch (msgErr) {
          const errMsg = msgErr instanceof Error ? msgErr.message : String(msgErr);
          console.error(`[email-import] Error processing msg:`, errMsg);
          dbg?.push(`  #${msgCount}: ERREUR — ${errMsg.slice(0, 120)}`);
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
function findPdfParts(structure: any, parentPart = "", dbg?: string[]): { part: string; filename: string | null }[] {
  const results: { part: string; filename: string | null }[] = [];
  if (!structure) return results;

  const part = parentPart || structure.part || "";
  const type = (structure.type ?? "").toLowerCase();
  const disp = (structure.disposition ?? "").toLowerCase();

  // Get filename from various locations
  const filename = structure.dispositionParameters?.filename
    ?? structure.parameters?.name
    ?? null;
  const fnLower = (filename ?? "").toLowerCase();

  // Check if this part is a PDF
  if (
    type === "application/pdf" ||
    type === "application/x-pdf" ||
    type === "application/octet-stream" && fnLower.endsWith(".pdf") ||
    (disp === "attachment" && fnLower.endsWith(".pdf")) ||
    fnLower.endsWith(".pdf")
  ) {
    results.push({ part: part || "1", filename });
  }

  // Recurse into child parts
  if (structure.childNodes && Array.isArray(structure.childNodes)) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const childPart = part ? `${part}.${i + 1}` : String(i + 1);
      results.push(...findPdfParts(structure.childNodes[i], childPart, dbg));
    }
  }

  return results;
}

/**
 * GET /api/invoices/email-import
 * Called by Vercel cron every hour. Fetches unseen emails with PDF attachments.
 */
export async function GET(req: Request) {
  const testOnly = new URL(req.url).searchParams.get("test") === "1";

  if (testOnly) {
    // Quick IMAP test + fetch last message metadata
    const testResults: string[] = [];
    const acctParam = new URL(req.url).searchParams.get("account");
    const accts = acctParam === "pm" ? [ACCOUNTS[1]] : acctParam === "bm" ? [ACCOUNTS[0]] : ACCOUNTS;
    for (const account of accts) {
      if (!account.user || !account.pass) {
        testResults.push(`${account.label}: identifiants manquants`);
        continue;
      }
      try {
        const c = new ImapFlow({ host: IMAP_HOST, port: IMAP_PORT, secure: true, auth: { user: account.user, pass: account.pass }, logger: false });
        await c.connect();
        const lock = await c.getMailboxLock("INBOX");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exists = (c.mailbox as any)?.exists ?? 0;
        testResults.push(`${account.label}: ${exists} mails`);
        // Fetch last message envelope + bodyStructure
        if (exists > 0) {
          for await (const msg of c.fetch(`${exists}:${exists}`, { envelope: true, bodyStructure: true, uid: true })) {
            const subject = msg.envelope?.subject ?? "(sans objet)";
            const partTypes: string[] = [];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const collectTypes = (s: any) => {
              if (!s) return;
              if (s.type) partTypes.push(`${s.type}${s.dispositionParameters?.filename ? ` [${s.dispositionParameters.filename}]` : s.parameters?.name ? ` [${s.parameters.name}]` : ""}`);
              if (s.childNodes) for (const ch of s.childNodes) collectTypes(ch);
            };
            collectTypes(msg.bodyStructure);
            const pdfs = findPdfParts(msg.bodyStructure);
            testResults.push(`  Dernier: "${subject.slice(0, 50)}" — ${pdfs.length} PDF | ${partTypes.join(", ").slice(0, 120)}`);
          }
        }
        lock.release();
        await c.logout();
      } catch (e) {
        testResults.push(`${account.label}: ERREUR — ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return NextResponse.json({ ok: true, test: testResults });
  }

  try {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  // Bucket creation skipped — do it lazily on first upload or create manually

  // Resolve etablissement IDs
  const { data: etabs } = await supabase.from("etablissements").select("id, slug");
  const etabMap: Record<string, string> = {};
  for (const e of etabs ?? []) {
    if (e.slug?.includes("bello")) etabMap["bello_mio"] = e.id;
    if (e.slug?.includes("piccola")) etabMap["piccola_mia"] = e.id;
  }

  const debug = new URL(req.url).searchParams.get("debug") === "1";
  const allResults: ImportedFile[] = [];
  const errors: string[] = [];
  const debugInfo: string[] = [];

  // Process only one account per call to stay within timeout
  const acctParam = new URL(req.url).searchParams.get("account");
  const accountsToProcess = acctParam === "pm" ? [ACCOUNTS[1]] : acctParam === "bm" ? [ACCOUNTS[0]] : [ACCOUNTS[0]]; // default to BM

  for (const account of accountsToProcess) {
    if (!account.user || !account.pass) {
      errors.push(`${account.label}: identifiants manquants`);
      continue;
    }
    const etabId = etabMap[account.etabSlug] ?? null;
    try {
      const results = await processAccount(account, supabase, etabId, req.url, debug ? debugInfo : undefined);
      allResults.push(...results);
    } catch (e) {
      errors.push(`${account.label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed: allResults.length,
    results: allResults,
    errors: errors.length > 0 ? errors : undefined,
    debug: debug ? debugInfo : undefined,
  });
  } catch (globalErr) {
    return NextResponse.json({
      ok: false,
      error: globalErr instanceof Error ? globalErr.message : String(globalErr),
    }, { status: 500 });
  }
}
