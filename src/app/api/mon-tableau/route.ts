import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { normalizeRole, type Role } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/mon-tableau?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Tableau de bord personnalisé de l'employé connecté, selon son poste :
 *  - bar      → les boissons (CA, catégories, top produits)
 *  - cuisine  → le food + comparatif Pizza vs Cucina
 *  - salle    → ses ventes perso (tickets, couverts, ticket moyen,
 *               taux d'attache) comparées à la moyenne de l'équipe
 *
 * L'attribution personnelle repose sur ventes_lignes.operateur, relié à
 * la fiche par employes.popina_operateur. Un ticket appartient à
 * l'opérateur qui a saisi le plus de lignes dessus.
 */

type Row = {
  operateur: string | null;
  categorie: string | null;
  sous_categorie: string | null;
  description: string | null;
  quantite: number | null;
  annule: boolean | null;
  ttc: number | null;
  couverts: number | null;
  num_fiscal: string | null;
  type_ligne: string | null;
  date_service: string;
};

const SELECT_COLS = "operateur,categorie,sous_categorie,description,quantite,annule,ttc,couverts,num_fiscal,type_ligne,date_service";

const DRINK_CATS = new Set(["VINI", "ALCOOL", "BEVANDE", "BEVANDE CALDE", "DIGESTIVI"]);
const FOOD_CATS = new Set(["PIZZE", "CUCINA", "ANTIPASTI", "DOLCI"]);

// Groupes d'attache pour la salle (catégorie Popina → libellé)
const ATTACHE_GROUPS: { key: string; label: string; cats: string[] }[] = [
  { key: "antipasti", label: "Antipasti", cats: ["ANTIPASTI"] },
  { key: "dolci", label: "Desserts", cats: ["DOLCI"] },
  { key: "vins", label: "Vins", cats: ["VINI"] },
  { key: "alcool", label: "Alcool", cats: ["ALCOOL"] },
  { key: "cafe", label: "Cafés / Chaud", cats: ["BEVANDE CALDE"] },
  { key: "digestifs", label: "Digestifs", cats: ["DIGESTIVI"] },
];

function shiftDays(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchRange(etabId: string, from: string, to: string): Promise<Row[]> {
  const out: Row[] = [];
  const PAGE = 1000;
  let offset = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabaseAdmin
      .from("ventes_lignes")
      .select(SELECT_COLS)
      .eq("etablissement_id", etabId)
      .gte("date_service", from)
      .lte("date_service", to)
      .range(offset, offset + PAGE - 1);
    out.push(...((data ?? []) as Row[]));
    hasMore = (data?.length ?? 0) === PAGE;
    offset += PAGE;
  }
  return out;
}

/** Lignes produit exploitables (hors annulations, messages, paiements). */
function productLines(rows: Row[]): Row[] {
  return rows.filter(r =>
    r.type_ligne === "Produit" && !r.annule &&
    r.categorie && r.categorie !== "" && r.categorie !== "MESSAGES"
  );
}

type Ticket = {
  owner: string;          // opérateur dominant
  couverts: number;
  ca: number;             // CA produits du ticket
  cats: Set<string>;      // catégories présentes
};

/** Regroupe les lignes produit en tickets, attribués à l'opérateur dominant. */
function buildTickets(lines: Row[]): Map<string, Ticket> {
  const byTicket = new Map<string, { lineCount: Map<string, number>; couverts: number; ca: number; cats: Set<string> }>();
  for (const l of lines) {
    const key = `${l.date_service}|${l.num_fiscal ?? ""}`;
    if (!l.num_fiscal) continue;
    let t = byTicket.get(key);
    if (!t) { t = { lineCount: new Map(), couverts: 0, ca: 0, cats: new Set() }; byTicket.set(key, t); }
    const op = (l.operateur ?? "").trim();
    if (op) t.lineCount.set(op, (t.lineCount.get(op) ?? 0) + 1);
    t.couverts = Math.max(t.couverts, l.couverts ?? 0);
    t.ca += l.ttc ?? 0;
    if (l.categorie) t.cats.add(l.categorie);
  }
  const out = new Map<string, Ticket>();
  for (const [key, t] of byTicket) {
    let owner = "";
    let max = 0;
    for (const [op, n] of t.lineCount) {
      if (n > max) { max = n; owner = op; }
    }
    out.set(key, { owner, couverts: t.couverts, ca: t.ca, cats: t.cats });
  }
  return out;
}

type OperateurStats = {
  ca: number;
  tickets: number;
  couverts: number;
  ticketMoyen: number;
  caParCouvert: number;
  attaches: Record<string, number>; // key → % de tickets avec ≥1 ligne du groupe
};

/** Métriques d'un opérateur sur ses tickets. */
function statsForOperator(tickets: Map<string, Ticket>, op: string): OperateurStats {
  let ca = 0, count = 0, couverts = 0;
  const attacheHits: Record<string, number> = {};
  for (const g of ATTACHE_GROUPS) attacheHits[g.key] = 0;
  for (const t of tickets.values()) {
    if (t.owner !== op) continue;
    count++;
    ca += t.ca;
    couverts += t.couverts;
    for (const g of ATTACHE_GROUPS) {
      if (g.cats.some(c => t.cats.has(c))) attacheHits[g.key]++;
    }
  }
  const attaches: Record<string, number> = {};
  for (const g of ATTACHE_GROUPS) {
    attaches[g.key] = count > 0 ? (attacheHits[g.key] / count) * 100 : 0;
  }
  return {
    ca,
    tickets: count,
    couverts,
    ticketMoyen: count > 0 ? ca / count : 0,
    caParCouvert: couverts > 0 ? ca / couverts : 0,
    attaches,
  };
}

export async function GET(req: NextRequest) {
  // ── Auth ──
  const token = (req.headers.get("authorization") ?? "").replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { data: auth } = await supabaseAdmin.auth.getUser(token);
  const user = auth?.user;
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (!from || !to) return NextResponse.json({ error: "from, to requis" }, { status: 400 });

  // ── Rôle effectif (profil + fiches) : les enjeux different par rôle ──
  const { data: profileRow } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  // ── Fiche employé + poste ──
  let empQ = await supabaseAdmin
    .from("employes")
    .select("id, prenom, role, popina_operateur, etablissement_id, poste_id, postes(nom, equipe)")
    .eq("auth_user_id", user.id)
    .eq("actif", true);
  let emps = empQ.data ?? [];
  if (emps.length === 0 && user.email) {
    empQ = await supabaseAdmin
      .from("employes")
      .select("id, prenom, role, popina_operateur, etablissement_id, poste_id, postes(nom, equipe)")
      .ilike("email", user.email)
      .eq("actif", true);
    emps = empQ.data ?? [];
  }

  const RANK: Record<Role, number> = { equipier: 0, manager: 1, group_admin: 2 };
  let effectiveRole: Role = profileRow?.role ? normalizeRole(profileRow.role as string) : "equipier";
  for (const e of emps) {
    if (e.role) {
      const r = normalizeRole(e.role as string);
      if (RANK[r] > RANK[effectiveRole]) effectiveRole = r;
    }
  }

  // Admins : vision globale via /pilotage — pas de tableau personnalisé
  if (effectiveRole === "group_admin") {
    return NextResponse.json({ admin: true });
  }

  if (emps.length === 0) {
    return NextResponse.json({ error: "Aucune fiche employé liée à ce compte" }, { status: 404 });
  }
  // Préfère une fiche avec opérateur Popina renseigné
  const emp = emps.find(e => e.popina_operateur) ?? emps[0];
  const poste = (Array.isArray(emp.postes) ? emp.postes[0] : emp.postes) as { nom: string | null; equipe: string | null } | null;

  const posteNom = poste?.nom ?? "";
  const equipe = poste?.equipe ?? "";
  // Le rôle prime (manager = vue équipe), le poste affine pour les employés
  let profile: "manager" | "bar" | "cuisine" | "salle" = "salle";
  if (effectiveRole === "manager") profile = "manager";
  else if (posteNom.toLowerCase().includes("bar")) profile = "bar";
  else if (equipe === "Cuisine") profile = "cuisine";

  const etabId = emp.etablissement_id as string | null;
  if (!etabId) return NextResponse.json({ error: "Fiche sans établissement" }, { status: 400 });

  // ── Données de la période + période précédente (même durée) ──
  const days = Math.round((new Date(to + "T12:00:00Z").getTime() - new Date(from + "T12:00:00Z").getTime()) / 86400000) + 1;
  const prevFrom = shiftDays(from, -days);
  const prevTo = shiftDays(to, -days);

  const [rows, prevRows] = await Promise.all([
    fetchRange(etabId, from, to),
    fetchRange(etabId, prevFrom, prevTo),
  ]);

  const lines = productLines(rows);
  const prevLines = productLines(prevRows);

  const base = {
    employe: {
      prenom: emp.prenom,
      poste: posteNom || null,
      equipe: equipe || null,
      operateur: emp.popina_operateur ?? null,
      profile,
    },
    period: { from, to, prevFrom, prevTo },
    empty: lines.length === 0,
  };

  if (lines.length === 0) {
    return NextResponse.json(base);
  }

  const caTotal = lines.reduce((s, l) => s + (l.ttc ?? 0), 0);

  // ── MANAGER : vue équipe (globaux + détail par opérateur) ──
  if (profile === "manager") {
    const tickets = buildTickets(lines);
    const prevCa = prevLines.reduce((s, l) => s + (l.ttc ?? 0), 0);

    let nbTickets = 0, couverts = 0;
    for (const t of tickets.values()) { nbTickets++; couverts += t.couverts; }

    const opTicketCount = new Map<string, number>();
    for (const t of tickets.values()) {
      if (t.owner) opTicketCount.set(t.owner, (opTicketCount.get(t.owner) ?? 0) + 1);
    }
    const teamOps = [...opTicketCount.entries()].filter(([, n]) => n >= 5).map(([op]) => op);
    const operateurs = teamOps
      .map(op => ({ op, ...statsForOperator(tickets, op) }))
      .sort((a, b) => b.ca - a.ca);

    const teamAvgAttaches = Object.fromEntries(ATTACHE_GROUPS.map(g => [
      g.key,
      operateurs.length > 0 ? operateurs.reduce((s, o) => s + o.attaches[g.key], 0) / operateurs.length : 0,
    ]));

    return NextResponse.json({
      ...base,
      manager: {
        totals: {
          ca: caTotal,
          prevCa,
          tickets: nbTickets,
          couverts,
          ticketMoyen: nbTickets > 0 ? caTotal / nbTickets : 0,
          caParCouvert: couverts > 0 ? caTotal / couverts : 0,
        },
        operateurs,
        teamAvgAttaches,
        attacheGroups: ATTACHE_GROUPS.map(g => ({ key: g.key, label: g.label })),
        myOp: (emp.popina_operateur ?? "").trim() || null,
      },
    });
  }

  // ── BAR : les boissons ──
  if (profile === "bar") {
    const drink = lines.filter(l => DRINK_CATS.has(l.categorie!));
    const prevDrink = prevLines.filter(l => DRINK_CATS.has(l.categorie!));
    const caBoissons = drink.reduce((s, l) => s + (l.ttc ?? 0), 0);
    const prevCaBoissons = prevDrink.reduce((s, l) => s + (l.ttc ?? 0), 0);

    const byCat = new Map<string, { ca: number; qty: number }>();
    for (const l of drink) {
      const c = byCat.get(l.categorie!) ?? { ca: 0, qty: 0 };
      c.ca += l.ttc ?? 0; c.qty += l.quantite ?? 0;
      byCat.set(l.categorie!, c);
    }
    const prevByCat = new Map<string, number>();
    for (const l of prevDrink) {
      prevByCat.set(l.categorie!, (prevByCat.get(l.categorie!) ?? 0) + (l.ttc ?? 0));
    }

    const byProd = new Map<string, { ca: number; qty: number; cat: string; sousCat: string | null }>();
    for (const l of drink) {
      const name = (l.description ?? "").trim();
      if (!name) continue;
      const p = byProd.get(name) ?? { ca: 0, qty: 0, cat: l.categorie!, sousCat: (l.sous_categorie ?? "").trim() || null };
      p.ca += l.ttc ?? 0; p.qty += l.quantite ?? 0;
      byProd.set(name, p);
    }
    const tousProduits = [...byProd.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.ca - a.ca);

    return NextResponse.json({
      ...base,
      bar: {
        caBoissons, prevCaBoissons, caTotal,
        pctBoissons: caTotal > 0 ? (caBoissons / caTotal) * 100 : 0,
        parCategorie: [...byCat.entries()]
          .map(([cat, v]) => ({ cat, ca: v.ca, qty: v.qty, prevCa: prevByCat.get(cat) ?? 0 }))
          .sort((a, b) => b.ca - a.ca),
        topProduits: tousProduits.slice(0, 12),
        // Détail complet : chaque boisson vendue de la période
        detail: tousProduits,
      },
    });
  }

  // ── CUISINE : le food + Pizza vs Cucina ──
  if (profile === "cuisine") {
    const food = lines.filter(l => FOOD_CATS.has(l.categorie!));
    const prevFood = prevLines.filter(l => FOOD_CATS.has(l.categorie!));
    const caFood = food.reduce((s, l) => s + (l.ttc ?? 0), 0);
    const prevCaFood = prevFood.reduce((s, l) => s + (l.ttc ?? 0), 0);

    const byCat = new Map<string, { ca: number; qty: number }>();
    for (const l of food) {
      const c = byCat.get(l.categorie!) ?? { ca: 0, qty: 0 };
      c.ca += l.ttc ?? 0; c.qty += l.quantite ?? 0;
      byCat.set(l.categorie!, c);
    }
    const prevByCat = new Map<string, number>();
    for (const l of prevFood) {
      prevByCat.set(l.categorie!, (prevByCat.get(l.categorie!) ?? 0) + (l.ttc ?? 0));
    }

    const byProd = new Map<string, { ca: number; qty: number; cat: string; sousCat: string | null }>();
    for (const l of food) {
      const name = (l.description ?? "").trim();
      if (!name) continue;
      const p = byProd.get(name) ?? { ca: 0, qty: 0, cat: l.categorie!, sousCat: (l.sous_categorie ?? "").trim() || null };
      p.ca += l.ttc ?? 0; p.qty += l.quantite ?? 0;
      byProd.set(name, p);
    }
    const tousProduits = [...byProd.entries()].map(([name, v]) => ({ name, ...v }));

    return NextResponse.json({
      ...base,
      cuisine: {
        caFood, prevCaFood, caTotal,
        pctFood: caTotal > 0 ? (caFood / caTotal) * 100 : 0,
        parCategorie: [...byCat.entries()]
          .map(([cat, v]) => ({ cat, ca: v.ca, qty: v.qty, prevCa: prevByCat.get(cat) ?? 0 }))
          .sort((a, b) => b.ca - a.ca),
        topProduits: [...tousProduits].sort((a, b) => b.qty - a.qty).slice(0, 12),
        // Détail complet : chaque plat vendu de la période
        detail: [...tousProduits].sort((a, b) => b.ca - a.ca),
      },
    });
  }

  // ── SALLE : mes ventes vs moyenne équipe ──
  const tickets = buildTickets(lines);
  const myOp = (emp.popina_operateur ?? "").trim();

  // Opérateurs "réels" de la période (≥ 5 tickets) pour la moyenne équipe
  const opTicketCount = new Map<string, number>();
  for (const t of tickets.values()) {
    if (t.owner) opTicketCount.set(t.owner, (opTicketCount.get(t.owner) ?? 0) + 1);
  }
  const teamOps = [...opTicketCount.entries()].filter(([, n]) => n >= 5).map(([op]) => op);

  const me = myOp ? statsForOperator(tickets, myOp) : null;

  // Moyenne par opérateur (non pondérée) pour comparer des profils
  const teamStats = teamOps.map(op => statsForOperator(tickets, op));
  const teamAvg: OperateurStats | null = teamStats.length > 0 ? {
    ca: teamStats.reduce((s, t) => s + t.ca, 0) / teamStats.length,
    tickets: teamStats.reduce((s, t) => s + t.tickets, 0) / teamStats.length,
    couverts: teamStats.reduce((s, t) => s + t.couverts, 0) / teamStats.length,
    ticketMoyen: teamStats.reduce((s, t) => s + t.ticketMoyen, 0) / teamStats.length,
    caParCouvert: teamStats.reduce((s, t) => s + t.caParCouvert, 0) / teamStats.length,
    attaches: Object.fromEntries(ATTACHE_GROUPS.map(g => [
      g.key,
      teamStats.reduce((s, t) => s + t.attaches[g.key], 0) / teamStats.length,
    ])),
  } : null;

  return NextResponse.json({
    ...base,
    salle: {
      me,
      team: teamAvg,
      teamSize: teamOps.length,
      attacheGroups: ATTACHE_GROUPS.map(g => ({ key: g.key, label: g.label })),
      hasOperateur: !!myOp,
    },
  });
}
