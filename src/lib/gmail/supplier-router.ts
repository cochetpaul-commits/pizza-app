/**
 * Supplier router — maps email sender to parser + establishment
 */

// ── Sender → fournisseur mapping ─────────────────────────────────────────────

const FROM_TO_SUPPLIER: Record<string, string> = {
  "info@maeldistribution.com": "mael",
  "kcoulombel@amehasle.com": "generic",
  "comptabiliteclientsgrp@maison-masse.com": "masse",
  "facture.carniato@carniato.com": "carniato",
  "comptabilite@armor-emballages.fr": "armor",
  "compta@sum-online.fr": "sum",
  "vinoflo-mb@live.fr": "vinoflo",
  "sdpfcompta@hotmail.com": "sdpf",
  "secretariat@eric-elien.bzh": "generic",
  "cochetpaul@bellomio.fr": "metro",
};

/** Extract email address from "Name <email@domain>" format */
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

/** Detect fournisseur from sender email. Falls back to subject-based detection. */
export function detectFournisseurFromEmail(
  from: string,
  subject?: string | null,
): string | null {
  const email = extractEmail(from);

  // Direct match
  const direct = FROM_TO_SUPPLIER[email];
  if (direct && direct !== "metro") return direct;

  // Metro special case: forwarded from Paul, detect via subject
  if (direct === "metro" || email.includes("cochetpaul")) {
    const sub = (subject ?? "").toUpperCase();
    if (sub.includes("METRO")) return "metro";
    if (sub.includes("COZIGOU")) return "cozigou";
    if (sub.includes("BAR SPIRITS") || sub.includes("BARSPIRITS")) return "bar_spirits";
    if (sub.includes("LMDW")) return "lmdw";
    // Fallback: try generic parser
    return "generic";
  }

  // Domain-based fallback
  const domain = email.split("@")[1];
  if (domain) {
    for (const [key, supplier] of Object.entries(FROM_TO_SUPPLIER)) {
      if (key.endsWith(`@${domain}`)) return supplier;
    }
  }

  return null;
}

// ── Recipient → établissement mapping ────────────────────────────────────────

const RECIPIENT_TO_ETAB: Record<string, string> = {
  "facture@bellomio.fr": "bello-mio",
  "facture@piccolamia.fr": "piccola-mia",
};

/** Detect établissement from To/Cc headers */
export function detectEtablissementFromRecipients(
  to: string | null,
  cc: string | null,
): string | null {
  const all = [to, cc].filter(Boolean).join(",").toLowerCase();

  for (const [email, slug] of Object.entries(RECIPIENT_TO_ETAB)) {
    if (all.includes(email)) return slug;
  }

  // Default: if sent to gestionifratelligroup, try to detect from content later
  return null;
}
