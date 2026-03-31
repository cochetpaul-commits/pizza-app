/**
 * Bank statement parser for Caisse d'Epargne PDF statements.
 *
 * SQL to create the table:
 * ---------------------------------------------------------
 * CREATE TABLE IF NOT EXISTS bank_operations (
 *   id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
 *   etablissement_id UUID NOT NULL,
 *   user_id UUID NOT NULL,
 *   operation_date DATE NOT NULL,
 *   value_date DATE,
 *   label TEXT NOT NULL,
 *   amount NUMERIC NOT NULL,
 *   category TEXT DEFAULT 'autre',
 *   bank_account TEXT,
 *   statement_month TEXT,
 *   source_file TEXT,
 *   created_at TIMESTAMPTZ DEFAULT now()
 * );
 * CREATE INDEX idx_bank_ops_etab_date ON bank_operations(etablissement_id, operation_date);
 * ---------------------------------------------------------
 */

export interface BankOperation {
  operation_date: string; // ISO date YYYY-MM-DD
  value_date: string | null;
  label: string;
  amount: number; // positive = credit, negative = debit
  category: string;
}

export interface ParsedStatement {
  account_number: string | null;
  statement_month: string | null; // "2025-10"
  operations: BankOperation[];
  opening_balance: number | null;
  closing_balance: number | null;
}

/**
 * Parse a French amount string like "1 440,00" or "- 1 440,00" or "+ 1 011,00"
 * Returns a number (positive or negative).
 */
function parseFrenchAmount(raw: string): number {
  // Remove non-breaking spaces and regular spaces (except the sign)
  let cleaned = raw.trim();

  // Determine sign
  let sign = 1;
  if (cleaned.startsWith("-")) {
    sign = -1;
    cleaned = cleaned.slice(1).trim();
  } else if (cleaned.startsWith("+")) {
    sign = 1;
    cleaned = cleaned.slice(1).trim();
  }

  // Remove all spaces (thousands separator)
  cleaned = cleaned.replace(/[\s\u00A0]/g, "");

  // Replace French comma with dot
  cleaned = cleaned.replace(",", ".");

  const val = parseFloat(cleaned);
  if (isNaN(val)) return 0;
  return Math.round(sign * val * 100) / 100;
}

/**
 * Parse a French date DD/MM/YYYY to ISO YYYY-MM-DD
 */
function parseFrenchDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Auto-categorize a bank operation based on its label.
 */
function categorize(label: string, amount: number): string {
  const upper = label.toUpperCase();

  // Card commissions — always starts with *CB COM
  if (upper.startsWith("*CB COM") || upper.includes("*CB COM")) {
    return "commission_cb";
  }

  // Card payments received (CB + restaurant name)
  if (/^CB\s/.test(upper) && (
    upper.includes("LA MAMMA") ||
    upper.includes("POPINA") ||
    upper.includes("BELLO") ||
    upper.includes("PICCOLA") ||
    upper.includes("SASHA") ||
    upper.includes("FRATELLI")
  )) {
    return "encaissement_cb";
  }
  // Generic CB incoming (positive amount = card payment received)
  if (/^CB\s/.test(upper) && amount > 0) {
    return "encaissement_cb";
  }

  // CB expenses (negative amount = card purchases)
  if (/^CB\s/.test(upper) && amount < 0) {
    return "autre";
  }

  // Bank commissions (REM VIR SEPA, COMMISSIONS)
  if (upper.startsWith("COMMISSIONS") || upper.startsWith("REM VIR SEPA")) {
    return "commission_cb";
  }

  // SEPA wires
  if (upper.includes("VIR SEPA") || upper.includes("VIR INST") || upper.includes("VIREMENT")) {
    return amount >= 0 ? "virement_entrant" : "virement_sortant";
  }

  // Direct debits (LCR = Lettre de Change Relevé)
  if (upper.includes("PRLV") || upper.includes("PRELEVEMENT") || upper.startsWith("LCR ")) {
    return "prelevement";
  }

  // Bank fees
  if (upper.includes("COTIS") || upper.includes("COTISATION") || upper.includes("FRAIS BANCAIRE")) {
    return "frais_bancaires";
  }

  return "autre";
}

/**
 * Parse Caisse d'Epargne PDF text into structured operations.
 *
 * Typical line formats:
 *   VIR SEPA DA CARMELA - 1 440,00 01/10/2025
 *   CB LA MAMMA 011025 + 1 011,00 01/10/2025
 *   PRLV GENERALI IARD SA - 78,76 07/10/2025
 *   *CB COM LA MAMMA 081025 - 15,60
 *
 * Some operations span multiple lines — continuation lines (refs, details)
 * don't have the amount+date pattern and should be appended to the label.
 */
export function parseBankStatement(rawText: string): ParsedStatement {
  const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);

  let accountNumber: string | null = null;
  let statementMonth: string | null = null;
  let openingBalance: number | null = null;
  let closingBalance: number | null = null;
  const operations: BankOperation[] = [];

  // Try to extract account number
  // Patterns: "Compte N° 12345678901" or "N° compte : 12345678901"
  for (const line of lines) {
    const accMatch = line.match(/(?:compte|cpte)\s*(?:n[°o])?\s*:?\s*(\d[\d\s]{8,})/i);
    if (accMatch) {
      accountNumber = accMatch[1].replace(/\s/g, "");
      break;
    }
  }

  // Try to extract statement period
  // Patterns: "Relevé du 01/10/2025 au 31/10/2025" or "OCTOBRE 2025" or "Période du ..."
  const monthNames: Record<string, string> = {
    JANVIER: "01", FEVRIER: "02", MARS: "03", AVRIL: "04",
    MAI: "05", JUIN: "06", JUILLET: "07", AOUT: "08",
    SEPTEMBRE: "09", OCTOBRE: "10", NOVEMBRE: "11", DECEMBRE: "12",
    "FÉVRIER": "02", "AOÛT": "08", "DÉCEMBRE": "12",
  };

  for (const line of lines) {
    // "Relevé du DD/MM/YYYY au DD/MM/YYYY"
    const relMatch = line.match(/relev[ée]\s+du\s+\d{2}\/(\d{2})\/(\d{4})/i);
    if (relMatch) {
      statementMonth = `${relMatch[2]}-${relMatch[1]}`;
      break;
    }
    // "OCTOBRE 2025" standalone month
    const monthMatch = line.match(/\b([A-ZÉÈÊÀÙÂÎÔÛÜ]+)\s+(20\d{2})\b/);
    if (monthMatch && monthNames[monthMatch[1].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace("E", "E")]) {
      const key = Object.keys(monthNames).find(
        (k) => monthMatch[1].toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").startsWith(k.normalize("NFD").replace(/[\u0300-\u036f]/g, ""))
      );
      if (key) {
        statementMonth = `${monthMatch[2]}-${monthNames[key]}`;
        break;
      }
    }
  }

  // Extract opening/closing balance
  for (const line of lines) {
    const openMatch = line.match(/(?:solde|ancien\s+solde|solde\s+(?:au|pr[ée]c[ée]dent|d[ée]biteur|cr[ée]diteur|initial))[^0-9]*([+-]?\s*[\d\s]+,\d{2})/i);
    if (openMatch && openingBalance === null) {
      openingBalance = parseFrenchAmount(openMatch[1]);
    }
    const closeMatch = line.match(/(?:nouveau\s+solde|solde\s+(?:final|nouveau|au\s+\d{2}\/\d{2}\/\d{4}))[^0-9]*([+-]?\s*[\d\s]+,\d{2})/i);
    if (closeMatch) {
      closingBalance = parseFrenchAmount(closeMatch[1]);
    }
  }

  // ── Clean label: strip leading/trailing dates ──
  function cleanLabel(raw: string): string {
    return raw
      // Strip leading dates like "02/02/2026 02/02/2026 " or "02/02/202602/02/2026"
      .replace(/^(?:\d{2}\/\d{2}\/\d{4})\s*(?:\d{2}\/\d{2}\/\d{4})?\s*/g, "")
      // Strip trailing dates
      .replace(/\s*\d{2}\/\d{2}\/\d{4}(?:\d{2}\/\d{2}\/\d{4})?\s*$/g, "")
      .trim();
  }

  // ── Extract dates from a line ──
  function extractDates(line: string): { date1: string | null; date2: string | null } {
    const dates = [...line.matchAll(/(\d{2}\/\d{2}\/\d{4})/g)].map(m => m[1]);
    return {
      date1: dates[0] ? parseFrenchDate(dates[0]) : null,
      date2: dates[1] ? parseFrenchDate(dates[1]) : null,
    };
  }

  // Main regex: anything containing [+-] amount pattern
  const amountRegex = /([+-])\s*([\d\s]+,\d{2})/;

  let lastOpIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (/^(page|date|lib[ée]ll[ée]|montant|valeur|solde|total|caisse|relev|www\.|tél)/i.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}$/.test(line)) continue; // bare date fragments

    // Universal approach: if line contains [+-] amount pattern, it's an operation
    const amountMatch = line.match(amountRegex);
    if (amountMatch) {
      const sign = amountMatch[1] === "+" ? 1 : -1;
      const amount = parseFrenchAmount(amountMatch[2]) * sign;

      // Extract dates from anywhere in the line
      const { date1, date2 } = extractDates(line);

      // Extract label: remove the amount part and dates
      let label = line
        .replace(/[+-]\s*[\d\s]+,\d{2}/, "") // remove amount
        .trim();
      label = cleanLabel(label); // strip dates from label

      // Skip summary/header lines
      if (/^(solde|total|encaissements?\s+carte|paiements?\s+cheque|virements?\s+re[çc]us|remises?\s+cheque|compte\s+courant|montant|detail)/i.test(label)) {
        continue;
      }
      if (!label || label.length < 3) continue;

      operations.push({
        operation_date: date1 ?? "",
        value_date: date2,
        label,
        amount,
        category: categorize(label, amount),
      });
      lastOpIndex = operations.length - 1;
      continue;
    }

    // Continuation line — append to previous operation's label
    if (lastOpIndex >= 0 && line.length > 2 && !/^\d/.test(line)) {
      // Skip lines that look like balances or headers
      if (!/solde|total|page|relevé/i.test(line)) {
        operations[lastOpIndex].label += " " + line;
      }
    }
  }

  // If we couldn't extract statement_month from headers, infer from operations
  if (!statementMonth && operations.length > 0) {
    const firstDate = operations.find((o) => o.operation_date)?.operation_date;
    if (firstDate && firstDate.length >= 7) {
      statementMonth = firstDate.slice(0, 7);
    }
  }

  return {
    account_number: accountNumber,
    statement_month: statementMonth,
    operations,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
  };
}
