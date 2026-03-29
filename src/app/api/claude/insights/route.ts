import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/* ── Types ── */
type Row = {
  date_service: string;
  service: string;
  salle: string;
  operateur: string;
  categorie: string;
  description: string;
  quantite: number;
  annule: boolean;
  ttc: number;
  ht: number;
  couverts: number;
  num_fiscal: string;
  type_ligne: string;
};

type RecipeCost = { name: string; cost: number };

type InsightResult = { title: string; points: string[] };

/* ── Helpers ── */
const CAT_MAP: Record<string, string> = {
  PIZZE: "Pizze", CUCINA: "Cuisine", DOLCI: "Dolci", VINI: "Vins",
  ALCOOL: "Alcool", ANTIPASTI: "Antipasti", BEVANDE: "Boissons",
  "BEVANDE CALDE": "Boissons chaudes", DIGESTIVI: "Digestifs",
};
function normCat(cat: string | null): string {
  if (!cat) return "Autre";
  return CAT_MAP[cat.toUpperCase()] ?? cat;
}

function normalize(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
}

function getCouverts(rows: Row[]): number {
  const seen = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.date_service}:${r.num_fiscal}`;
    if (!seen.has(key)) seen.set(key, Number(r.couverts) || 0);
  }
  let total = 0;
  for (const v of seen.values()) total += v;
  if (total === 0 && seen.size > 0) return seen.size;
  return total;
}

function getTickets(rows: Row[]): number {
  return new Set(rows.map(r => `${r.date_service}:${r.num_fiscal}`)).size;
}

/* ── Fetch paginated ventes_lignes ── */
async function fetchVentes(etabId: string, from: string, to: string): Promise<Row[]> {
  const PAGE = 1000;
  const allData: Row[] = [];
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await supabase
      .from("ventes_lignes")
      .select("date_service,service,salle,operateur,categorie,description,quantite,annule,ttc,ht,couverts,num_fiscal,type_ligne")
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .order("date_service", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(error.message);
    allData.push(...((data ?? []) as Row[]));
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }
  return allData;
}

/* ── Fetch recipe costs ── */
async function fetchRecipeCosts(etabId: string): Promise<Map<string, RecipeCost>> {
  const [pizzaRes, kitchenRes, cocktailRes] = await Promise.all([
    supabase.from("pizza_recipes").select("name,total_cost").eq("is_draft", false).eq("etablissement_id", etabId),
    supabase.from("kitchen_recipes").select("name,total_cost,cost_per_portion,cost_per_kg").eq("is_draft", false).eq("etablissement_id", etabId),
    supabase.from("cocktails").select("name,total_cost").eq("is_draft", false).eq("etablissement_id", etabId),
  ]);
  const costs = new Map<string, RecipeCost>();
  for (const r of pizzaRes.data ?? []) {
    if (r.total_cost > 0) costs.set(normalize(r.name), { name: r.name, cost: r.total_cost });
  }
  for (const r of kitchenRes.data ?? []) {
    const cost = r.cost_per_portion ?? r.total_cost ?? r.cost_per_kg ?? 0;
    if (cost > 0) costs.set(normalize(r.name), { name: r.name, cost });
  }
  for (const r of cocktailRes.data ?? []) {
    if (r.total_cost > 0) costs.set(normalize(r.name), { name: r.name, cost: r.total_cost });
  }
  return costs;
}

/* ── Build data summary for Claude ── */
function buildDataSummary(rows: Row[], prevRows: Row[], recipeCosts: Map<string, RecipeCost>) {
  const productRows = rows.filter(r => r.type_ligne === "Produit");
  const valid = productRows.filter(r => !r.annule && Number(r.ttc) > 0);

  const ca_ttc = valid.reduce((s, r) => s + Number(r.ttc), 0);
  const ca_ht = valid.reduce((s, r) => s + Number(r.ht), 0);
  const couverts = getCouverts(productRows);
  const tickets = getTickets(productRows);
  const tm_ttc = couverts > 0 ? ca_ttc / couverts : 0;

  // Products aggregation
  const prodMap = new Map<string, { qty: number; ca_ttc: number; ca_ht: number; categorie: string }>();
  for (const r of valid) {
    if (!r.description) continue;
    const cat = normCat(r.categorie);
    if (cat === "Messages" || cat === "Autre") continue;
    const prev = prodMap.get(r.description);
    if (prev) {
      prev.qty += Number(r.quantite) || 1;
      prev.ca_ttc += Number(r.ttc);
      prev.ca_ht += Number(r.ht);
    } else {
      prodMap.set(r.description, { qty: Number(r.quantite) || 1, ca_ttc: Number(r.ttc), ca_ht: Number(r.ht), categorie: cat });
    }
  }

  // Top/worst products
  const products = [...prodMap.entries()].map(([name, v]) => ({ name, ...v }));
  products.sort((a, b) => b.ca_ttc - a.ca_ttc);
  const top5 = products.slice(0, 5);
  const worst5 = products.filter(p => p.qty > 0).sort((a, b) => a.ca_ttc - b.ca_ttc).slice(0, 5);

  // Category mix
  const catMap = new Map<string, { ttc: number; ht: number }>();
  for (const r of valid) {
    const cat = normCat(r.categorie);
    if (cat === "Messages" || cat === "Autre") continue;
    const prev = catMap.get(cat) ?? { ttc: 0, ht: 0 };
    prev.ttc += Number(r.ttc);
    prev.ht += Number(r.ht);
    catMap.set(cat, prev);
  }
  const categories = [...catMap.entries()].map(([cat, v]) => ({ cat, ...v })).sort((a, b) => b.ttc - a.ttc);

  // Zones
  const zoneMap = new Map<string, { ttc: number; cov: number }>();
  for (const r of valid) {
    const zone = r.salle?.toLowerCase().includes("emporter") ? "A emporter" : (r.salle || "Autre");
    const prev = zoneMap.get(zone) ?? { ttc: 0, cov: 0 };
    prev.ttc += Number(r.ttc);
    zoneMap.set(zone, prev);
  }

  // Serveurs
  const servMap = new Map<string, { ca_ttc: number; tickets: number }>();
  for (const r of valid) {
    if (!r.operateur) continue;
    const prev = servMap.get(r.operateur) ?? { ca_ttc: 0, tickets: 0 };
    prev.ca_ttc += Number(r.ttc);
    servMap.set(r.operateur, prev);
  }
  const servTickets = new Map<string, Set<string>>();
  for (const r of productRows) {
    if (!r.operateur) continue;
    const set = servTickets.get(r.operateur) ?? new Set<string>();
    set.add(`${r.date_service}:${r.num_fiscal}`);
    servTickets.set(r.operateur, set);
  }
  const serveurs = [...servMap.entries()].map(([name, v]) => ({
    name, ca_ttc: v.ca_ttc, tickets: servTickets.get(name)?.size ?? 0,
  })).sort((a, b) => b.ca_ttc - a.ca_ttc);

  // Upsell ratios
  const orderCats = new Map<string, Set<string>>();
  for (const r of valid) {
    const key = `${r.date_service}:${r.num_fiscal}`;
    const cats = orderCats.get(key) ?? new Set<string>();
    cats.add(normCat(r.categorie));
    orderCats.set(key, cats);
  }
  const totalOrders = orderCats.size;
  let antiOrders = 0, dolciOrders = 0, vinOrders = 0, cafeOrders = 0;
  for (const cats of orderCats.values()) {
    if (cats.has("Antipasti")) antiOrders++;
    if (cats.has("Dolci")) dolciOrders++;
    if (cats.has("Vins")) vinOrders++;
    if (cats.has("Boissons chaudes")) cafeOrders++;
  }

  // Margins
  const productsWithMargin = products.map(p => {
    const recipe = recipeCosts.get(normalize(p.name));
    if (!recipe) return { ...p, prix_revient: null as number | null, food_cost_pct: null as number | null };
    const prix_revient = recipe.cost;
    const food_cost_pct = p.ca_ht > 0 ? (recipe.cost * p.qty / p.ca_ht) * 100 : null;
    return { ...p, prix_revient, food_cost_pct };
  });
  const highFoodCost = productsWithMargin
    .filter(p => p.food_cost_pct !== null && p.food_cost_pct > 30)
    .sort((a, b) => (b.food_cost_pct ?? 0) - (a.food_cost_pct ?? 0))
    .slice(0, 15);

  // Previous period
  const prevProductRows = prevRows.filter(r => r.type_ligne === "Produit");
  const prevValid = prevProductRows.filter(r => !r.annule && Number(r.ttc) > 0);
  const prev_ca_ttc = prevValid.reduce((s, r) => s + Number(r.ttc), 0);
  const prev_couverts = getCouverts(prevProductRows);
  const prev_tm = prev_couverts > 0 ? prev_ca_ttc / prev_couverts : 0;

  // Day-by-day for current period
  const dates = [...new Set(valid.map(r => r.date_service))].sort();
  const dayData = dates.map(d => {
    const dayRows = valid.filter(r => r.date_service === d);
    return {
      date: d,
      ca_ttc: dayRows.reduce((s, r) => s + Number(r.ttc), 0),
      couverts: getCouverts(productRows.filter(r => r.date_service === d)),
    };
  });

  // Prev period categories for comparison
  const prevCatMap = new Map<string, number>();
  for (const r of prevValid) {
    const cat = normCat(r.categorie);
    if (cat === "Messages" || cat === "Autre") continue;
    prevCatMap.set(cat, (prevCatMap.get(cat) ?? 0) + Number(r.ttc));
  }

  return {
    ca_ttc, ca_ht, couverts, tickets, tm_ttc,
    top5, worst5, categories, zones: [...zoneMap.entries()].map(([z, v]) => ({ zone: z, ...v })),
    serveurs,
    upsell: { totalOrders, antiOrders, dolciOrders, vinOrders, cafeOrders },
    productsWithMargin, highFoodCost,
    prev: { ca_ttc: prev_ca_ttc, couverts: prev_couverts, tm_ttc: prev_tm, categories: [...prevCatMap.entries()].map(([cat, ttc]) => ({ cat, ttc })) },
    dayData,
  };
}

/* ── Call Claude ── */
async function callClaude(
  anthropic: Anthropic,
  systemPrompt: string,
  userMessage: string,
): Promise<InsightResult> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = response.content[0].type === "text" ? response.content[0].text : "";
  // Parse bullet points: lines starting with - or number.
  const lines = text.split("\n").filter(l => l.trim().length > 0);
  const points: string[] = [];
  let title = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!title && (trimmed.startsWith("#") || trimmed.startsWith("**"))) {
      title = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "").trim();
      continue;
    }
    // Accept bullet points or numbered items
    const cleaned = trimmed
      .replace(/^[-*]\s*/, "")
      .replace(/^\d+[.)]\s*/, "")
      .trim();
    if (cleaned) points.push(cleaned);
  }
  return { title, points };
}

/* ── Format helpers ── */
const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR") + "\u20AC";
const fmtPct = (v: number) => v.toFixed(1) + "%";

/* ── GET /api/claude/insights ── */
export async function GET(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY non configuree" }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const etabId = searchParams.get("etablissement_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const type = searchParams.get("type"); // optional: briefing, menu, margin, trends, or all

    if (!etabId || !from || !to) {
      return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
    }

    // Fetch data
    const [rows, recipeCosts] = await Promise.all([
      fetchVentes(etabId, from, to),
      fetchRecipeCosts(etabId),
    ]);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucune donnee de vente sur cette periode" }, { status: 404 });
    }

    // Fetch previous period (A-1) for comparison
    const fromA1 = (parseInt(from.slice(0, 4)) - 1) + from.slice(4);
    const toA1 = (parseInt(to.slice(0, 4)) - 1) + to.slice(4);
    const prevRows = await fetchVentes(etabId, fromA1, toA1);

    const data = buildDataSummary(rows, prevRows, recipeCosts);

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Build prompts
    const briefingPrompt = {
      system: "Tu es le directeur analytique d'un restaurant italien a Saint-Malo. Tu rediges un briefing concis et actionnable pour l'equipe du lundi matin. Reponds avec des bullet points numerotes (1. 2. 3. etc). Pas de titre, pas de markdown headers. 5 a 6 points maximum.",
      user: `Voici les donnees de vente du ${from} au ${to}:

CA TTC: ${fmt(data.ca_ttc)} | CA HT: ${fmt(data.ca_ht)}
Couverts: ${data.couverts} | Tickets: ${data.tickets}
Ticket moyen TTC: ${fmt(data.tm_ttc)}

Top 5 produits:
${data.top5.map(p => `- ${p.name}: ${fmt(p.ca_ttc)} (${p.qty} vendus)`).join("\n")}

Flop 5 produits:
${data.worst5.map(p => `- ${p.name}: ${fmt(p.ca_ttc)} (${p.qty} vendus)`).join("\n")}

Zones:
${data.zones.map(z => `- ${z.zone}: ${fmt(z.ttc)}`).join("\n")}

Serveurs:
${data.serveurs.slice(0, 5).map(s => `- ${s.name}: ${fmt(s.ca_ttc)} (${s.tickets} tickets)`).join("\n")}

Taux d'upsell (sur ${data.upsell.totalOrders} tables):
- Antipasti: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.antiOrders / data.upsell.totalOrders * 100 : 0)}
- Dolci: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.dolciOrders / data.upsell.totalOrders * 100 : 0)}
- Vins: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.vinOrders / data.upsell.totalOrders * 100 : 0)}
- Cafe: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.cafeOrders / data.upsell.totalOrders * 100 : 0)}

Redige un briefing equipe avec 5-6 points concrets et actionnables.`,
    };

    const menuPrompt = {
      system: "Tu es un chef consultant specialise en menu engineering pour restaurants italiens. Reponds avec des bullet points numerotes (1. 2. 3. etc). Pas de titre, pas de markdown headers. 5 a 6 points maximum.",
      user: `Voici les donnees de vente et produits du ${from} au ${to}:

CA TTC total: ${fmt(data.ca_ttc)}

Mix categories:
${data.categories.map(c => `- ${c.cat}: ${fmt(c.ttc)} (${(c.ttc / data.ca_ttc * 100).toFixed(1)}%)`).join("\n")}

Top 5 produits (stars potentielles):
${data.top5.map(p => `- ${p.name} [${p.categorie}]: ${fmt(p.ca_ttc)}, ${p.qty} vendus`).join("\n")}

Produits les moins vendus (dogs potentiels):
${data.worst5.map(p => `- ${p.name} [${p.categorie}]: ${fmt(p.ca_ttc)}, ${p.qty} vendus`).join("\n")}

${data.highFoodCost.length > 0 ? `Produits a food cost eleve (>30%):
${data.highFoodCost.slice(0, 8).map(p => `- ${p.name}: food cost ${p.food_cost_pct ? fmtPct(p.food_cost_pct) : "?"}, prix revient ${p.prix_revient ? fmt(p.prix_revient) : "?"}`).join("\n")}` : ""}

Taux d'upsell antipasti: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.antiOrders / data.upsell.totalOrders * 100 : 0)}
Taux d'upsell dolci: ${fmtPct(data.upsell.totalOrders > 0 ? data.upsell.dolciOrders / data.upsell.totalOrders * 100 : 0)}

Nous sommes un restaurant italien (pizze, cucina, antipasti, dolci, vins). Quels produits promouvoir, retirer, ou ajouter a la carte? Suggestions concretes.`,
    };

    const marginPrompt = {
      system: "Tu es un expert en food cost et pricing pour la restauration. Reponds avec des bullet points numerotes (1. 2. 3. etc). Pas de titre, pas de markdown headers. 5 a 6 points maximum.",
      user: `Voici les donnees de marge du ${from} au ${to}:

CA HT total: ${fmt(data.ca_ht)}

${data.highFoodCost.length > 0 ? `Produits a food cost eleve (>30%):
${data.highFoodCost.map(p => `- ${p.name} [${p.categorie}]: CA HT ${fmt(p.ca_ht)}, ${p.qty} vendus, prix revient ${p.prix_revient ? fmt(p.prix_revient) : "?"}, food cost ${p.food_cost_pct ? fmtPct(p.food_cost_pct) : "?"}`).join("\n")}` : "Aucun produit avec food cost > 30% identifie (pas assez de recettes chiffrees)."}

Top 5 produits par CA:
${data.top5.map(p => {
  const m = data.productsWithMargin.find(pm => pm.name === p.name);
  return `- ${p.name}: CA HT ${fmt(p.ca_ht)}, ${p.qty} vendus${m?.prix_revient ? `, prix revient ${fmt(m.prix_revient)}, food cost ${m.food_cost_pct ? fmtPct(m.food_cost_pct) : "?"}` : ""}`;
}).join("\n")}

Donne des recommandations concretes: ajustements de prix, reductions de cout matiere, objectif de food cost par categorie.`,
    };

    const trendsPrompt = {
      system: "Tu es un analyste de performance pour la restauration, specialise en comparaisons et tendances. Reponds avec des bullet points numerotes (1. 2. 3. etc). Pas de titre, pas de markdown headers. 5 a 6 points maximum.",
      user: `Donnees de vente du ${from} au ${to}:

Periode actuelle: CA TTC ${fmt(data.ca_ttc)}, ${data.couverts} couverts, TM ${fmt(data.tm_ttc)}
Periode A-1: CA TTC ${fmt(data.prev.ca_ttc)}, ${data.prev.couverts} couverts, TM ${fmt(data.prev.tm_ttc)}
${data.prev.ca_ttc > 0 ? `Evolution CA: ${((data.ca_ttc - data.prev.ca_ttc) / data.prev.ca_ttc * 100).toFixed(1)}%` : "Pas de donnees A-1"}

Jour par jour:
${data.dayData.map(d => `- ${d.date}: ${fmt(d.ca_ttc)}, ${d.couverts} couverts`).join("\n")}

Mix categories actuel:
${data.categories.map(c => `- ${c.cat}: ${fmt(c.ttc)}`).join("\n")}

${data.prev.categories.length > 0 ? `Mix categories A-1:
${data.prev.categories.map(c => `- ${c.cat}: ${fmt(c.ttc)}`).join("\n")}` : ""}

Zones:
${data.zones.map(z => `- ${z.zone}: ${fmt(z.ttc)}`).join("\n")}

Identifie les tendances, croissance/declin, patterns saisonniers, et predictions.`,
    };

    // Determine which insights to generate
    const types = type ? [type] : ["briefing", "menu", "margin", "trends"];
    const prompts: Record<string, { system: string; user: string }> = {
      briefing: briefingPrompt,
      menu: menuPrompt,
      margin: marginPrompt,
      trends: trendsPrompt,
    };

    const results = await Promise.all(
      types.map(async (t) => {
        const p = prompts[t];
        if (!p) return [t, { title: "", points: ["Type inconnu"] as string[] }] as const;
        const result = await callClaude(anthropic, p.system, p.user);
        return [t, result] as const;
      }),
    );

    const response: Record<string, InsightResult> = {};
    for (const [key, value] of results) {
      response[key] = value;
    }

    return NextResponse.json(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[insights] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
