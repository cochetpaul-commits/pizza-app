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

  // Un seul appel pour la période — si Popina renvoie un tableau de jours, on agrège
  // Sinon on fait 7 appels séparés
  let reports = await fetchReports(apiKey, from, to);

  // Si la plage retourne un seul rapport agrégé sans reportProducts par jour,
  // on tente les 7 appels individuels
  if (reports.length === 1 && !reports[0].date) {
    const dates = Array.from({ length: 7 }, (_, i) => getParisDate(i - 6));
    const perDay = await Promise.all(dates.map((d) => fetchReports(apiKey, d, d)));
    reports = perDay.flat();
  }

  const products = aggregateProducts(reports);
  const top10 = products.slice(0, 10).map((p) => ({
    name: p.name,
    quantity: p.quantity,
    totalSales: Math.round((p.totalSales / 100) * 100) / 100,
  }));

  return NextResponse.json({ products: top10 });
}
