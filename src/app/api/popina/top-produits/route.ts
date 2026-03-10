import { NextResponse } from "next/server";
import { fetchReports, getParisDate, aggregateProducts } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const from = getParisDate(-6);
  const to = getParisDate(0);

  const reports = await fetchReports(apiKey, from, to);
  const products = aggregateProducts(reports);
  const top10 = products.slice(0, 10).map((p) => ({
    name: p.name,
    quantity: p.quantity,
    totalSales: Math.round((p.totalSales / 100) * 100) / 100,
  }));

  return NextResponse.json({ products: top10 });
}
