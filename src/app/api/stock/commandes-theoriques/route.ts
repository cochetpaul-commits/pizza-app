import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getEtablissement, EtabError } from "@/lib/getEtablissement";

/**
 * GET /api/stock/commandes-theoriques
 *
 * Calculates theoretical orders needed per supplier based on:
 * - Current theoretical stock (inventory + receptions - ventes)
 * - Average daily consumption (last 30 days of ventes)
 * - Days until next delivery (from supplier delivery_days)
 * - Stock objectif (target stock level)
 *
 * Returns grouped by supplier with order lines.
 */
// Une liste in.(...) de plusieurs centaines d'UUID dépasse la longueur d'URL
// acceptée par PostgREST (erreur 400 silencieuse) — on requête par paquets.
const CHUNK = 150;
function chunks<T>(arr: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += CHUNK) out.push(arr.slice(i, i + CHUNK));
  return out;
}

export async function GET(req: NextRequest) {
  let etabId: string;
  try {
    ({ etabId } = await getEtablissement(req));
  } catch (e) {
    if (e instanceof EtabError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }

  // 1. Get current stock (from /api/stock logic)
  const { data: lastInv } = await supabaseAdmin
    .from("inventaires")
    .select("id, date, cloture_at")
    .eq("etablissement_id", etabId)
    .eq("statut", "cloture")
    .order("date", { ascending: false })
    .limit(1)
    .single();

  const invDate = lastInv?.cloture_at ?? null;
  const invId = lastInv?.id ?? null;

  // Inventory lines
  const stockMap = new Map<string, number>();
  if (invId) {
    const { data: invLines } = await supabaseAdmin
      .from("inventaire_lignes")
      .select("ingredient_id, quantite")
      .eq("inventaire_id", invId);
    for (const l of invLines ?? []) {
      stockMap.set(l.ingredient_id, Number(l.quantite));
    }
  }

  // Stock movements since inventory
  let movQ = supabaseAdmin
    .from("stock_movements")
    .select("ingredient_id, quantity")
    .eq("etablissement_id", etabId);
  if (invDate) movQ = movQ.gte("created_at", invDate);
  const { data: movements } = await movQ;
  for (const m of movements ?? []) {
    stockMap.set(m.ingredient_id, (stockMap.get(m.ingredient_id) ?? 0) + Number(m.quantity));
  }

  // 2. Calculate average daily consumption (last 30 days)
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(now.getDate() - 30);
  const from30 = thirtyDaysAgo.toISOString().slice(0, 10);
  const toNow = now.toISOString().slice(0, 10);

  const { data: recentMovements } = await supabaseAdmin
    .from("stock_movements")
    .select("ingredient_id, quantity")
    .eq("etablissement_id", etabId)
    .eq("type", "vente")
    .gte("created_at", `${from30}T00:00:00`)
    .lte("created_at", `${toNow}T23:59:59`);

  const consumption30 = new Map<string, number>();
  for (const m of recentMovements ?? []) {
    const qty = Math.abs(Number(m.quantity));
    consumption30.set(m.ingredient_id, (consumption30.get(m.ingredient_id) ?? 0) + qty);
  }

  // Days with actual sales data
  const activeDays = Math.max(1, Math.min(30, Math.ceil((now.getTime() - thirtyDaysAgo.getTime()) / 86400000)));

  // 3. Load ingredients with their supplier offers
  const allIngIds = new Set([...stockMap.keys(), ...consumption30.keys()]);
  if (allIngIds.size === 0) {
    return NextResponse.json({ suppliers: [], generated_at: new Date().toISOString() });
  }

  const ingredients = (await Promise.all(chunks([...allIngIds]).map(async (ids) => {
    const { data } = await supabaseAdmin
      .from("ingredients")
      .select("id, name, category, stock_min, stock_objectif, purchase_unit_label, default_unit")
      .in("id", ids);
    return data ?? [];
  }))).flat();

  const ingMap = new Map((ingredients ?? []).map(i => [i.id, i]));

  // Get supplier offers to know which supplier sells what
  const offers = (await Promise.all(chunks([...allIngIds]).map(async (ids) => {
    const { data } = await supabaseAdmin
      .from("supplier_offers")
      .select("ingredient_id, supplier_id, pack_count, pack_each_qty, pack_each_unit, pack_price, unit_price, label")
      .eq("is_active", true)
      .in("ingredient_id", ids);
    return data ?? [];
  }))).flat();

  // Get supplier info
  const supplierIds = [...new Set((offers ?? []).map(o => o.supplier_id))];
  const { data: suppliers } = supplierIds.length > 0
    ? await supabaseAdmin.from("suppliers").select("id, name, delivery_days, delivery_schedule, franco_minimum, color").in("id", supplierIds).eq("is_active", true)
    : { data: [] };

  const supplierMap = new Map((suppliers ?? []).map(s => [s.id, s]));

  // 4. Compute days until next delivery per supplier
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const todayDow = now.getDay(); // 0=dim

  function daysUntilDelivery(deliveryDays: string[] | null): number {
    if (!deliveryDays || deliveryDays.length === 0) return 7; // default: weekly
    for (let offset = 1; offset <= 7; offset++) {
      const futureDay = JOURS[(todayDow + offset) % 7];
      if (deliveryDays.includes(futureDay)) return offset;
    }
    return 7;
  }

  // 5. Build order lines per supplier
  type OrderLine = {
    ingredient_id: string;
    name: string;
    category: string | null;
    unit: string;
    current_stock: number;
    avg_daily: number;
    stock_objectif: number;
    days_until_delivery: number;
    stock_at_delivery: number;
    qty_to_order: number;
    pack_label: string | null;
    pack_price: number | null;
    estimated_cost: number | null;
    urgent: boolean;
  };

  type SupplierOrder = {
    supplier_id: string;
    supplier_name: string;
    supplier_color: string | null;
    delivery_days: string[] | null;
    next_delivery_in: number;
    franco_minimum: number | null;
    lines: OrderLine[];
    total_estimated: number;
  };

  const ordersBySupplier = new Map<string, SupplierOrder>();

  for (const offer of offers ?? []) {
    const ing = ingMap.get(offer.ingredient_id);
    if (!ing) continue;

    const supplier = supplierMap.get(offer.supplier_id);
    if (!supplier) continue;

    const currentStock = stockMap.get(offer.ingredient_id) ?? 0;
    const consumed30 = consumption30.get(offer.ingredient_id) ?? 0;
    const avgDaily = consumed30 / activeDays;
    const stockObj = Number(ing.stock_objectif) ?? 0;
    const stockMin = Number(ing.stock_min) ?? 0;
    const daysUntil = daysUntilDelivery(supplier.delivery_days);

    // Stock at delivery time
    const stockAtDelivery = currentStock - (avgDaily * daysUntil);

    // Qty to order = stock_objectif - stock_at_delivery (if positive)
    const target = stockObj > 0 ? stockObj : (stockMin > 0 ? stockMin * 2 : 0);
    if (target <= 0) continue; // No target set, skip

    const qtyNeeded = target - stockAtDelivery;
    if (qtyNeeded <= 0) continue; // Enough stock

    const unit = ing.purchase_unit_label || ing.default_unit || "pcs";
    const packLabel = offer.label || null;
    const unitPrice = offer.unit_price || (offer.pack_price && offer.pack_count ? offer.pack_price / offer.pack_count : null);
    const estimatedCost = unitPrice ? Math.round(qtyNeeded * unitPrice * 100) / 100 : null;

    const line: OrderLine = {
      ingredient_id: offer.ingredient_id,
      name: ing.name,
      category: ing.category,
      unit,
      current_stock: Math.round(currentStock * 100) / 100,
      avg_daily: Math.round(avgDaily * 100) / 100,
      stock_objectif: target,
      days_until_delivery: daysUntil,
      stock_at_delivery: Math.round(stockAtDelivery * 100) / 100,
      qty_to_order: Math.ceil(qtyNeeded), // Round up
      pack_label: packLabel,
      pack_price: offer.pack_price ? Number(offer.pack_price) : null,
      estimated_cost: estimatedCost,
      urgent: stockAtDelivery <= stockMin,
    };

    if (!ordersBySupplier.has(offer.supplier_id)) {
      ordersBySupplier.set(offer.supplier_id, {
        supplier_id: offer.supplier_id,
        supplier_name: supplier.name,
        supplier_color: supplier.color ?? null,
        delivery_days: supplier.delivery_days,
        next_delivery_in: daysUntil,
        franco_minimum: supplier.franco_minimum ? Number(supplier.franco_minimum) : null,
        lines: [],
        total_estimated: 0,
      });
    }

    const order = ordersBySupplier.get(offer.supplier_id)!;
    // Avoid duplicate ingredients
    if (!order.lines.some(l => l.ingredient_id === offer.ingredient_id)) {
      order.lines.push(line);
      if (estimatedCost) order.total_estimated += estimatedCost;
    }
  }

  // Sort lines by urgency, then by name
  const result = [...ordersBySupplier.values()]
    .filter(o => o.lines.length > 0)
    .map(o => ({
      ...o,
      total_estimated: Math.round(o.total_estimated * 100) / 100,
      lines: o.lines.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || a.name.localeCompare(b.name, "fr")),
    }))
    .sort((a, b) => a.next_delivery_in - b.next_delivery_in || a.supplier_name.localeCompare(b.supplier_name));

  return NextResponse.json({
    suppliers: result,
    generated_at: new Date().toISOString(),
    inventory_date: lastInv?.date ?? null,
    active_days: activeDays,
  });
}
