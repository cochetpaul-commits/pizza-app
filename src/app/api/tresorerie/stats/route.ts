import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/tresorerie/stats?from=YYYY-MM-DD&to=YYYY-MM-DD
 * GET /api/tresorerie/stats?month=YYYY-MM
 *
 * Returns:
 * - Monthly totals (credits, debits, balance)
 * - Operations grouped by category
 * - Top expenses
 * - CB encaissements total
 * - All operations for the period
 */
export async function GET(request: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(request));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  const params = request.nextUrl.searchParams;
  const monthParam = params.get("month");
  let from = params.get("from");
  let to = params.get("to");

  // If month provided, derive from/to
  if (monthParam) {
    const [y, m] = monthParam.split("-").map(Number);
    from = `${y}-${String(m).padStart(2, "0")}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    to = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  }

  if (!from || !to) {
    return NextResponse.json({ error: "Paramètres from/to ou month requis" }, { status: 400 });
  }

  // Fetch all operations in range
  const PAGE = 1000;
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
  const allOps: BankOp[] = [];
  let offset = 0;
  let more = true;

  while (more) {
    const { data, error } = await supabaseAdmin
      .from("bank_operations")
      .select("id, operation_date, value_date, label, amount, category, bank_account, statement_month, source_file")
      .eq("etablissement_id", etabId)
      .gte("operation_date", from)
      .lte("operation_date", to)
      .order("operation_date", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    allOps.push(...(data ?? []));
    more = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }

  // Compute totals
  let totalCredits = 0;
  let totalDebits = 0;
  const categoryMap = new Map<string, { total: number; count: number }>();
  const expenses: { label: string; amount: number; date: string }[] = [];

  for (const op of allOps) {
    const amt = Number(op.amount);
    if (amt >= 0) {
      totalCredits += amt;
    } else {
      totalDebits += amt;
    }

    // By category
    const cat = op.category || "autre";
    const prev = categoryMap.get(cat) ?? { total: 0, count: 0 };
    prev.total += amt;
    prev.count++;
    categoryMap.set(cat, prev);

    // Track expenses for top list
    if (amt < 0) {
      expenses.push({ label: op.label, amount: amt, date: op.operation_date });
    }
  }

  // Sort expenses by amount (most negative first)
  expenses.sort((a, b) => a.amount - b.amount);
  const topExpenses = expenses.slice(0, 10);

  // Category breakdown
  const categories = Array.from(categoryMap.entries()).map(([name, data]) => ({
    name,
    total: Math.round(data.total * 100) / 100,
    count: data.count,
  })).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

  // CB encaissements total
  const cbTotal = categoryMap.get("encaissement_cb")?.total ?? 0;

  // Available months (for the selector)
  const { data: months } = await supabaseAdmin
    .from("bank_operations")
    .select("statement_month")
    .eq("etablissement_id", etabId)
    .not("statement_month", "is", null)
    .order("statement_month", { ascending: false });

  const uniqueMonths = [...new Set((months ?? []).map((m) => m.statement_month).filter(Boolean))];

  return NextResponse.json({
    period: { from, to },
    totals: {
      credits: Math.round(totalCredits * 100) / 100,
      debits: Math.round(totalDebits * 100) / 100,
      balance: Math.round((totalCredits + totalDebits) * 100) / 100,
    },
    categories,
    topExpenses,
    cbEncaissements: Math.round(cbTotal * 100) / 100,
    operations: allOps,
    availableMonths: uniqueMonths,
  });
}
