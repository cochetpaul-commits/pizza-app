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
  // Generic CB incoming (positive amount)
  if (/^CB\s/.test(upper) && amount > 0) {
    return "encaissement_cb";
  }

  // SEPA wires
  if (upper.includes("VIR SEPA") || upper.includes("VIR INST") || upper.includes("VIREMENT")) {
    return amount >= 0 ? "virement_entrant" : "virement_sortant";
  }

  // Direct debits
  if (upper.includes("PRLV") || upper.includes("PRELEVEMENT")) {
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

  // Main operation parsing
  // Pattern: label ... [+-] amount [DD/MM/YYYY]
  // Amount pattern: [+-] digits_with_spaces , 2digits
  const opRegex = /^(.+?)\s+([+-])\s*([\d\s]+,\d{2})(?:\s+(\d{2}\/\d{2}\/\d{4}))?\s*$/;
  // Alternative: date at the beginning
  const opRegexDateFirst = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([+-])\s*([\d\s]+,\d{2})\s*$/;
  // Alternative: date then label then amount (no explicit sign, inferred from column position)
  const opRegexSimple = /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d\s]+,\d{2})\s*$/;

  let lastOpIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Skip header/footer lines
    if (/^(page|date|lib[ée]ll[ée]|montant|valeur|solde|total|caisse|relev|www\.|tél)/i.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}$/.test(line)) continue; // bare date fragments

    let match = line.match(opRegex);
    if (match) {
      const label = match[1].trim();
      const sign = match[2] === "+" ? 1 : -1;
      const amount = parseFrenchAmount(match[3]) * sign;
      const dateStr = match[4] ? parseFrenchDate(match[4]) : null;

      // Try to extract value date from label (6-digit pattern like 011025 = 01/10/25)
      let valueDate: string | null = null;
      const vdMatch = label.match(/(\d{2})(\d{2})(\d{2})(?:\s|$)/);
      if (vdMatch) {
        const year = parseInt(vdMatch[3]) + 2000;
        valueDate = `${year}-${vdMatch[2]}-${vdMatch[1]}`;
      }

      operations.push({
        operation_date: dateStr ?? valueDate ?? "",
        value_date: valueDate,
        label,
        amount,
        category: categorize(label, amount),
      });
      lastOpIndex = operations.length - 1;
      continue;
    }

    // Date-first format
    match = line.match(opRegexDateFirst);
    if (match) {
      const dateStr = parseFrenchDate(match[1]);
      const label = match[2].trim();
      const sign = match[3] === "+" ? 1 : -1;
      const amount = parseFrenchAmount(match[4]) * sign;

      operations.push({
        operation_date: dateStr ?? "",
        value_date: null,
        label,
        amount,
        category: categorize(label, amount),
      });
      lastOpIndex = operations.length - 1;
      continue;
    }

    // Simple format (no sign)
    match = line.match(opRegexSimple);
    if (match) {
      const dateStr = parseFrenchDate(match[1]);
      const label = match[2].trim();
      const amount = parseFrenchAmount(match[3]);

      operations.push({
        operation_date: dateStr ?? "",
        value_date: null,
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
