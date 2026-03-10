import { NextResponse } from "next/server";
import { POPINA_BASE, LOCATION_ID, getParisDate } from "@/lib/popinaClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const apiKey = process.env.POPINA_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "POPINA_API_KEY manquant" }, { status: 500 });
  }

  const today = getParisDate(0);
  const results: Record<string, unknown> = { today, locationId: LOCATION_ID };

  // ── Test 1 : sans filtre ──────────────────────────────────────────────────
  const url1 = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}`;
  console.log("[Popina debug] Test 1 (sans filtre) →", url1);
  try {
    const r1 = await fetch(url1, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const status1 = r1.status;
    const text1 = await r1.text();
    console.log("[Popina debug] Test 1 status:", status1);
    console.log("[Popina debug] Test 1 body:", text1.slice(0, 2000));
    let json1: unknown;
    try { json1 = JSON.parse(text1); } catch { json1 = text1; }
    results.test1_noFilter = { url: url1, status: status1, body: json1 };
  } catch (e) {
    results.test1_noFilter = { error: String(e) };
  }

  // ── Test 2 : with from/to today ──────────────────────────────────────────
  const url2 = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}&from=${today}&to=${today}`;
  console.log("[Popina debug] Test 2 (today) →", url2);
  try {
    const r2 = await fetch(url2, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const status2 = r2.status;
    const text2 = await r2.text();
    console.log("[Popina debug] Test 2 status:", status2);
    console.log("[Popina debug] Test 2 body:", text2.slice(0, 2000));
    let json2: unknown;
    try { json2 = JSON.parse(text2); } catch { json2 = text2; }
    results.test2_today = { url: url2, status: status2, body: json2 };
  } catch (e) {
    results.test2_today = { error: String(e) };
  }

  // ── Test 3 : startedAt / finalizedAt (noms alternatifs) ──────────────────
  const url3 = `${POPINA_BASE}/reports?locationId=${LOCATION_ID}&startedAt=${today}&finalizedAt=${today}`;
  console.log("[Popina debug] Test 3 (startedAt/finalizedAt) →", url3);
  try {
    const r3 = await fetch(url3, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const status3 = r3.status;
    const text3 = await r3.text();
    console.log("[Popina debug] Test 3 status:", status3);
    console.log("[Popina debug] Test 3 body:", text3.slice(0, 2000));
    let json3: unknown;
    try { json3 = JSON.parse(text3); } catch { json3 = text3; }
    results.test3_startedAt = { url: url3, status: status3, body: json3 };
  } catch (e) {
    results.test3_startedAt = { error: String(e) };
  }

  // ── Test 4 : sans locationId (vérif si obligatoire) ──────────────────────
  const url4 = `${POPINA_BASE}/reports`;
  console.log("[Popina debug] Test 4 (sans locationId) →", url4);
  try {
    const r4 = await fetch(url4, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    const status4 = r4.status;
    const text4 = await r4.text();
    console.log("[Popina debug] Test 4 status:", status4);
    console.log("[Popina debug] Test 4 body:", text4.slice(0, 2000));
    let json4: unknown;
    try { json4 = JSON.parse(text4); } catch { json4 = text4; }
    results.test4_noLocationId = { url: url4, status: status4, body: json4 };
  } catch (e) {
    results.test4_noLocationId = { error: String(e) };
  }

  return NextResponse.json(results, { status: 200 });
}
