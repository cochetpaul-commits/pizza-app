"use client";

import { useState, useEffect, useMemo, useCallback, useRef, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { NavBar } from "@/components/NavBar";

/* ══════════════════════════════════════════════════════
   TYPES
   ══════════════════════════════════════════════════════ */

type BankOp = {
  id: string;
  operation_date: string;
  value_date: string | null;
  label: string;
  amount: number;
  category: string;
  bank_account: string | null;
  statement_month: string | null;
  source_file: string | null;
};

type SupplierInvoice = {
  id: string;
  supplier_name: string | null;
  invoice_date: string | null;
  total_ht: number | null;
  total_ttc: number | null;
};

type VenteLigne = {
  ttc: number;
  date_service: string;
};

/* ══════════════════════════════════════════════════════
   CONSTANTS
   ══════════════════════════════════════════════════════ */

const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const DM = "var(--font-dm), DM Sans, sans-serif";

const fmtEur = (n: number) => Math.round(n).toLocaleString("fr-FR") + "\u202F\u20AC";
const fmtEurDec = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u202F\u20AC";
const fmtPct = (n: number) =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";

const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
};

const MONTH_NAMES = [
  "Janvier", "Fevrier", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Aout", "Septembre", "Octobre", "Novembre", "Decembre",
];

function getMonthLabel(y: number, m: number): string {
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

function getCurrentYM(): [number, number] {
  const now = new Date();
  return [now.getFullYear(), now.getMonth() + 1];
}

function ymToFrom(y: number, m: number): string {
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function ymToTo(y: number, m: number): string {
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}

function shiftYM(y: number, m: number, delta: number): [number, number] {
  const d = new Date(y, m - 1 + delta, 1);
  return [d.getFullYear(), d.getMonth() + 1];
}

/** Get fiscal year start (Oct 1) */
function getFiscalYearStart(): [number, number] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  return m >= 10 ? [y, 10] : [y - 1, 10];
}

/* ── Expense category detection ── */
const EXPENSE_CATS: { label: string; match: (label: string, category: string, supplierNames: string[]) => boolean }[] = [
  {
    label: "Fournisseurs",
    match: (lbl, _cat, suppliers) =>
      suppliers.some((s) => lbl.toUpperCase().includes(s.toUpperCase())),
  },
  {
    label: "Salaires",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return (
        (u.includes("VIREMENT") && (u.includes("SALAIRE") || u.includes("PAIE"))) ||
        u.includes("VIRT EMIS") && !u.includes("URSSAF") && !u.includes("SCI") && !u.includes("LOYER")
      );
    },
  },
  {
    label: "Charges sociales",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return ["URSSAF", "KLESIA", "PREVOYANCE", "MUTUELLE", "RETRAITE", "MALAKOFF"].some((k) => u.includes(k));
    },
  },
  {
    label: "Assurances",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return ["GENERALI", "ALAN", "ASSURANCE", "MMA", "AXA", "MAIF"].some((k) => u.includes(k));
    },
  },
  {
    label: "Loyer & charges",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return ["LOYER", "SCI", "CARMELA", "SYNDIC", "COPROPRIETE"].some((k) => u.includes(k));
    },
  },
  {
    label: "Commissions CB",
    match: (_lbl, cat) => cat === "commission_cb",
  },
  {
    label: "Leasing",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return ["CREDIPAR", "LEASE", "LOA", "LEASING", "GRENKE", "LOCAM"].some((k) => u.includes(k));
    },
  },
  {
    label: "Expert-comptable",
    match: (lbl) => {
      const u = lbl.toUpperCase();
      return ["AUDIT", "COMPTABLE", "EXPERT", "CABINET"].some((k) => u.includes(k));
    },
  },
  {
    label: "Frais bancaires",
    match: (_lbl, cat) => cat === "frais_bancaires",
  },
  {
    label: "Autres",
    match: () => true, // catch-all
  },
];

function classifyExpense(label: string, category: string, supplierNames: string[]): string {
  for (const ec of EXPENSE_CATS) {
    if (ec.match(label, category, supplierNames)) return ec.label;
  }
  return "Autres";
}

const EXPENSE_COLORS: Record<string, string> = {
  "Fournisseurs": "#D4775A",
  "Salaires": "#2563EB",
  "Charges sociales": "#7C3AED",
  "Assurances": "#0891B2",
  "Loyer & charges": "#92400E",
  "Commissions CB": "#DC2626",
  "Leasing": "#6B7280",
  "Expert-comptable": "#059669",
  "Frais bancaires": "#9CA3AF",
  "Autres": "#777",
};

/* ══════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════ */

const S = {
  card: {
    background: "#fff",
    borderRadius: 12,
    padding: "18px 20px",
    border: "1px solid #e0d8ce",
    marginBottom: 14,
  } as CSSProperties,
  sec: {
    fontSize: 9,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: "0.12em",
    color: "#777",
    marginBottom: 12,
    marginTop: 24,
  } as CSSProperties,
  bigNum: {
    fontFamily: OSWALD,
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1,
    letterSpacing: "-.02em",
  } as CSSProperties,
  label: {
    fontFamily: DM,
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  } as CSSProperties,
  badge: {
    display: "inline-block",
    fontSize: 10,
    fontWeight: 600,
    borderRadius: 8,
    padding: "2px 8px",
    letterSpacing: ".02em",
  } as CSSProperties,
  pill: {
    display: "inline-block",
    fontSize: 11,
    fontWeight: 500,
    borderRadius: 20,
    padding: "5px 14px",
    cursor: "pointer",
    border: "1px solid #ddd6c8",
    background: "#fff",
    color: "#1a1a1a",
    marginRight: 6,
    marginBottom: 6,
    transition: "all .15s",
  } as CSSProperties,
  pillActive: {
    background: "#1a1a1a",
    color: "#fff",
    borderColor: "#1a1a1a",
  } as CSSProperties,
  thCell: {
    textAlign: "left" as const,
    padding: "10px 14px",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: "#999",
    fontWeight: 500,
  } as CSSProperties,
};

/* ══════════════════════════════════════════════════════
   PERIOD TYPE
   ══════════════════════════════════════════════════════ */

type PeriodMode = "month" | "3m" | "6m" | "exercice";

function getPeriodRange(
  mode: PeriodMode,
  year: number,
  month: number,
): { from: string; to: string; months: { y: number; m: number }[] } {
  const months: { y: number; m: number }[] = [];
  let startY = year;
  let startM = month;
  let count = 1;

  if (mode === "month") {
    count = 1;
  } else if (mode === "3m") {
    count = 3;
  } else if (mode === "6m") {
    count = 6;
  } else {
    // exercice: from Oct to current month
    const [fy, fm] = getFiscalYearStart();
    startY = fy;
    startM = fm;
    // Count months from fiscal start to selected month
    let cy = fy, cm = fm;
    count = 0;
    while (cy < year || (cy === year && cm <= month)) {
      count++;
      [cy, cm] = shiftYM(cy, cm, 1);
    }
    if (count < 1) count = 1;
  }

  if (mode === "3m" || mode === "6m") {
    [startY, startM] = shiftYM(year, month, -(count - 1));
  }

  let cy = startY, cm = startM;
  for (let i = 0; i < count; i++) {
    months.push({ y: cy, m: cm });
    if (i < count - 1) [cy, cm] = shiftYM(cy, cm, 1);
  }

  const from = ymToFrom(startY, startM);
  const lastM = months[months.length - 1];
  const to = ymToTo(lastM.y, lastM.m);

  return { from, to, months };
}

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

function TresoreriePage() {
  const { current: etab } = useEtablissement();
  const etabId = etab?.id;

  // Period state
  const [curYear, curMonth] = getCurrentYM();
  const [year, setYear] = useState(curYear);
  const [month, setMonth] = useState(curMonth);
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");

  // Data
  const [ops, setOps] = useState<BankOp[]>([]);
  const [venteLines, setVenteLines] = useState<VenteLigne[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasData, setHasData] = useState(true);

  // Import
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Search / filter for operations table
  const [search, setSearch] = useState("");
  const [expandOps, setExpandOps] = useState(false);

  const period = useMemo(() => getPeriodRange(periodMode, year, month), [periodMode, year, month]);

  /* ── Data loading ── */
  const load = useCallback(async () => {
    if (!etabId) return;
    setLoading(true);
    try {
      // 1. Bank operations (paginated)
      const allOps: BankOp[] = [];
      let offset = 0;
      const PAGE = 1000;
      let more = true;
      while (more) {
        const { data, error } = await supabase
          .from("bank_operations")
          .select("id, operation_date, value_date, label, amount, category, bank_account, statement_month, source_file")
          .eq("etablissement_id", etabId)
          .gte("operation_date", period.from)
          .lte("operation_date", period.to)
          .order("operation_date", { ascending: false })
          .range(offset, offset + PAGE - 1);
        if (error) { console.error(error); break; }
        allOps.push(...(data ?? []));
        more = (data?.length ?? 0) === PAGE;
        offset += PAGE;
      }
      setOps(allOps);
      setHasData(allOps.length > 0);

      // 2. Ventes lignes (CA TTC)
      const { data: vData } = await supabase
        .from("ventes_lignes")
        .select("ttc, date_service")
        .eq("type_ligne", "Produit")
        .eq("etablissement_id", etabId)
        .gte("date_service", period.from)
        .lte("date_service", period.to);
      setVenteLines((vData ?? []) as VenteLigne[]);

      // 3. Supplier invoices
      const { data: invData } = await supabase
        .from("supplier_invoices")
        .select("id, supplier_name, invoice_date, total_ht, total_ttc")
        .eq("etablissement_id", etabId)
        .gte("invoice_date", period.from)
        .lte("invoice_date", period.to);
      setInvoices((invData ?? []) as SupplierInvoice[]);
    } catch (err) {
      console.error("[tresorerie] load error:", err);
    } finally {
      setLoading(false);
    }
  }, [etabId, period.from, period.to]);

  useEffect(() => { load(); }, [load]);

  /* ── Month navigation ── */
  const goMonth = (delta: number) => {
    const [ny, nm] = shiftYM(year, month, delta);
    setYear(ny);
    setMonth(nm);
  };

  /* ── Computed data ── */

  // Totals
  const totals = useMemo(() => {
    let credits = 0, debits = 0, cbEnc = 0, commCb = 0;
    for (const op of ops) {
      const a = Number(op.amount);
      if (a >= 0) credits += a;
      else debits += a;
      if (op.category === "encaissement_cb") cbEnc += a;
      if (op.category === "commission_cb") commCb += a;
    }
    return {
      credits: Math.round(credits * 100) / 100,
      debits: Math.round(debits * 100) / 100,
      balance: Math.round((credits + debits) * 100) / 100,
      cbEncaissements: Math.round(cbEnc * 100) / 100,
      commissionsCb: Math.round(commCb * 100) / 100,
    };
  }, [ops]);

  // CA TTC from ventes
  const caTtc = useMemo(() => {
    let total = 0;
    for (const v of venteLines) total += Number(v.ttc);
    return Math.round(total * 100) / 100;
  }, [venteLines]);

  // Ecart CA vs CB
  const ecartCaCb = useMemo(() => {
    const delta = totals.cbEncaissements - caTtc;
    const pct = caTtc !== 0 ? (delta / caTtc) * 100 : 0;
    return { delta: Math.round(delta * 100) / 100, pct };
  }, [totals.cbEncaissements, caTtc]);

  // Unique supplier names
  const supplierNames = useMemo(() => {
    const names = new Set<string>();
    for (const inv of invoices) {
      if (inv.supplier_name) names.add(inv.supplier_name);
    }
    return Array.from(names);
  }, [invoices]);

  // Expense breakdown
  const expenseBreakdown = useMemo(() => {
    const map = new Map<string, { total: number; count: number }>();
    const debits = ops.filter((op) => Number(op.amount) < 0);
    const totalSorties = debits.reduce((s, op) => s + Math.abs(Number(op.amount)), 0);

    for (const op of debits) {
      const cat = classifyExpense(op.label, op.category, supplierNames);
      const prev = map.get(cat) ?? { total: 0, count: 0 };
      prev.total += Math.abs(Number(op.amount));
      prev.count++;
      map.set(cat, prev);
    }

    return Array.from(map.entries())
      .map(([label, data]) => ({
        label,
        total: Math.round(data.total * 100) / 100,
        count: data.count,
        pct: totalSorties > 0 ? (data.total / totalSorties) * 100 : 0,
        color: EXPENSE_COLORS[label] ?? "#777",
      }))
      .sort((a, b) => b.total - a.total);
  }, [ops, supplierNames]);

  // Weekly cash flow bars
  const weeklyFlow = useMemo(() => {
    const weekMap = new Map<string, { credits: number; debits: number; label: string }>();

    for (const op of ops) {
      const d = new Date(op.operation_date + "T00:00:00");
      // Get Monday of this week
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      const monday = new Date(d);
      monday.setDate(d.getDate() + diff);
      const key = monday.toISOString().slice(0, 10);
      const wLabel = `${String(monday.getDate()).padStart(2, "0")}/${String(monday.getMonth() + 1).padStart(2, "0")}`;

      const prev = weekMap.get(key) ?? { credits: 0, debits: 0, label: wLabel };
      const a = Number(op.amount);
      if (a >= 0) prev.credits += a;
      else prev.debits += Math.abs(a);
      weekMap.set(key, prev);
    }

    return Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);
  }, [ops]);

  const maxWeekVal = useMemo(() => {
    let max = 1;
    for (const w of weeklyFlow) {
      if (w.credits > max) max = w.credits;
      if (w.debits > max) max = w.debits;
    }
    return max;
  }, [weeklyFlow]);

  // Rapprochement CA / Tresorerie by month
  const rapprochement = useMemo(() => {
    const result: {
      label: string;
      caTtc: number;
      cbEnc: number;
      commCb: number;
      ecartNet: number;
      ecartPct: number;
      status: "ok" | "warn" | "error";
    }[] = [];

    for (const pm of period.months) {
      const from = ymToFrom(pm.y, pm.m);
      const to = ymToTo(pm.y, pm.m);

      let monthCa = 0;
      for (const v of venteLines) {
        if (v.date_service >= from && v.date_service <= to) monthCa += Number(v.ttc);
      }

      let monthCb = 0, monthComm = 0;
      for (const op of ops) {
        if (op.operation_date >= from && op.operation_date <= to) {
          if (op.category === "encaissement_cb") monthCb += Number(op.amount);
          if (op.category === "commission_cb") monthComm += Number(op.amount);
        }
      }

      const net = monthCb + monthComm; // commissions are negative
      const ecart = net - monthCa;
      const pct = monthCa !== 0 ? Math.abs(ecart / monthCa) * 100 : 0;
      const status = pct < 2 ? "ok" : pct < 5 ? "warn" : "error";

      result.push({
        label: getMonthLabel(pm.y, pm.m),
        caTtc: Math.round(monthCa * 100) / 100,
        cbEnc: Math.round(monthCb * 100) / 100,
        commCb: Math.round(monthComm * 100) / 100,
        ecartNet: Math.round(ecart * 100) / 100,
        ecartPct: pct,
        status,
      });
    }
    return result;
  }, [ops, venteLines, period.months]);

  // Charges recurrentes (auto-detect)
  const chargesRecurrentes = useMemo(() => {
    // Normalize label: strip dates, numbers, extra spaces
    const normalize = (lbl: string) =>
      lbl
        .replace(/\d{2}\/\d{2}\/\d{4}/g, "")
        .replace(/\d{2}\/\d{2}/g, "")
        .replace(/\d{4,}/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();

    // Group all debits by normalized label
    const map = new Map<string, { amounts: number[]; months: Set<string>; rawLabel: string }>();
    for (const op of ops) {
      const a = Number(op.amount);
      if (a >= 0) continue;
      const key = normalize(op.label);
      if (key.length < 3) continue;
      const prev = map.get(key) ?? { amounts: [], months: new Set(), rawLabel: op.label };
      prev.amounts.push(Math.abs(a));
      prev.months.add(op.operation_date.slice(0, 7));
      map.set(key, prev);
    }

    // Only keep entries that appear in 2+ months (for multi-month periods) or 1+ for single month
    const minMonths = period.months.length > 1 ? 2 : 1;

    return Array.from(map.entries())
      .filter(([, v]) => v.months.size >= minMonths)
      .map(([key, v]) => {
        const avg = v.amounts.reduce((s, x) => s + x, 0) / v.amounts.length;
        const min = Math.min(...v.amounts);
        const max = Math.max(...v.amounts);
        let trend: string;
        if (v.amounts.length < 2) trend = "\u2192";
        else {
          const last = v.amounts[v.amounts.length - 1];
          const first = v.amounts[0];
          if (last > first * 1.05) trend = "\u2191";
          else if (last < first * 0.95) trend = "\u2193";
          else trend = "\u2192";
        }
        return {
          key,
          label: v.rawLabel,
          avg: Math.round(avg * 100) / 100,
          frequency: v.months.size,
          totalMonths: period.months.length,
          trend,
          min: Math.round(min * 100) / 100,
          max: Math.round(max * 100) / 100,
        };
      })
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 20);
  }, [ops, period.months.length]);

  // Top 10 depenses
  const topDepenses = useMemo(() => {
    return ops
      .filter((op) => Number(op.amount) < 0)
      .sort((a, b) => Number(a.amount) - Number(b.amount))
      .slice(0, 10)
      .map((op) => ({
        ...op,
        expenseCat: classifyExpense(op.label, op.category, supplierNames),
      }));
  }, [ops, supplierNames]);

  // Rapprochement fournisseurs
  const rapprochementFournisseurs = useMemo(() => {
    // Group invoices by supplier
    const invBySupplier = new Map<string, number>();
    for (const inv of invoices) {
      const name = inv.supplier_name ?? "Inconnu";
      invBySupplier.set(name, (invBySupplier.get(name) ?? 0) + (inv.total_ht ?? 0));
    }

    // For each supplier, find matching bank operations
    const result: {
      supplier: string;
      facturesHt: number;
      debitsBanque: number;
      ecart: number;
    }[] = [];

    for (const [supplier, facturesHt] of invBySupplier) {
      const matchOps = ops.filter(
        (op) => Number(op.amount) < 0 && op.label.toUpperCase().includes(supplier.toUpperCase()),
      );
      const debitsBanque = matchOps.reduce((s, op) => s + Math.abs(Number(op.amount)), 0);
      result.push({
        supplier,
        facturesHt: Math.round(facturesHt * 100) / 100,
        debitsBanque: Math.round(debitsBanque * 100) / 100,
        ecart: Math.round((debitsBanque - facturesHt) * 100) / 100,
      });
    }

    return result.sort((a, b) => b.facturesHt - a.facturesHt);
  }, [invoices, ops]);

  // Filtered ops for table
  const filteredOps = useMemo(() => {
    if (!search) return ops;
    const s = search.toLowerCase();
    return ops.filter(
      (op) => op.label.toLowerCase().includes(s) || op.category.toLowerCase().includes(s),
    );
  }, [ops, search]);

  const displayedOps = expandOps ? filteredOps : filteredOps.slice(0, 20);

  /* ── Import handler (multi-file) ── */
  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportMsg("");

    let totalImported = 0;
    let totalSkipped = 0;
    let errors = 0;
    let lastMonth: string | null = null;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetchApi("/api/tresorerie/import", { method: "POST", body: fd });
        const data = await res.json();
        if (res.ok) {
          totalImported += data.imported ?? 0;
          totalSkipped += data.skipped ?? 0;
          if (data.statement_month) lastMonth = data.statement_month;
        } else {
          errors++;
        }
      } catch {
        errors++;
      }
    }

    const parts: string[] = [];
    if (totalImported > 0) parts.push(`${totalImported} operation(s) importee(s)`);
    if (totalSkipped > 0) parts.push(`${totalSkipped} ignoree(s)`);
    if (errors > 0) parts.push(`${errors} fichier(s) en erreur`);
    setImportMsg(parts.join(", ") || "Import termine");

    if (lastMonth) {
      const [ly, lm] = lastMonth.split("-").map(Number);
      setYear(ly);
      setMonth(lm);
    }

    setTimeout(() => load(), 300);
    setImporting(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleImport(e.dataTransfer.files);
  };

  /* ══════════════════════════════════════════════════════
     RENDER
     ══════════════════════════════════════════════════════ */

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" />

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* ── Title ── */}
        <h1
          style={{
            fontFamily: OSWALD,
            fontSize: 22,
            fontWeight: 700,
            color: "#1a1a1a",
            marginBottom: 20,
          }}
        >
          Tresorerie
        </h1>

        {/* ══════ Period Navigation ══════ */}
        <div
          style={{
            ...S.card,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 10,
          }}
        >
          <button
            onClick={() => goMonth(-1)}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              padding: "4px 12px",
              color: "#1a1a1a",
              fontWeight: 700,
            }}
          >
            &lsaquo;
          </button>

          <div style={{ textAlign: "center", flex: 1 }}>
            <div
              style={{
                fontFamily: OSWALD,
                fontSize: 16,
                fontWeight: 700,
                color: "#1a1a1a",
              }}
            >
              {getMonthLabel(year, month)}
            </div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 4 }}>
              {(["month", "3m", "6m", "exercice"] as PeriodMode[]).map((pm) => {
                const labels: Record<PeriodMode, string> = {
                  month: "Ce mois",
                  "3m": "3 mois",
                  "6m": "6 mois",
                  exercice: "Exercice",
                };
                return (
                  <span
                    key={pm}
                    onClick={() => setPeriodMode(pm)}
                    style={{
                      ...S.pill,
                      ...(periodMode === pm ? S.pillActive : {}),
                      fontSize: 10,
                      padding: "3px 10px",
                      marginRight: 0,
                      marginBottom: 0,
                    }}
                  >
                    {labels[pm]}
                  </span>
                );
              })}
            </div>
          </div>

          <button
            onClick={() => goMonth(1)}
            style={{
              background: "none",
              border: "none",
              fontSize: 22,
              cursor: "pointer",
              padding: "4px 12px",
              color: "#1a1a1a",
              fontWeight: 700,
            }}
          >
            &rsaquo;
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 60, color: "#999", fontSize: 13 }}>
            Chargement...
          </div>
        )}

        {!loading && !hasData && (
          <div
            style={{
              ...S.card,
              textAlign: "center",
              padding: "40px 20px",
            }}
          >
            <div style={{ fontSize: 32, marginBottom: 12 }}>Aucune donnee bancaire</div>
            <div style={{ fontSize: 13, color: "#999", marginBottom: 20 }}>
              Importez vos releves Caisse d&apos;Epargne (PDF) pour commencer.
            </div>
          </div>
        )}

        {!loading && hasData && (
          <>
            {/* ══════ Hero KPI Cards ══════ */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 10,
                marginBottom: 14,
              }}
            >
              {/* Solde net */}
              <div style={{ ...S.card, textAlign: "center", borderLeft: "4px solid #2563EB" }}>
                <div style={S.sec}>Solde net</div>
                <div style={{ ...S.bigNum, color: totals.balance >= 0 ? "#2563EB" : "#DC2626" }}>
                  {fmtEur(totals.balance)}
                </div>
                <div style={S.label}>
                  {fmtEur(totals.credits)} entrees / {fmtEur(Math.abs(totals.debits))} sorties
                </div>
              </div>

              {/* Encaissements CB */}
              <div style={{ ...S.card, textAlign: "center", borderLeft: "4px solid #4a6741" }}>
                <div style={S.sec}>Encaissements CB</div>
                <div style={{ ...S.bigNum, color: "#4a6741" }}>
                  {fmtEur(totals.cbEncaissements)}
                </div>
                <div style={S.label}>
                  {ops.filter((o) => o.category === "encaissement_cb").length} operation(s)
                </div>
              </div>

              {/* Sorties totales */}
              <div style={{ ...S.card, textAlign: "center", borderLeft: "4px solid #DC2626" }}>
                <div style={S.sec}>Sorties totales</div>
                <div style={{ ...S.bigNum, color: "#DC2626" }}>
                  {fmtEur(Math.abs(totals.debits))}
                </div>
                <div style={S.label}>
                  {ops.filter((o) => Number(o.amount) < 0).length} debit(s)
                </div>
              </div>

              {/* Ecart CA vs CB */}
              <div style={{ ...S.card, textAlign: "center", borderLeft: "4px solid #D97706" }}>
                <div style={S.sec}>Ecart CA vs CB</div>
                <div
                  style={{
                    ...S.bigNum,
                    color: Math.abs(ecartCaCb.pct) < 2 ? "#4a6741" : "#D97706",
                  }}
                >
                  {ecartCaCb.delta >= 0 ? "+" : ""}
                  {fmtEur(ecartCaCb.delta)}
                </div>
                <div style={S.label}>
                  {ecartCaCb.pct >= 0 ? "+" : ""}
                  {fmtPct(ecartCaCb.pct)} vs CA POS ({fmtEur(caTtc)})
                </div>
              </div>
            </div>

            {/* ══════ Cash Flow Chart (Weekly Bars) ══════ */}
            {weeklyFlow.length > 0 && (
              <>
                <div style={S.sec}>Flux de tresorerie par semaine</div>
                <div style={{ ...S.card, padding: "16px 14px" }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 6,
                      alignItems: "flex-end",
                      minHeight: 140,
                    }}
                  >
                    {weeklyFlow.map((w, i) => {
                      const creditH = (w.credits / maxWeekVal) * 100;
                      const debitH = (w.debits / maxWeekVal) * 100;
                      const net = w.credits - w.debits;
                      return (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            minWidth: 0,
                          }}
                        >
                          {/* Net amount */}
                          <div
                            style={{
                              fontSize: 9,
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: net >= 0 ? "#4a6741" : "#DC2626",
                              marginBottom: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            {net >= 0 ? "+" : ""}
                            {fmtEur(net)}
                          </div>
                          {/* Credit bar */}
                          <div
                            style={{
                              width: "100%",
                              maxWidth: 40,
                              height: Math.max(creditH, 2),
                              background: "#4a674130",
                              borderRadius: "4px 4px 0 0",
                              position: "relative",
                            }}
                          >
                            <div
                              style={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: "100%",
                                background: "#4a6741",
                                borderRadius: "4px 4px 0 0",
                                opacity: 0.7,
                              }}
                            />
                          </div>
                          {/* Debit bar */}
                          <div
                            style={{
                              width: "100%",
                              maxWidth: 40,
                              height: Math.max(debitH, 2),
                              background: "#DC2626",
                              borderRadius: "0 0 4px 4px",
                              opacity: 0.7,
                            }}
                          />
                          {/* Week label */}
                          <div
                            style={{
                              fontSize: 9,
                              color: "#999",
                              marginTop: 4,
                              whiteSpace: "nowrap",
                            }}
                          >
                            S.{w.label}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center", gap: 16, marginTop: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#999" }}>
                      <div style={{ width: 10, height: 10, background: "#4a6741", borderRadius: 2, opacity: 0.7 }} />
                      Entrees
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "#999" }}>
                      <div style={{ width: 10, height: 10, background: "#DC2626", borderRadius: 2, opacity: 0.7 }} />
                      Sorties
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ══════ Repartition des sorties ══════ */}
            {expenseBreakdown.length > 0 && (
              <>
                <div style={S.sec}>Repartition des sorties</div>
                <div style={S.card}>
                  {/* Horizontal bar visualization */}
                  <div style={{ marginBottom: 16 }}>
                    <div
                      style={{
                        display: "flex",
                        height: 12,
                        borderRadius: 6,
                        overflow: "hidden",
                      }}
                    >
                      {expenseBreakdown.map((cat) => (
                        <div
                          key={cat.label}
                          style={{
                            width: `${cat.pct}%`,
                            background: cat.color,
                            minWidth: cat.pct > 0 ? 2 : 0,
                          }}
                          title={`${cat.label}: ${fmtPct(cat.pct)}`}
                        />
                      ))}
                    </div>
                  </div>
                  {/* Category list */}
                  {expenseBreakdown.map((cat, i) => (
                    <div
                      key={cat.label}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "8px 0",
                        borderBottom: i < expenseBreakdown.length - 1 ? "1px solid #f0ece6" : "none",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: cat.color,
                            flexShrink: 0,
                          }}
                        />
                        <div>
                          <div style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 500 }}>
                            {cat.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#999" }}>
                            {cat.count} operation(s) &middot; {fmtPct(cat.pct)}
                          </div>
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: OSWALD,
                          fontWeight: 700,
                          fontSize: 16,
                          color: "#DC2626",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtEur(cat.total)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ══════ Rapprochement CA / Tresorerie ══════ */}
            {rapprochement.some((r) => r.caTtc > 0 || r.cbEnc > 0) && (
              <>
                <div style={S.sec}>Rapprochement CA / Tresorerie</div>
                <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      fontFamily: DM,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#faf8f5", borderBottom: "1px solid #e0d8ce" }}>
                        <th style={S.thCell}>Mois</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>CA TTC</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Enc. CB</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Comm. CB</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Ecart net</th>
                        <th style={{ ...S.thCell, textAlign: "center" }}>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rapprochement.map((r) => (
                        <tr key={r.label} style={{ borderBottom: "1px solid #f0ece6" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 500, whiteSpace: "nowrap" }}>
                            {r.label}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                            }}
                          >
                            {r.caTtc > 0 ? fmtEur(r.caTtc) : "-"}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: "#4a6741",
                            }}
                          >
                            {r.cbEnc > 0 ? fmtEur(r.cbEnc) : "-"}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: "#DC2626",
                            }}
                          >
                            {r.commCb !== 0 ? fmtEurDec(r.commCb) : "-"}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: r.ecartNet >= 0 ? "#4a6741" : "#DC2626",
                            }}
                          >
                            {r.caTtc > 0 || r.cbEnc > 0
                              ? `${r.ecartNet >= 0 ? "+" : ""}${fmtEur(r.ecartNet)}`
                              : "-"}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center" }}>
                            {r.caTtc > 0 || r.cbEnc > 0 ? (
                              <span
                                style={{
                                  ...S.badge,
                                  background:
                                    r.status === "ok"
                                      ? "#4a674115"
                                      : r.status === "warn"
                                        ? "#D9770615"
                                        : "#DC262615",
                                  color:
                                    r.status === "ok"
                                      ? "#4a6741"
                                      : r.status === "warn"
                                        ? "#D97706"
                                        : "#DC2626",
                                }}
                              >
                                {r.status === "ok"
                                  ? "\u2713 OK"
                                  : r.status === "warn"
                                    ? "\u26A0 A verifier"
                                    : "\u2717 Anomalie"}
                                {" "}
                                ({fmtPct(r.ecartPct)})
                              </span>
                            ) : (
                              <span style={{ color: "#ccc", fontSize: 11 }}>-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══════ Charges Recurrentes ══════ */}
            {chargesRecurrentes.length > 0 && (
              <>
                <div style={S.sec}>Charges recurrentes (auto-detectees)</div>
                <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      fontFamily: DM,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#faf8f5", borderBottom: "1px solid #e0d8ce" }}>
                        <th style={S.thCell}>Libelle</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Montant moy.</th>
                        <th style={{ ...S.thCell, textAlign: "center" }}>Frequence</th>
                        <th style={{ ...S.thCell, textAlign: "center" }}>Tendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {chargesRecurrentes.map((ch) => (
                        <tr key={ch.key} style={{ borderBottom: "1px solid #f0ece6" }}>
                          <td
                            style={{
                              padding: "10px 14px",
                              maxWidth: 300,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                            title={ch.label}
                          >
                            {ch.label}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: "#DC2626",
                            }}
                          >
                            {fmtEurDec(ch.avg)}
                          </td>
                          <td style={{ padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#555" }}>
                            {ch.frequency}/{ch.totalMonths} mois
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "center",
                              fontSize: 16,
                              color:
                                ch.trend === "\u2191"
                                  ? "#DC2626"
                                  : ch.trend === "\u2193"
                                    ? "#4a6741"
                                    : "#999",
                            }}
                          >
                            {ch.trend}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══════ Top 10 Depenses ══════ */}
            {topDepenses.length > 0 && (
              <>
                <div style={S.sec}>Top 10 depenses</div>
                <div style={S.card}>
                  {topDepenses.map((op, i) => (
                    <div
                      key={op.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "8px 0",
                        borderBottom: i < topDepenses.length - 1 ? "1px solid #f0ece6" : "none",
                        gap: 10,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 13,
                            color: "#1a1a1a",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={op.label}
                        >
                          <span
                            style={{
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              fontSize: 12,
                              color: "#999",
                              marginRight: 6,
                            }}
                          >
                            {i + 1}.
                          </span>
                          {op.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                          {fmtDate(op.operation_date)}
                          <span
                            style={{
                              ...S.badge,
                              marginLeft: 8,
                              color: EXPENSE_COLORS[op.expenseCat] ?? "#777",
                              background: (EXPENSE_COLORS[op.expenseCat] ?? "#777") + "15",
                            }}
                          >
                            {op.expenseCat}
                          </span>
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: OSWALD,
                          fontWeight: 700,
                          fontSize: 16,
                          color: "#DC2626",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {fmtEur(Math.abs(Number(op.amount)))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* ══════ Rapprochement Fournisseurs ══════ */}
            {rapprochementFournisseurs.length > 0 && (
              <>
                <div style={S.sec}>Rapprochement fournisseurs</div>
                <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      fontSize: 13,
                      fontFamily: DM,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#faf8f5", borderBottom: "1px solid #e0d8ce" }}>
                        <th style={S.thCell}>Fournisseur</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Factures HT</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Debits banque</th>
                        <th style={{ ...S.thCell, textAlign: "right" }}>Ecart</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rapprochementFournisseurs.map((rf) => (
                        <tr key={rf.supplier} style={{ borderBottom: "1px solid #f0ece6" }}>
                          <td style={{ padding: "10px 14px", fontWeight: 500 }}>{rf.supplier}</td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                            }}
                          >
                            {fmtEurDec(rf.facturesHt)}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: "#DC2626",
                            }}
                          >
                            {rf.debitsBanque > 0 ? fmtEurDec(rf.debitsBanque) : "-"}
                          </td>
                          <td
                            style={{
                              padding: "10px 14px",
                              textAlign: "right",
                              fontFamily: OSWALD,
                              fontWeight: 600,
                              color: rf.ecart === 0 ? "#4a6741" : "#D97706",
                            }}
                          >
                            {rf.ecart !== 0
                              ? `${rf.ecart > 0 ? "+" : ""}${fmtEurDec(rf.ecart)}`
                              : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ══════ Operations List ══════ */}
            <div style={S.sec}>Operations ({ops.length})</div>
            <div style={{ marginBottom: 10 }}>
              <input
                type="text"
                placeholder="Rechercher une operation..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #ddd6c8",
                  borderRadius: 8,
                  fontSize: 13,
                  fontFamily: DM,
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ ...S.card, padding: 0, overflow: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                  fontFamily: DM,
                }}
              >
                <thead>
                  <tr style={{ background: "#faf8f5", borderBottom: "1px solid #e0d8ce" }}>
                    <th style={S.thCell}>Date</th>
                    <th style={S.thCell}>Libelle</th>
                    <th style={{ ...S.thCell, textAlign: "center" }}>Categorie</th>
                    <th style={{ ...S.thCell, textAlign: "right" }}>Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedOps.length === 0 && (
                    <tr>
                      <td colSpan={4} style={{ textAlign: "center", padding: 30, color: "#999", fontSize: 13 }}>
                        Aucune operation
                      </td>
                    </tr>
                  )}
                  {displayedOps.map((op) => {
                    const amt = Number(op.amount);
                    return (
                      <tr key={op.id} style={{ borderBottom: "1px solid #f0ece6" }}>
                        <td style={{ padding: "10px 14px", whiteSpace: "nowrap", color: "#555", fontSize: 12 }}>
                          {fmtDate(op.operation_date)}
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            maxWidth: 300,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            color: "#1a1a1a",
                          }}
                          title={op.label}
                        >
                          {op.label}
                        </td>
                        <td style={{ padding: "10px 14px", textAlign: "center" }}>
                          <span
                            style={{
                              ...S.badge,
                              color: EXPENSE_COLORS[classifyExpense(op.label, op.category, supplierNames)] ?? "#777",
                              background:
                                (EXPENSE_COLORS[classifyExpense(op.label, op.category, supplierNames)] ?? "#777") + "15",
                            }}
                          >
                            {classifyExpense(op.label, op.category, supplierNames)}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: "10px 14px",
                            textAlign: "right",
                            fontFamily: OSWALD,
                            fontWeight: 600,
                            fontSize: 14,
                            color: amt >= 0 ? "#4a6741" : "#DC2626",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {amt >= 0 ? "+" : ""}
                          {fmtEurDec(amt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {filteredOps.length > 20 && !expandOps && (
              <div style={{ textAlign: "center", marginTop: 8, marginBottom: 14 }}>
                <span
                  onClick={() => setExpandOps(true)}
                  style={{
                    ...S.pill,
                    cursor: "pointer",
                  }}
                >
                  Voir les {filteredOps.length - 20} operations restantes
                </span>
              </div>
            )}

            {expandOps && filteredOps.length > 20 && (
              <div style={{ textAlign: "center", marginTop: 8, marginBottom: 14 }}>
                <span
                  onClick={() => setExpandOps(false)}
                  style={{
                    ...S.pill,
                    cursor: "pointer",
                  }}
                >
                  Reduire
                </span>
              </div>
            )}

            <div style={{ ...S.label, textAlign: "right", marginBottom: 20 }}>
              {filteredOps.length} operation(s)
              {search ? ` (filtrees sur ${ops.length})` : ""}
            </div>
          </>
        )}

        {/* ══════ Import Section ══════ */}
        <div style={S.sec}>Import releves bancaires</div>
        <div
          style={{
            ...S.card,
            ...(dragOver
              ? { border: "2px dashed #2563EB", background: "#2563EB08" }
              : {}),
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 12,
              padding: "20px 0",
            }}
          >
            <div style={{ fontSize: 14, color: "#999", marginBottom: 4 }}>
              Glissez-deposez vos releves PDF ici
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 24px",
                borderRadius: 20,
                background: "#1a1a1a",
                color: "#fff",
                fontSize: 13,
                fontWeight: 600,
                cursor: importing ? "wait" : "pointer",
                opacity: importing ? 0.6 : 1,
              }}
            >
              {importing ? "Import en cours..." : "Selectionner des fichiers PDF"}
              <input
                ref={fileRef}
                type="file"
                accept=".pdf"
                multiple
                onChange={(e) => handleImport(e.target.files)}
                disabled={importing}
                style={{ display: "none" }}
              />
            </label>
            <div style={{ fontSize: 11, color: "#bbb" }}>
              Releve Caisse d&apos;Epargne (PDF) &middot; Plusieurs fichiers acceptes
            </div>
          </div>
          {ops.length > 0 && (
            <button type="button" onClick={async () => {
              if (!confirm("Supprimer toutes les operations bancaires et re-importer ? Les releves devront etre re-uploades.")) return;
              if (!etabId) return;
              await supabase.from("bank_operations").delete().eq("etablissement_id", etabId);
              setOps([]);
              setImportMsg("Operations supprimees. Re-importez vos releves.");
            }} style={{ marginTop: 8, padding: "6px 14px", borderRadius: 8, border: "1px solid #DC262630", background: "#DC262608", color: "#DC2626", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
              Reinitialiser les donnees
            </button>
          )}
          {importMsg && (
            <div
              style={{
                marginTop: 8,
                padding: "10px 14px",
                borderRadius: 8,
                background: importMsg.includes("erreur") ? "#DC262615" : "#4a674115",
                color: importMsg.includes("erreur") ? "#DC2626" : "#4a6741",
                fontSize: 13,
                textAlign: "center",
              }}
            >
              {importMsg}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Export with role guard ── */
export default function TresoreriePageWrapper() {
  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <TresoreriePage />
    </RequireRole>
  );
}
