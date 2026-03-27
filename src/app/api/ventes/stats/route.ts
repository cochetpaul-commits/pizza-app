import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Row = {
  date_service: string;
  service: string;
  salle: string;
  operateur: string;
  categorie: string;
  sous_categorie: string;
  description: string;
  quantite: number;
  annule: boolean;
  ttc: number;
  ht: number;
  couverts: number;
  num_fiscal: string;
  statut: string;
  ouvert_a: string;
  type_ligne: string;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etablissement_id");
  const from = searchParams.get("from"); // YYYY-MM-DD
  const to = searchParams.get("to");     // YYYY-MM-DD

  if (!etabId || !from || !to) {
    return NextResponse.json({ error: "etablissement_id, from, to requis" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("ventes_lignes")
    .select("date_service,service,salle,operateur,categorie,sous_categorie,description,quantite,annule,ttc,ht,couverts,num_fiscal,statut,ouvert_a,type_ligne")
    .eq("etablissement_id", etabId)
    .gte("date_service", from)
    .lte("date_service", to)
    .order("ouvert_a", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) {
    return NextResponse.json({ empty: true, stats: null });
  }

  // Aggregate
  const stats = aggregate(rows);
  return NextResponse.json({ empty: false, stats });
}

function aggregate(rows: Row[]) {
  // Filter non-annulés for CA calculations
  const validRows = rows.filter(r => !r.annule && r.ttc > 0);
  const allRows = rows;

  // Unique tickets (by num_fiscal + date)
  const tickets = new Set<string>();
  const ticketsByDay: Record<string, Set<string>> = {};
  const ticketsBySvc: Record<string, Set<string>> = {};

  for (const r of allRows) {
    const key = `${r.date_service}:${r.num_fiscal}`;
    tickets.add(key);
    if (!ticketsByDay[r.date_service]) ticketsByDay[r.date_service] = new Set();
    ticketsByDay[r.date_service].add(key);
    const svcKey = `${r.date_service}:${r.service}`;
    if (!ticketsBySvc[svcKey]) ticketsBySvc[svcKey] = new Set();
    ticketsBySvc[svcKey].add(key);
  }

  // Unique dates
  const dates = [...new Set(validRows.map(r => r.date_service))].sort();
  const dayNames = dates.map(d => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString("fr-FR", { weekday: "long" });
  });

  // CA totals
  const ca_ttc = validRows.reduce((s, r) => s + Number(r.ttc), 0);
  const ca_ht = validRows.reduce((s, r) => s + Number(r.ht), 0);
  const totalTickets = tickets.size;

  // Annulations
  const annules = allRows.filter(r => r.annule);
  const ann_pct = allRows.length > 0 ? (annules.length / allRows.length * 100) : 0;

  // CA par jour
  const day_ttc = dates.map(d => validRows.filter(r => r.date_service === d).reduce((s, r) => s + Number(r.ttc), 0));
  const day_ht = dates.map(d => validRows.filter(r => r.date_service === d).reduce((s, r) => s + Number(r.ht), 0));
  const day_cov = dates.map(d => ticketsByDay[d]?.size ?? 0);
  const tm_ttc = dates.map((_, i) => day_cov[i] > 0 ? day_ttc[i] / day_cov[i] : 0);
  const tm_ht = dates.map((_, i) => day_cov[i] > 0 ? day_ht[i] / day_cov[i] : 0);

  // Zones par jour
  const zoneNames = ["Salle", "Pergolas", "Terrasse", "À emporter"];
  const zones: Record<string, number[]> = {};
  for (const z of zoneNames) {
    zones[z] = dates.map(d => {
      const zoneMatch = z === "À emporter" ? (r: Row) => r.salle?.toLowerCase().includes("emporter") : (r: Row) => r.salle === z;
      return validRows.filter(r => r.date_service === d && zoneMatch(r)).reduce((s, r) => s + Number(r.ttc), 0);
    });
  }

  // Sur place vs emporter
  const empRows = validRows.filter(r => r.salle?.toLowerCase().includes("emporter"));
  const spRows = validRows.filter(r => !r.salle?.toLowerCase().includes("emporter"));
  const place_emp = empRows.reduce((s, r) => s + Number(r.ttc), 0);
  const place_sur = spRows.reduce((s, r) => s + Number(r.ttc), 0);
  const empTickets = new Set(empRows.map(r => `${r.date_service}:${r.num_fiscal}`));
  const spTickets = new Set(spRows.map(r => `${r.date_service}:${r.num_fiscal}`));
  const cov_emp = empTickets.size;
  const cov_sur = spTickets.size;

  // Services (par jour + midi/soir)
  const services: {
    jour: string; svc: string; ttc: number; ht: number; cov: number; tm: number;
    sp: number; emp: number; sp_tkt: number; tm_sp: number;
    z: Record<string, number>;
  }[] = [];

  for (const d of dates) {
    const jourName = new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
    const jourCap = jourName.charAt(0).toUpperCase() + jourName.slice(1);
    for (const svc of ["midi", "soir"]) {
      const svcRows = validRows.filter(r => r.date_service === d && r.service === svc);
      if (svcRows.length === 0) continue;
      const svcKey = `${d}:${svc}`;
      const cov = ticketsBySvc[svcKey]?.size ?? 0;
      const ttc = svcRows.reduce((s, r) => s + Number(r.ttc), 0);
      const ht = svcRows.reduce((s, r) => s + Number(r.ht), 0);
      const spSvc = svcRows.filter(r => !r.salle?.toLowerCase().includes("emporter"));
      const empSvc = svcRows.filter(r => r.salle?.toLowerCase().includes("emporter"));
      const spTkt = new Set(spSvc.map(r => `${r.date_service}:${r.num_fiscal}`)).size;
      const spCA = spSvc.reduce((s, r) => s + Number(r.ttc), 0);
      const empCA = empSvc.reduce((s, r) => s + Number(r.ttc), 0);

      const z: Record<string, number> = {};
      for (const zn of zoneNames) {
        const zMatch = zn === "À emporter"
          ? (r: Row) => r.salle?.toLowerCase().includes("emporter")
          : (r: Row) => r.salle === zn;
        z[zn === "À emporter" ? "emp" : zn] = svcRows.filter(zMatch).reduce((s, r) => s + Number(r.ttc), 0);
      }

      services.push({
        jour: jourCap, svc, ttc, ht, cov,
        tm: cov > 0 ? ttc / cov : 0,
        sp: spCA, emp: empCA,
        sp_tkt: spTkt, tm_sp: spTkt > 0 ? spCA / spTkt : 0,
        z,
      });
    }
  }

  // Mix catégories
  const catMap: Record<string, { ttc: number; ht: number }> = {};
  for (const r of validRows) {
    const cat = r.categorie || "Autre";
    if (!catMap[cat]) catMap[cat] = { ttc: 0, ht: 0 };
    catMap[cat].ttc += Number(r.ttc);
    catMap[cat].ht += Number(r.ht);
  }
  // Remove zero/messages categories
  const mixEntries = Object.entries(catMap)
    .filter(([k, v]) => v.ttc > 0 && !k.toUpperCase().includes("MESSAGE"))
    .sort((a, b) => b[1].ttc - a[1].ttc);
  const mix_labels = mixEntries.map(([k]) => k);
  const mix_ttc = mixEntries.map(([, v]) => Math.round(v.ttc));
  const mix_ht = mixEntries.map(([, v]) => Math.round(v.ht));

  // Top 10 produits
  const prodMap: Record<string, { ca: number; qty: number }> = {};
  for (const r of validRows) {
    if (r.type_ligne !== "Produit" || !r.description) continue;
    if (r.categorie?.toUpperCase().includes("MESSAGE")) continue;
    const key = r.description;
    if (!prodMap[key]) prodMap[key] = { ca: 0, qty: 0 };
    prodMap[key].ca += Number(r.ttc);
    prodMap[key].qty += Number(r.quantite);
  }
  const top10 = Object.entries(prodMap).sort((a, b) => b[1].ca - a[1].ca).slice(0, 10);
  const top10_names = top10.map(([k]) => k);
  const top10_ca = top10.map(([, v]) => Math.round(v.ca));
  const top10_qty = top10.map(([, v]) => v.qty);

  // Produits par catégorie (cat_products)
  const catProds: Record<string, { n: string; qty: number; ca: number }[]> = {};
  for (const r of validRows) {
    if (r.type_ligne !== "Produit" || !r.description) continue;
    if (r.categorie?.toUpperCase().includes("MESSAGE")) continue;
    const cat = r.categorie || "Autre";
    if (!catProds[cat]) catProds[cat] = [];
    const existing = catProds[cat].find(p => p.n === r.description);
    if (existing) {
      existing.ca += Number(r.ttc);
      existing.qty += Number(r.quantite);
    } else {
      catProds[cat].push({ n: r.description, qty: Number(r.quantite), ca: Number(r.ttc) });
    }
  }
  for (const cat of Object.keys(catProds)) {
    catProds[cat].sort((a, b) => b.ca - a.ca);
    catProds[cat] = catProds[cat].map(p => ({ ...p, ca: Math.round(p.ca) }));
  }

  // Top 3 par catégorie
  const top3_cats = mixEntries.slice(0, 8).map(([cat, v]) => {
    const prods = catProds[cat] || [];
    const top3 = prods.slice(0, 3).map(p => ({ n: p.n, ca: `${p.ca.toLocaleString("fr-FR")}\u20AC` }));
    const flop = prods.length > 3 ? prods[prods.length - 1] : null;
    return {
      cat,
      rows: top3,
      flop: flop ? { n: flop.n, ca: `${flop.ca.toLocaleString("fr-FR")}\u20AC`, qty: flop.qty } : null,
    };
  });

  // Serveurs
  const servMap: Record<string, number> = {};
  for (const r of validRows) {
    const op = r.operateur?.trim();
    if (!op) continue;
    servMap[op] = (servMap[op] || 0) + Number(r.ttc);
  }
  const servEntries = Object.entries(servMap).sort((a, b) => b[1] - a[1]);
  const serveurs = servEntries.map(([k]) => k);
  const serv_ca = servEntries.map(([, v]) => Math.round(v));

  // Paiements — on ne peut pas les extraire du fichier produit, on les laisse vides
  // (les paiements sont dans un export séparé de Popina)

  // Ratios upsell
  const antiRows = validRows.filter(r => r.categorie?.toUpperCase().includes("ANTIPASTI"));
  const dolciRows = validRows.filter(r => r.categorie?.toUpperCase().includes("DOLCI"));
  const vinRows = validRows.filter(r =>
    r.categorie?.toUpperCase().includes("VIN") ||
    r.sous_categorie?.toLowerCase().includes("vin")
  );
  const anti_tickets = new Set(antiRows.map(r => `${r.date_service}:${r.num_fiscal}`)).size;
  const dolci_tickets = new Set(dolciRows.map(r => `${r.date_service}:${r.num_fiscal}`)).size;
  const vin_tickets = new Set(vinRows.map(r => `${r.date_service}:${r.num_fiscal}`)).size;

  return {
    dates,
    days: dayNames.map(d => d.charAt(0).toUpperCase() + d.slice(1)),
    ca_ttc: Math.round(ca_ttc * 100) / 100,
    ca_ht: Math.round(ca_ht * 100) / 100,
    couverts: totalTickets,
    ann_pct: Math.round(ann_pct * 10) / 10,
    day_ttc, day_ht, day_cov, tm_ttc, tm_ht,
    zones,
    place_sur: Math.round(place_sur), place_emp: Math.round(place_emp),
    cov_sur, cov_emp,
    services,
    mix_labels, mix_ttc, mix_ht,
    top10_names, top10_ca, top10_qty,
    cat_products: catProds,
    top3_cats,
    serveurs, serv_ca,
    ratios: {
      anti: totalTickets > 0 ? Math.round(anti_tickets / totalTickets * 100) / 100 : 0,
      anti_n: anti_tickets,
      dolci: totalTickets > 0 ? Math.round(dolci_tickets / totalTickets * 100) / 100 : 0,
      dolci_n: dolci_tickets,
      vin: totalTickets > 0 ? Math.round(vin_tickets / totalTickets * 100) / 100 : 0,
      vin_n: vin_tickets,
    },
  };
}
