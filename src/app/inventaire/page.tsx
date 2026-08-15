"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CATEGORIES, CAT_LABELS, CAT_COLORS, type Category, type Ingredient } from "@/types/ingredients";

// ── Types ────────────────────────────────────────────────────

type Inventaire = {
  id: string;
  date: string;
  statut: "en_cours" | "en_pause" | "cloture";
  total_valeur: number | null;
  created_at: string;
  notes: string | null;
};

type StorageZone = {
  id: string;
  name: string;
  display_order: number;
  /** Critères : la zone AFFICHE tous les produits de ces catégories/fournisseurs */
  category_slugs?: string[] | null;
  supplier_ids?: string[] | null;
};

const SANS_ZONE = "__sans_zone__";

/** Clé de zone en base ('' = sans zone) */
const zoneDbKey = (z: string) => (z === SANS_ZONE ? "" : z);
/** Clé de saisie : une quantité par produit ET par zone */
const qk = (id: string, z: string) => `${id}|${zoneDbKey(z)}`;

/**
 * Une zone est une VUE : elle contient les produits affectés manuellement
 * (storage_zone) PLUS tous ceux qui matchent ses critères (catégories /
 * fournisseurs). Un même produit peut donc apparaître dans plusieurs zones
 * (ex : le vin en CAVE A VIN et au BAR) sans être déplacé.
 */
function zoneHasIngredient(zone: StorageZone, ing: Ingredient): boolean {
  if (ing.storage_zone === zone.name) return true;
  if ((zone.category_slugs ?? []).includes(ing.category)) return true;
  const sups = zone.supplier_ids ?? [];
  if (sups.length > 0 && ing.supplier_id != null && sups.includes(ing.supplier_id)) return true;
  return false;
}

/** Zone "principale" (affectation manuelle) — pour le badge d'origine */
function resolveZone(ing: Ingredient, zones: StorageZone[]): string {
  if (ing.storage_zone) {
    if (zones.some(z => z.name === ing.storage_zone)) return ing.storage_zone;
  }
  return SANS_ZONE;
}

/** Sans zone = n'apparaît dans AUCUNE zone (ni affectation ni critères) */
function isUnzoned(ing: Ingredient, zones: StorageZone[]): boolean {
  return !zones.some(z => zoneHasIngredient(z, ing));
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}

/** Mini stepper −/+ compact pour les doubles champs cartons + unités */
function MiniStepper({ value, active, color, label, onChange }: {
  value: number | "";
  active: boolean;
  color: string;
  label: string;
  onChange: (v: number) => void;
}) {
  const n = value === "" ? 0 : Number(value);
  const btn: React.CSSProperties = {
    width: 22, height: 36, border: "1px solid #ddd6c8", background: "#f9f5ef",
    fontSize: 15, fontWeight: 700, cursor: "pointer", padding: 0,
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" onClick={() => onChange(Math.max(0, n - 1))}
          style={{ ...btn, borderRadius: "8px 0 0 8px", borderRight: "none", color: "#D4775A" }}>−</button>
        <input
          type="number"
          step="1"
          min="0"
          value={value}
          onChange={(e) => {
            const val = e.target.value;
            onChange(val === "" ? 0 : Math.max(0, Math.round(Number(val))));
          }}
          placeholder="0"
          style={{
            width: 40, height: 36, borderRadius: 0,
            border: active ? `1.5px solid ${color}` : "1px solid #ddd6c8",
            padding: "0 2px", fontSize: 14, fontWeight: 600,
            textAlign: "center", background: "#fff", outline: "none",
            color: active ? color : "#1a1a1a",
          }}
        />
        <button type="button" onClick={() => onChange(n + 1)}
          style={{ ...btn, borderRadius: "0 8px 8px 0", borderLeft: "none", color: "#4a6741" }}>+</button>
      </div>
      <span style={{ fontSize: 8, color: active ? color : "#999", fontWeight: 700, marginTop: 1 }}>{label}</span>
    </div>
  );
}

function fmtMoney(n: number) {
  return n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
}

// ── Component ────────────────────────────────────────────────

export default function InventairePage() {
  const { current: etab } = useEtablissement();
  const [authSession, setAuthSession] = useState<Session | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      setAuthSession(data.session ?? null);
    })();
  }, []);

  const userId = authSession?.user?.id ?? null;

  const [session, setSession] = useState<Inventaire | null>(null);
  const [historique, setHistorique] = useState<Inventaire[]>([]);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [prevQuantities, setPrevQuantities] = useState<Record<string, number>>({});
  const [theoreticalStock, setTheoreticalStock] = useState<Record<string, number>>({});

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});

  // Totaux consolidés par produit (somme de toutes les zones)
  const ingTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const saisi = new Set<string>();
    for (const [key, v] of Object.entries(quantities)) {
      if (v === "" || v === undefined) continue;
      const id = key.split("|")[0];
      saisi.add(id);
      totals[id] = (totals[id] ?? 0) + Number(v || 0);
    }
    return { totals, saisi };
  }, [quantities]);

  const [zones, setZones] = useState<StorageZone[]>([]);
  const [activeZone, setActiveZone] = useState<string>(SANS_ZONE);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneSupplierIds, setNewZoneSupplierIds] = useState<string[]>([]);
  const [newZoneCategorySlugs, setNewZoneCategorySlugs] = useState<string[]>([]);
  const [addingZone, setAddingZone] = useState(false);
  const [showManageZones, setShowManageZones] = useState(false);
  const [showAddProducts, setShowAddProducts] = useState(false);
  const [addProdSearch, setAddProdSearch] = useState("");
  const [addProdSel, setAddProdSel] = useState<Set<string>>(new Set());
  const [quickCreateCat, setQuickCreateCat] = useState<string>("epicerie_salee");
  const [addingProducts, setAddingProducts] = useState(false);
  const [editCatsZoneId, setEditCatsZoneId] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string }[]>([]);

  const [packInfo, setPackInfo] = useState<Record<string, { pack_count: number; pack_each_qty: number | null; pack_each_unit: string | null }>>({}); // ingredient_id -> pack info

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);
  const [syncActive, setSyncActive] = useState(false);
  const [lastSyncEvent, setLastSyncEvent] = useState<string | null>(null);

  // Category collapse state — all collapsed by default
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set(CATEGORIES));
  const toggleCat = (cat: string) => setCollapsedCats(prev => {
    const next = new Set(prev);
    if (next.has(cat)) next.delete(cat); else next.add(cat);
    return next;
  });

  // Filter: show only items not yet counted
  const [filterNonSaisis, setFilterNonSaisis] = useState(false);
  const [searchInv, setSearchInv] = useState("");

  const debounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load ingredients + zones ─────────────────────────────

  const etabId = etab?.id ?? null;

  async function fetchZones() {
    let q = supabase.from("storage_zones").select("*").order("display_order").order("name");
    if (etabId) q = q.eq("etablissement_id", etabId);
    const { data } = await q;
    const zList = (data ?? []) as StorageZone[];
    setZones(zList);
    return zList;
  }

  const loadZones = fetchZones;

  useEffect(() => {
    (async () => {
      let q = supabase
        .from("ingredients")
        .select("*")
        .eq("is_active", true)
        .order("name");
      if (etabId) {
        q = q.eq("etablissement_id", etabId);
      }
      let zq = supabase.from("storage_zones").select("*").order("display_order").order("name");
      if (etabId) zq = zq.eq("etablissement_id", etabId);
      const packQ = supabase
        .from("supplier_offers")
        .select("ingredient_id, pack_count, pack_each_qty, pack_each_unit")
        .eq("is_active", true)
        .not("pack_count", "is", null);
      let supQ = supabase.from("suppliers").select("id, name").eq("is_active", true).order("name");
      if (etabId) supQ = supQ.eq("etablissement_id", etabId);
      const [{ data, error }, { data: zData }, { data: packData }, { data: supData }] = await Promise.all([q, zq, packQ, supQ]);
      if (error) { console.error("ingredients query:", error); }
      setIngredients((data ?? []) as Ingredient[]);
      const zList = (zData ?? []) as StorageZone[];
      setZones(zList);
      if (zList.length > 0) setActiveZone(zList[0].name);
      // Build pack info map
      const pMap: Record<string, { pack_count: number; pack_each_qty: number | null; pack_each_unit: string | null }> = {};
      for (const p of packData ?? []) {
        if (p.ingredient_id && p.pack_count) {
          pMap[p.ingredient_id] = { pack_count: p.pack_count, pack_each_qty: p.pack_each_qty, pack_each_unit: p.pack_each_unit };
        }
      }
      setPackInfo(pMap);
      setSuppliers((supData ?? []) as { id: string; name: string }[]);
    })();
  }, [etabId]);

  // ── Load inventaires ──────────────────────────────────────

  const reloadKey = etab?.id ?? "";

  useEffect(() => {
    if (!reloadKey) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: invErr } = await supabase
        .from("inventaires")
        .select("id, date, statut, total_valeur, created_at, notes")
        .eq("etablissement_id", reloadKey)
        .order("created_at", { ascending: false })
        .limit(20);

      if (invErr) { console.error("inventaires query:", invErr); }
      if (cancelled) return;
      const list = (data ?? []) as Inventaire[];
      const active = list.find((i) => i.statut === "en_cours" || i.statut === "en_pause") ?? null;
      setSession(active);
      setHistorique(list.filter((i) => i.statut === "cloture"));

      if (active) {
        const { data: lignes, error: ligErr } = await supabase
          .from("inventaire_lignes")
          .select("ingredient_id, quantite, zone")
          .eq("inventaire_id", active.id);
        if (ligErr) { console.error("inventaire_lignes query:", ligErr); }
        if (!cancelled) {
          const qMap: Record<string, number | ""> = {};
          for (const l of (lignes ?? []) as { ingredient_id: string; quantite: number; zone?: string | null }[]) {
            if (l.ingredient_id && l.quantite > 0) qMap[`${l.ingredient_id}|${l.zone ?? ""}`] = l.quantite;
          }
          setQuantities(qMap);
        }
        // Load previous closed inventory for comparison + theoretical stock
        const prevClosed = list.find(i => i.statut === "cloture");
        if (prevClosed && !cancelled) {
          const { data: prevLignes } = await supabase
            .from("inventaire_lignes")
            .select("ingredient_id, quantite")
            .eq("inventaire_id", prevClosed.id);
          const pMap: Record<string, number> = {};
          for (const l of prevLignes ?? []) {
            if (l.ingredient_id && l.quantite > 0) pMap[l.ingredient_id] = (pMap[l.ingredient_id] ?? 0) + l.quantite;
          }
          if (!cancelled) setPrevQuantities(pMap);

          // Theoretical stock = prev qty + receptions - ventes since prev inventory date
          const prevDate = prevClosed.date;
          const { data: movements } = await supabase
            .from("stock_movements")
            .select("ingredient_id, type, quantity")
            .eq("etablissement_id", reloadKey)
            .gte("created_at", prevDate);
          if (!cancelled && movements) {
            const theo: Record<string, number> = { ...pMap };
            for (const m of movements as { ingredient_id: string; type: string; quantity: number }[]) {
              if (!theo[m.ingredient_id]) theo[m.ingredient_id] = pMap[m.ingredient_id] ?? 0;
              if (m.type === "reception") theo[m.ingredient_id] += Number(m.quantity);
              else if (m.type === "vente") theo[m.ingredient_id] -= Number(m.quantity);
            }
            setTheoreticalStock(theo);
          }
        }
      } else {
        setQuantities({});
        setPrevQuantities({});
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey, reloadTick]);

  // ── Realtime sync for multi-user ──────────────────────────

  const localWriteRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;
    const channelName = `inventaire-${session.id}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "inventaire_lignes",
        filter: `inventaire_id=eq.${session.id}`,
      }, (payload) => {
        const row = (payload.new ?? payload.old) as { ingredient_id: string; quantite: number; zone?: string | null } | undefined;
        if (!row?.ingredient_id) return;
        const key = `${row.ingredient_id}|${row.zone ?? ""}`;
        // Skip if this was our own write (avoid echo)
        if (localWriteRef.current.has(key)) {
          localWriteRef.current.delete(key);
          return;
        }
        if (payload.eventType === "DELETE") {
          setQuantities(prev => { const n = { ...prev }; delete n[key]; return n; });
        } else {
          setQuantities(prev => ({ ...prev, [key]: row.quantite }));
        }
        setLastSyncEvent(new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      })
      .subscribe((status) => {
        setSyncActive(status === "SUBSCRIBED");
      });

    return () => { supabase.removeChannel(channel); };
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Create session ────────────────────────────────────────

  async function createSession() {
    if (!etab?.id || !userId) return;
    setSaving(true);
    const { data, error } = await supabase.from("inventaires").insert({
      etablissement_id: etab.id,
      created_by: userId,
      date: new Date().toISOString().slice(0, 10),
    }).select().single();

    if (error) { alert(error.message); setSaving(false); return; }
    setSession(data as Inventaire);
    setQuantities({});
    setSaving(false);
  }

  // ── Save line (debounced upsert) ──────────────────────────

  const upsertLigne = useCallback(async (sessionId: string, ingredientId: string, qty: number, ing: Ingredient, zoneDb: string) => {
    localWriteRef.current.add(`${ingredientId}|${zoneDb}`);
    if (qty <= 0) {
      await supabase.from("inventaire_lignes")
        .delete()
        .eq("inventaire_id", sessionId)
        .eq("ingredient_id", ingredientId)
        .eq("zone", zoneDb);
      return;
    }
    await supabase.from("inventaire_lignes").upsert({
      inventaire_id: sessionId,
      ingredient_id: ingredientId,
      zone: zoneDb,
      quantite: qty,
      unite: ing.default_unit ?? null,
      cout_unitaire: ing.cost_per_unit ?? null,
    }, { onConflict: "inventaire_id,ingredient_id,zone" });
  }, []);

  function handleQtyChange(id: string, val: string) {
    const parsed = val === "" ? "" : parseFloat(val);
    if (val !== "" && isNaN(parsed as number)) return;
    const zoneDb = zoneDbKey(activeZone);
    const key = qk(id, activeZone);
    setQuantities((prev) => ({ ...prev, [key]: parsed }));

    if (!session) return;
    clearTimeout(debounceRef.current[key]);
    debounceRef.current[key] = setTimeout(() => {
      const qty = typeof parsed === "number" ? parsed : 0;
      const ing = ingredients.find((i) => i.id === id);
      if (ing) upsertLigne(session.id, id, qty, ing, zoneDb);
    }, 600);
  }

  // ── Bulk set category to 0 ─────────────────────────────────

  function markCategoryZero(catIngredients: Ingredient[]) {
    if (!session) return;
    const nonSaisis = catIngredients.filter(i => { const v = quantities[qk(i.id, activeZone)]; return !v || v === "" || Number(v) === 0; });
    if (nonSaisis.length === 0) return;
    const ok = confirm(`Marquer ${nonSaisis.length} article(s) non saisis comme "0" ?`);
    if (!ok) return;
    const newQ = { ...quantities };
    for (const ing of nonSaisis) {
      newQ[qk(ing.id, activeZone)] = 0;
      // Actually we don't save 0 — it means "counted, nothing in stock"
      // But we need to persist it. Let's save as a tiny epsilon or just delete.
      // Actually the UX intent is "confirm this category is empty". We mark as 0.
      // For DB: qty 0 means delete the line. Instead, use a very small value or leave as 0.
      // Better: save as 0.001 to indicate "counted" or just skip DB write.
      // Simplest: just set state to 0, meaning "saisi" visually. No DB write needed
      // since the user confirmed they're 0.
    }
    setQuantities(newQ);
  }

  // ── Cloturer ──────────────────────────────────────────────

  async function cloturerSession() {
    if (!session || !userId) return;
    const ok = confirm("Cloturer cet inventaire ? Il ne sera plus modifiable.");
    if (!ok) return;

    setSaving(true);

    // Valeur totale : somme des quantités de TOUTES les zones par produit
    let total = 0;
    for (const ing of ingredients) {
      const qty = ingTotals.totals[ing.id] ?? 0;
      if (qty > 0 && ing.cost_per_unit != null) {
        total += qty * ing.cost_per_unit;
      }
    }

    const { error } = await supabase.from("inventaires").update({
      statut: "cloture",
      total_valeur: Math.round(total * 100) / 100,
      cloture_par: userId,
      cloture_at: new Date().toISOString(),
    }).eq("id", session.id);

    if (error) { alert(error.message); setSaving(false); return; }

    // Create stock movements from inventory (adjustment to match real stock)
    const movements = ingredients
      .filter(ing => (ingTotals.totals[ing.id] ?? 0) > 0)
      .map(ing => ({
        etablissement_id: etab?.id,
        ingredient_id: ing.id,
        type: "inventaire",
        quantity: ingTotals.totals[ing.id] ?? 0,
        unit: ing.purchase_unit_label || "pcs",
        reference_type: `inventaire_${session.id}`,
        note: `Inventaire du ${new Date().toLocaleDateString("fr-FR")}`,
      }));

    if (movements.length > 0) {
      // Delete previous inventory movements for this session (idempotent)
      await supabase.from("stock_movements").delete()
        .eq("reference_type", `inventaire_${session.id}`);
      await supabase.from("stock_movements").insert(movements);
    }

    await reload();
    setSaving(false);
  }

  // ── View closed inventory ─────────────────────────────────

  async function viewInventaire(inv: Inventaire) {
    setViewingId(inv.id);
    const { data: lignes, error: ligErr } = await supabase
      .from("inventaire_lignes")
      .select("ingredient_id, quantite, zone")
      .eq("inventaire_id", inv.id);
    if (ligErr) { console.error("inventaire_lignes view query:", ligErr); }
    const qMap: Record<string, number | ""> = {};
    for (const l of (lignes ?? []) as { ingredient_id: string; quantite: number; zone?: string | null }[]) {
      if (l.ingredient_id && l.quantite > 0) qMap[`${l.ingredient_id}|${l.zone ?? ""}`] = l.quantite;
    }
    setQuantities(qMap);
  }

  function backToList() {
    setViewingId(null);
    if (session) {
      reload();
    } else {
      setQuantities({});
    }
  }

  // ── Add / delete zone ────────────────────────────────────

  async function addZone() {
    const name = newZoneName.trim();
    if (!name) return;
    setAddingZone(true);
    const { error } = await supabase.from("storage_zones").insert({
      name,
      etablissement_id: etab?.id ?? null,
      display_order: zones.length,
      supplier_ids: newZoneSupplierIds.length > 0 ? newZoneSupplierIds : [],
      category_slugs: newZoneCategorySlugs.length > 0 ? newZoneCategorySlugs : [],
    });
    if (error) {
      if (error.message.includes("unique") || error.message.includes("duplicate")) {
        alert("Cette zone existe déjà.");
      } else {
        alert(error.message);
      }
      setAddingZone(false);
      return;
    }
    // Pas d'affectation : la zone AFFICHE automatiquement les produits de
    // ses catégories/fournisseurs, sans les retirer des autres zones.
    await loadZones();
    setNewZoneName("");
    setNewZoneSupplierIds([]);
    setNewZoneCategorySlugs([]);
    setShowAddZone(false);
    setAddingZone(false);
    setActiveZone(name);
  }

  async function deleteZone(zone: StorageZone) {
    const count = ingredients.filter(i => i.storage_zone === zone.name).length;
    const msg = count > 0
      ? `"${zone.name}" est utilisée par ${count} ingrédient(s). Les ingrédients seront déplacés dans "Sans zone". Supprimer ?`
      : `Supprimer la zone "${zone.name}" ?`;
    if (!confirm(msg)) return;

    if (count > 0) {
      await supabase.from("ingredients").update({ storage_zone: null }).eq("storage_zone", zone.name);
    }
    await supabase.from("storage_zones").delete().eq("id", zone.id);
    const zList = await loadZones();
    if (count > 0) {
      let q = supabase.from("ingredients").select("*").eq("is_active", true).order("name");
      if (etab?.id) q = q.eq("etablissement_id", etab.id);
      const { data } = await q;
      setIngredients((data ?? []) as Ingredient[]);
    }
    if (activeZone === zone.name) {
      setActiveZone(zList.length > 0 ? zList[0].name : SANS_ZONE);
    }
  }

  /** Ajoute/retire une catégorie des critères d'une zone (vue mise à jour en direct) */
  async function toggleZoneCategory(zone: StorageZone, cat: string) {
    const cur = zone.category_slugs ?? [];
    const next = cur.includes(cat) ? cur.filter(c => c !== cat) : [...cur, cat];
    const { error } = await supabase.from("storage_zones").update({ category_slugs: next }).eq("id", zone.id);
    if (error) { alert(error.message); return; }
    setZones(prev => prev.map(z => z.id === zone.id ? { ...z, category_slugs: next } : z));
  }

  async function renameZone(zone: StorageZone) {
    const name = prompt(`Nouveau nom pour la zone "${zone.name}" :`, zone.name)?.trim();
    if (!name || name === zone.name) return;
    const { error } = await supabase.from("storage_zones").update({ name }).eq("id", zone.id);
    if (error) { alert(error.message); return; }
    await supabase.from("ingredients").update({ storage_zone: name }).eq("storage_zone", zone.name);
    setIngredients(prev => prev.map(i => i.storage_zone === zone.name ? { ...i, storage_zone: name } : i));
    if (activeZone === zone.name) setActiveZone(name);
    await loadZones();
  }

  /** Affecte les produits cochés à la zone active */
  async function assignSelectedToZone() {
    if (addProdSel.size === 0 || activeZone === SANS_ZONE) return;
    setAddingProducts(true);
    const ids = [...addProdSel];
    const { error } = await supabase.from("ingredients").update({ storage_zone: activeZone }).in("id", ids);
    setAddingProducts(false);
    if (error) { alert(error.message); return; }
    setIngredients(prev => prev.map(i => ids.includes(i.id) ? { ...i, storage_zone: activeZone } : i));
    setAddProdSel(new Set());
    setShowAddProducts(false);
  }

  /** Création rapide d'un produit directement dans la zone active */
  async function quickCreateProduct() {
    const name = addProdSearch.trim();
    if (!name || activeZone === SANS_ZONE) return;
    setAddingProducts(true);
    const { data, error } = await supabase.from("ingredients").insert({
      name,
      category: quickCreateCat,
      is_active: true,
      default_unit: "pc",
      storage_zone: activeZone,
      ...(etab?.id ? { etablissement_id: etab.id } : {}),
    }).select("*").single();
    setAddingProducts(false);
    if (error) { alert(error.message); return; }
    if (data) setIngredients(prev => [...prev, data as Ingredient].sort((a, b) => a.name.localeCompare(b.name)));
    setAddProdSearch("");
  }

  // ── Computed ───────────────────────────────────────────────

  const displayZones = useMemo(() => {
    // Deduplique par nom : sans etablissement selectionne, les zones des
    // deux restos peuvent porter le meme nom (ex. CHAMBRE FROIDE)
    const seen = new Set<string>();
    const tabs: { id: string; nom: string }[] = [];
    for (const z of zones) {
      if (seen.has(z.name)) continue;
      seen.add(z.name);
      tabs.push({ id: z.name, nom: z.name });
    }
    const hasUnassigned = ingredients.some(i => isUnzoned(i, zones));
    if (hasUnassigned) {
      tabs.push({ id: SANS_ZONE, nom: "Sans zone" });
    }
    return tabs;
  }, [zones, ingredients]);

  const zoneIngredients = useMemo(() => {
    if (activeZone === SANS_ZONE) return ingredients.filter((ing) => isUnzoned(ing, zones));
    const zone = zones.find(z => z.name === activeZone);
    if (!zone) return [];
    return ingredients.filter((ing) => zoneHasIngredient(zone, ing));
  }, [ingredients, activeZone, zones]);

  // Group by category
  const categoryGroups = useMemo(() => {
    let items = zoneIngredients;
    if (searchInv.trim()) {
      const q = searchInv.trim().toLowerCase();
      items = ingredients.filter(i => i.name.toLowerCase().includes(q)); // search across all zones
    } else if (filterNonSaisis) {
      items = items.filter(i => {
        const v = quantities[qk(i.id, activeZone)];
        return Number(v ?? 0) === 0 && v !== 0;
      });
    }
    const map = new Map<Category, Ingredient[]>();
    for (const ing of items) {
      const cat = ing.category as Category;
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(ing);
    }
    // Sort by CATEGORIES order, filter empty
    return CATEGORIES
      .filter(cat => map.has(cat))
      .map(cat => ({
        cat,
        label: CAT_LABELS[cat],
        color: CAT_COLORS[cat],
        items: map.get(cat)!,
      }));
  }, [zoneIngredients, filterNonSaisis, quantities, searchInv, ingredients, activeZone]);

  const isActive = !!session && !viewingId;
  const isPaused = isActive && session?.statut === "en_pause";
  const isViewing = !!viewingId;
  const readOnly = isViewing || isPaused;

  // Summary per zone
  const zoneSummary = useMemo(() => {
    let articles = 0;
    let saisis = 0;
    let value = 0;
    for (const ing of zoneIngredients) {
      articles++;
      const v = quantities[qk(ing.id, activeZone)];
      const qty = Number(v ?? 0);
      if (qty > 0 || v === 0) {
        saisis++;
        if (qty > 0 && ing.cost_per_unit != null) value += qty * ing.cost_per_unit;
      }
    }
    return { articles, saisis, value };
  }, [zoneIngredients, quantities, activeZone]);

  // Global summary
  const totalSummary = useMemo(() => {
    let saisis = 0;
    let value = 0;
    for (const ing of ingredients) {
      const qty = ingTotals.totals[ing.id] ?? 0;
      if (qty > 0) {
        saisis++;
        if (ing.cost_per_unit != null) value += qty * ing.cost_per_unit;
      }
    }
    return { saisis, value };
  }, [ingredients, ingTotals]);

  // Zone counts + progress for badges
  const zoneStats = useMemo(() => {
    const stats: Record<string, { saisis: number; total: number }> = {};
    const bump = (key: string, saisi: boolean) => {
      if (!stats[key]) stats[key] = { saisis: 0, total: 0 };
      stats[key].total++;
      if (saisi) stats[key].saisis++;
    };
    for (const ing of ingredients) {
      let inAny = false;
      for (const z of zones) {
        if (zoneHasIngredient(z, ing)) {
          const v = quantities[qk(ing.id, z.name)];
          bump(z.name, v !== undefined && v !== "");
          inAny = true;
        }
      }
      if (!inAny) {
        const v = quantities[qk(ing.id, SANS_ZONE)];
        bump(SANS_ZONE, v !== undefined && v !== "");
      }
    }
    return stats;
  }, [ingredients, quantities, zones]);

  // ── Render: loading ───────────────────────────────────────

  if (loading) {
    return (
      <RequireRole permission="achats.inventaire">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        </div>
      </RequireRole>
    );
  }

  // ── Render: empty state ───────────────────────────────────

  if (!isActive && !isViewing) {
    return (
      <RequireRole permission="achats.inventaire">
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
          <div style={{
            background: "#fff", borderRadius: 16, border: "1.5px solid #ddd6c8",
            padding: "48px 24px", textAlign: "center", marginBottom: 24,
          }}>
            <div style={{ fontSize: 48, marginBottom: 12, opacity: 0.8 }}>&#x1F4CB;</div>
            <div style={{
              fontFamily: "Oswald, sans-serif", fontSize: 18, fontWeight: 700,
              color: "#1a1a1a", marginBottom: 6,
            }}>
              Inventaire
            </div>
            <p style={{ color: "#999", fontSize: 13, marginBottom: 20, maxWidth: 320, margin: "0 auto 20px" }}>
              Comptez vos articles zone par zone. Les quantites sont enregistrees automatiquement.
            </p>
            <button
              onClick={createSession}
              disabled={saving || !userId}
              style={{
                background: "#D4775A", color: "#fff", border: "none", borderRadius: 12,
                padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer",
                fontFamily: "Oswald, sans-serif",
                boxShadow: "0 4px 16px rgba(212,119,90,0.25)",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "Creation..." : "Nouvel inventaire"}
            </button>
          </div>

          {historique.length > 0 && (
            <div>
              <div style={{
                fontFamily: "Oswald, sans-serif", fontSize: 15, fontWeight: 700,
                color: "#1a1a1a", marginBottom: 10,
              }}>
                Inventaires precedents
              </div>
              {historique.map((inv) => (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => viewInventaire(inv)}
                  style={{
                    width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                    background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10,
                    padding: "12px 16px", marginBottom: 6, cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                      {fmtDate(inv.date)}
                    </div>
                    <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                      Cloture
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#D4775A" }}>
                      {inv.total_valeur != null ? fmtMoney(inv.total_valeur) : "-"}
                    </span>
                    <button type="button" onClick={(e) => { e.stopPropagation(); window.open(`/api/inventaire/pdf?id=${inv.id}`, "_blank"); }}
                      style={{ padding: "4px 10px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", color: "#666" }}>
                      PDF
                    </button>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </RequireRole>
    );
  }

  // ── Render: active session or viewing closed ──────────────

  const currentInv = isViewing
    ? historique.find((h) => h.id === viewingId)
    : session;

  const progressPct = zoneSummary.articles > 0 ? Math.round((zoneSummary.saisis / zoneSummary.articles) * 100) : 0;

  return (
    <RequireRole permission="achats.inventaire">
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>

        {/* Header */}
        {isViewing && (
          <button
            onClick={backToList}
            type="button"
            style={{
              background: "none", border: "none", cursor: "pointer", padding: 0,
              fontSize: 13, color: "#999", marginBottom: 12, display: "block",
            }}
          >
            &larr; Retour
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>
              {isViewing ? `Inventaire du ${fmtDate(currentInv?.date ?? "")}` : "Inventaire en cours"}
            </div>
            {isActive && (
              <div style={{ fontSize: 12, color: "#999", marginTop: 2, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>{fmtDate(session.date)} &middot; {isPaused ? "En pause" : "Sauvegarde auto"}</span>
                {isPaused && (
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: "#fbf1e0", color: "#D4A03C" }}>
                    PAUSE
                  </span>
                )}
                {syncActive && (
                  <span style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                    background: "#eaf4ec", color: "#4a6741",
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4a6741" }} />
                    Multi-utilisateurs
                    {lastSyncEvent && <span style={{ color: "#999", marginLeft: 4 }}>sync {lastSyncEvent}</span>}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {/* PDF export */}
            {(isActive || isViewing) && currentInv && (
              <button
                onClick={() => window.open(`/api/inventaire/pdf?id=${currentInv.id}`, "_blank")}
                style={{
                  padding: "8px 14px", borderRadius: 20, border: "1.5px solid #ddd6c8",
                  background: "#fff", color: "#666", fontSize: 12, fontWeight: 600,
                  cursor: "pointer", whiteSpace: "nowrap",
                }}
              >
                PDF
              </button>
            )}
            {isActive && (
              <>
                {session.statut === "en_cours" ? (
                  <button
                    onClick={async () => {
                      await supabase.from("inventaires").update({ statut: "en_pause" }).eq("id", session.id);
                      setSession({ ...session, statut: "en_pause" });
                    }}
                    style={{
                      padding: "8px 14px", borderRadius: 20, border: "1.5px solid #D4A03C",
                      background: "#fff", color: "#D4A03C", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    onClick={async () => {
                      await supabase.from("inventaires").update({ statut: "en_cours" }).eq("id", session.id);
                      setSession({ ...session, statut: "en_cours" });
                    }}
                    style={{
                      padding: "8px 14px", borderRadius: 20, border: "1.5px solid #D4775A",
                      background: "#D4775A", color: "#fff", fontSize: 12, fontWeight: 700,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    Reprendre
                  </button>
                )}
                <button
                  onClick={cloturerSession}
                  disabled={saving}
                  style={{
                    padding: "8px 18px", borderRadius: 20, border: "1.5px solid #4a6741",
                    background: "#4a6741", color: "#fff", fontSize: 13, fontWeight: 700,
                    cursor: "pointer", opacity: saving ? 0.6 : 1, whiteSpace: "nowrap",
                  }}
                >
                  {saving ? "..." : "Cloturer"}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Summary */}
        <div style={summaryCard}>
          <div style={summaryItem}>
            <span style={summaryLabel}>Saisis</span>
            <span style={summaryValue}>{totalSummary.saisis} / {ingredients.length}</span>
          </div>
          <div style={{ width: 1, background: "#ddd6c8", alignSelf: "stretch" }} />
          <div style={summaryItem}>
            <span style={summaryLabel}>Valeur</span>
            <span style={summaryValue}>
              {totalSummary.value > 0 ? fmtMoney(totalSummary.value) : "-"}
            </span>
          </div>
          {Object.keys(prevQuantities).length > 0 && (
            <>
              <div style={{ width: 1, background: "#ddd6c8", alignSelf: "stretch" }} />
              <div style={summaryItem}>
                <span style={summaryLabel}>Ecart vs prec.</span>
                <span style={summaryValue}>
                  {(() => {
                    let delta = 0;
                    for (const ing of ingredients) {
                      const cur = ingTotals.totals[ing.id] ?? 0;
                      const prev = prevQuantities[ing.id] ?? 0;
                      if (cur > 0 && prev > 0 && ing.cost_per_unit) delta += (cur - prev) * ing.cost_per_unit;
                    }
                    return (
                      <span style={{ color: delta >= 0 ? "#4a6741" : "#DC2626" }}>
                        {delta >= 0 ? "+" : ""}{fmtMoney(delta)}
                      </span>
                    );
                  })()}
                </span>
              </div>
            </>
          )}
          {/* Stock alerts count */}
          {(() => {
            const alerts = ingredients.filter(ing => {
              const qty = ingTotals.totals[ing.id] ?? 0;
              return qty > 0 && ing.stock_min != null && qty < ing.stock_min;
            });
            if (alerts.length === 0) return null;
            return (
              <>
                <div style={{ width: 1, background: "#ddd6c8", alignSelf: "stretch" }} />
                <div style={summaryItem}>
                  <span style={summaryLabel}>Alertes</span>
                  <span style={{ ...summaryValue, color: "#DC2626" }}>{alerts.length} sous min</span>
                </div>
              </>
            );
          })()}
        </div>

        {/* Zone tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          {displayZones.map((z) => {
            const isActiveZone = activeZone === z.id;
            const zs = zoneStats[z.id];
            const pct = zs && zs.total > 0 ? Math.round((zs.saisis / zs.total) * 100) : 0;
            const isDone = pct === 100 && zs && zs.total > 0;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setActiveZone(z.id)}
                style={{
                  padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  border: isActiveZone ? "1.5px solid #D4775A" : isDone ? "1.5px solid #4a6741" : "1px solid #ddd6c8",
                  background: isActiveZone ? "#D4775A" : isDone ? "#eaf4ec" : "#fff",
                  color: isActiveZone ? "#fff" : isDone ? "#4a6741" : "#1a1a1a",
                  transition: "all 0.15s",
                }}
              >
                {z.nom}
                {zs && zs.total > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                    background: isActiveZone ? "rgba(255,255,255,0.3)" : isDone ? "#4a6741" : "rgba(0,0,0,0.06)",
                    color: isActiveZone || isDone ? "#fff" : "#999",
                  }}>
                    {pct}%
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setShowAddZone(true)}
            style={{
              width: 32, height: 32, borderRadius: 20, fontSize: 16, fontWeight: 700,
              cursor: "pointer", border: "1.5px dashed #ddd6c8", background: "#fff",
              color: "#999", display: "flex", alignItems: "center", justifyContent: "center",
            }}
            title="Ajouter une zone"
          >+</button>
          {zones.length > 0 && (
            <button
              type="button"
              onClick={() => setShowManageZones(!showManageZones)}
              style={{
                fontSize: 11, color: "#999", background: "none", border: "none",
                cursor: "pointer", textDecoration: "underline", padding: "4px 0",
              }}
            >
              {showManageZones ? "Fermer" : "Gérer"}
            </button>
          )}
        </div>

        {/* Add zone inline */}
        {showAddZone && (
          <div style={{
            marginBottom: 12, padding: "14px 16px", background: "#fff", borderRadius: 12,
            border: "1.5px solid #ddd6c8", display: "flex", flexDirection: "column", gap: 10,
          }}>
            <input
              autoFocus
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addZone(); if (e.key === "Escape") setShowAddZone(false); }}
              placeholder="Nom de la zone (ex: Chambre froide, Reserve)"
              style={{
                height: 38, borderRadius: 8, border: "1.5px solid #e5ddd0",
                padding: "4px 12px", fontSize: 14, background: "#fff", width: "100%",
              }}
            />
            {/* Auto-assign: fournisseurs */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 4 }}>Assigner les produits de ces fournisseurs :</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {suppliers.map(s => {
                  const sel = newZoneSupplierIds.includes(s.id);
                  return (
                    <button key={s.id} type="button" onClick={() => {
                      setNewZoneSupplierIds(prev => sel ? prev.filter(x => x !== s.id) : [...prev, s.id]);
                    }} style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: sel ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                      background: sel ? "#D4775A" : "#fff",
                      color: sel ? "#fff" : "#666", cursor: "pointer",
                    }}>{s.name}</button>
                  );
                })}
              </div>
            </div>
            {/* Auto-assign: categories */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 4 }}>Ou assigner par categorie :</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {CATEGORIES.map(cat => {
                  const sel = newZoneCategorySlugs.includes(cat);
                  return (
                    <button key={cat} type="button" onClick={() => {
                      setNewZoneCategorySlugs(prev => sel ? prev.filter(x => x !== cat) : [...prev, cat]);
                    }} style={{
                      padding: "4px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: sel ? `1.5px solid ${CAT_COLORS[cat]}` : "1px solid #ddd6c8",
                      background: sel ? CAT_COLORS[cat] : "#fff",
                      color: sel ? "#fff" : "#666", cursor: "pointer",
                    }}>{CAT_LABELS[cat]}</button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => { setShowAddZone(false); setNewZoneName(""); setNewZoneSupplierIds([]); setNewZoneCategorySlugs([]); }}
                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, cursor: "pointer", color: "#999" }}>
                Annuler
              </button>
              <button type="button" onClick={addZone} disabled={addingZone || !newZoneName.trim()}
                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#D4775A", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: addingZone || !newZoneName.trim() ? 0.5 : 1 }}>
                {addingZone ? "..." : "Creer la zone"}
              </button>
            </div>
          </div>
        )}

        {/* Manage zones panel */}
        {showManageZones && (
          <div style={{
            marginBottom: 12, padding: "12px 14px", background: "#fff",
            borderRadius: 10, border: "1.5px solid #ddd6c8",
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8, color: "#1a1a1a" }}>
              Zones de stockage
            </div>
            {zones.map((z) => {
              const nbVisible = ingredients.filter(i => zoneHasIngredient(z, i)).length;
              const nbCats = (z.category_slugs ?? []).length;
              const editing = editCatsZoneId === z.id;
              return (
                <div key={z.id} style={{ borderBottom: "1px solid #f0ebe2" }}>
                  <div style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "6px 0",
                  }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{z.name}</span>
                      <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                        {nbVisible} produit{nbVisible !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 2 }}>
                      <button type="button" onClick={() => setEditCatsZoneId(editing ? null : z.id)}
                        style={{ fontSize: 11, color: editing ? "#fff" : "#8B6914", background: editing ? "#8B6914" : "none", border: "none", borderRadius: 6, cursor: "pointer", padding: "4px 8px", fontWeight: 600 }}>
                        Catégories{nbCats > 0 ? ` (${nbCats})` : ""}
                      </button>
                      <button type="button" onClick={() => renameZone(z)}
                        style={{ fontSize: 11, color: "#2563EB", background: "none", border: "none", cursor: "pointer", padding: "4px 8px" }}>
                        Renommer
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteZone(z)}
                        style={{
                          fontSize: 11, color: "#DC2626", background: "none", border: "none",
                          cursor: "pointer", padding: "4px 8px",
                        }}
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  {editing && (
                    <div style={{ padding: "2px 0 10px" }}>
                      <div style={{ fontSize: 10.5, color: "#999", marginBottom: 6 }}>
                        La zone affiche automatiquement tous les produits des catégories cochées (sans les retirer des autres zones).
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {CATEGORIES.map(cat => {
                          const sel = (z.category_slugs ?? []).includes(cat);
                          return (
                            <button key={cat} type="button" onClick={() => toggleZoneCategory(z, cat)}
                              style={{
                                padding: "4px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, cursor: "pointer",
                                border: sel ? "1.5px solid #D4775A" : "1.5px solid #e0d8ce",
                                background: sel ? "rgba(212,119,90,0.10)" : "#fff",
                                color: sel ? "#D4775A" : "#777",
                              }}>
                              {CAT_LABELS[cat]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Modal : ajouter des produits à la zone active */}
        {showAddProducts && (() => {
          const q = addProdSearch.trim().toLowerCase();
          const activeZoneObj = zones.find(z => z.name === activeZone);
          const candidates = ingredients
            .filter(i => !activeZoneObj || !zoneHasIngredient(activeZoneObj, i))
            .filter(i => !q || i.name.toLowerCase().includes(q))
            .slice(0, 60);
          const exactExists = ingredients.some(i => i.name.trim().toLowerCase() === q);
          return (
            <div onClick={() => setShowAddProducts(false)} style={{
              position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.4)",
              display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}>
              <div onClick={e => e.stopPropagation()} style={{
                background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520,
                maxHeight: "85vh", display: "flex", flexDirection: "column",
                boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
              }}>
                <div style={{ padding: "16px 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>Ajouter des produits à « {activeZone} »</div>
                  <button type="button" onClick={() => setShowAddProducts(false)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "rgba(0,0,0,0.06)", cursor: "pointer", fontSize: 14 }}>✕</button>
                </div>
                <div style={{ padding: "0 18px 10px" }}>
                  <input
                    autoFocus
                    value={addProdSearch}
                    onChange={e => setAddProdSearch(e.target.value)}
                    placeholder="Rechercher un produit… (ou taper un nom à créer)"
                    style={{ width: "100%", height: 38, borderRadius: 10, border: "1.5px solid #e5ddd0", padding: "0 12px", fontSize: 13, outline: "none", boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "0 18px" }}>
                  {candidates.map(i => {
                    const sel = addProdSel.has(i.id);
                    const zone = resolveZone(i, zones);
                    return (
                      <label key={i.id} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "8px 10px",
                        borderRadius: 10, cursor: "pointer", marginBottom: 4,
                        background: sel ? "rgba(212,119,90,0.10)" : "#faf7f2",
                        border: sel ? "1.5px solid rgba(212,119,90,0.45)" : "1.5px solid transparent",
                      }}>
                        <input type="checkbox" checked={sel} onChange={() => {
                          setAddProdSel(prev => { const n = new Set(prev); if (n.has(i.id)) n.delete(i.id); else n.add(i.id); return n; });
                        }} style={{ width: 16, height: 16, accentColor: "#D4775A" }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{i.name}</span>
                        <span style={{ fontSize: 10, color: "#999" }}>{CAT_LABELS[i.category as Category] ?? i.category}</span>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: zone === SANS_ZONE ? "rgba(0,0,0,0.05)" : "rgba(37,99,235,0.08)", color: zone === SANS_ZONE ? "#999" : "#2563EB" }}>
                          {zone === SANS_ZONE ? "Sans zone" : zone}
                        </span>
                      </label>
                    );
                  })}
                  {candidates.length === 0 && !q && (
                    <div style={{ fontSize: 12, color: "#999", padding: 16, textAlign: "center" }}>Tous les produits sont déjà dans cette zone.</div>
                  )}
                  {q.length >= 2 && !exactExists && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 10px", borderRadius: 10, background: "rgba(45,106,79,0.06)", border: "1.5px dashed rgba(45,106,79,0.35)", marginTop: 6 }}>
                      <span style={{ flex: 1, fontSize: 12.5 }}>Créer « <b>{addProdSearch.trim()}</b> » dans</span>
                      <select value={quickCreateCat} onChange={e => setQuickCreateCat(e.target.value)}
                        style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff" }}>
                        {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                      </select>
                      <button type="button" disabled={addingProducts} onClick={quickCreateProduct}
                        style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#2D6A4F", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                        Créer
                      </button>
                    </div>
                  )}
                </div>
                <div style={{ padding: "12px 18px 16px", borderTop: "1px solid #f0ebe2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button type="button" onClick={() => setShowAddProducts(false)}
                    style={{ padding: "9px 16px", borderRadius: 10, border: "1.5px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    Fermer
                  </button>
                  <button type="button" disabled={addProdSel.size === 0 || addingProducts} onClick={assignSelectedToZone}
                    style={{
                      padding: "9px 18px", borderRadius: 10, border: "none",
                      background: addProdSel.size > 0 ? "#D4775A" : "#e5ddd0",
                      color: addProdSel.size > 0 ? "#fff" : "#999",
                      fontSize: 13, fontWeight: 700, cursor: addProdSel.size > 0 ? "pointer" : "not-allowed",
                    }}>
                    {addingProducts ? "Ajout…" : `Ajouter ${addProdSel.size || ""} produit${addProdSel.size > 1 ? "s" : ""}`}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Search bar + ajout de produits à la zone */}
        <div style={{ marginBottom: 10, display: "flex", gap: 8 }}>
        <div style={{ flex: 1, position: "relative" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchInv}
            onChange={(e) => setSearchInv(e.target.value)}
            placeholder="Rechercher un produit..."
            style={{
              width: "100%", height: 38, borderRadius: 10, border: "1.5px solid #e5ddd0",
              padding: "0 14px 0 36px", fontSize: 13, background: "#fff", outline: "none",
            }}
          />
          {searchInv && (
            <button type="button" onClick={() => setSearchInv("")} style={{
              position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
              background: "none", border: "none", color: "#999", cursor: "pointer", fontSize: 14,
            }}>✕</button>
          )}
        </div>
          {activeZone !== SANS_ZONE && (
            <button type="button" onClick={() => { setShowAddProducts(true); setAddProdSearch(""); setAddProdSel(new Set()); }}
              style={{
                height: 38, padding: "0 14px", borderRadius: 10, border: "none",
                background: "#D4775A", color: "#fff", fontSize: 13, fontWeight: 700,
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>
              + Produits
            </button>
          )}
        </div>

        {/* Progress bar + zone summary */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, padding: "0 4px" }}>
            <span style={{ fontSize: 11, color: "#999" }}>
              {zoneSummary.saisis} / {zoneSummary.articles} articles saisis
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {zoneSummary.value > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: "#D4775A" }}>
                  {fmtMoney(zoneSummary.value)}
                </span>
              )}
              {isActive && (
                <button
                  type="button"
                  onClick={() => setFilterNonSaisis(v => !v)}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 8,
                    cursor: "pointer",
                    border: filterNonSaisis ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                    background: filterNonSaisis ? "#D4775A" : "#fff",
                    color: filterNonSaisis ? "#fff" : "#999",
                    transition: "all 0.15s",
                  }}
                >
                  Non saisis
                </button>
              )}
            </div>
          </div>
          {/* Progress bar */}
          <div style={{
            height: 6, borderRadius: 3, background: "#e5ddd0", overflow: "hidden",
          }}>
            <div style={{
              height: "100%", borderRadius: 3,
              background: progressPct === 100 ? "#4a6741" : "#D4775A",
              width: `${progressPct}%`,
              transition: "width 0.3s ease",
            }} />
          </div>
        </div>

        {/* Category-grouped ingredient list */}
        {categoryGroups.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 32 }}>
            {filterNonSaisis ? "Tous les articles ont été saisis" : "Aucun article dans cette zone"}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
            {categoryGroups.map(({ cat, label, color, items }) => {
              const isCollapsed = searchInv.trim() ? false : collapsedCats.has(cat);
              // Category summary
              let catSaisis = 0;
              let catValue = 0;
              for (const ing of items) {
                const v = quantities[qk(ing.id, activeZone)];
                const qty = Number(v ?? 0);
                if (qty > 0 || v === 0) catSaisis++;
                if (qty > 0 && ing.cost_per_unit != null) catValue += qty * ing.cost_per_unit;
              }
              const catNonSaisis = items.length - catSaisis;

              return (
                <div key={cat}>
                  {/* Category header — same style as ingredients index */}
                  <button
                    type="button"
                    onClick={() => toggleCat(cat)}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = color; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#ddd6c8"; (e.currentTarget.style as CSSStyleDeclaration).borderLeftColor = color; }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "12px 16px", background: "#fff",
                      border: "1.5px solid #ddd6c8", borderLeft: `3px solid ${color}`,
                      borderRadius: 12, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                      marginTop: 12, marginBottom: 6,
                      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
                      transition: "box-shadow 0.2s, border-color 0.2s",
                    }}
                  >
                    {/* Colored dot */}
                    <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {/* UPPERCASE label in category color */}
                    <span style={{
                      fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
                      letterSpacing: "0.14em", textTransform: "uppercase", color,
                    }}>{label}</span>
                    {/* Count badge */}
                    <span style={{
                      fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
                      background: `${color}18`, color,
                    }}>{items.length}</span>
                    {/* Saisis / value info */}
                    <span style={{ fontSize: 11, color: "#999", marginLeft: 4 }}>
                      {catSaisis}/{items.length}
                      {catValue > 0 && ` · ${fmtMoney(catValue)}`}
                    </span>
                    {/* Tout à 0 — span cliquable (un <button> ne peut pas etre imbrique dans le <button> d'en-tete) */}
                    {isActive && catNonSaisis > 0 && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { e.stopPropagation(); markCategoryZero(items); }}
                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); markCategoryZero(items); } }}
                        style={{
                          fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6,
                          border: "1px solid #ddd6c8", background: "#fff", color: "#999",
                          cursor: "pointer", whiteSpace: "nowrap", marginLeft: "auto",
                        }}
                        title="Confirmer tous les articles non saisis comme 0"
                      >
                        Tout à 0
                      </span>
                    )}
                    {/* Chevron */}
                    <span style={{ marginLeft: isActive && catNonSaisis > 0 ? 0 : "auto", fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>&#x25BC;</span>
                  </button>

                  {/* Items */}
                  {!isCollapsed && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 1, marginTop: 2 }}>
                      {items.map((ing) => {
                        const pack = packInfo[ing.id];
                        const rawQty = quantities[qk(ing.id, activeZone)];
                        const totalAllZones = ingTotals.totals[ing.id] ?? 0;
                        const rawQtyNum = typeof rawQty === "number" ? rawQty : 0;
                        const hasQty = rawQtyNum > 0;
                        const isZeroConfirmed = quantities[qk(ing.id, activeZone)] === 0;
                        const valeur = hasQty && ing.cost_per_unit != null
                          ? rawQtyNum * ing.cost_per_unit : null;

                        // For pack items: decompose stored qty into cartons + loose
                        const nbCartons = pack ? Math.floor(rawQtyNum / pack.pack_count) : 0;
                        const nbLoose = pack ? rawQtyNum % pack.pack_count : rawQtyNum;
                        const packUnit = pack?.pack_each_unit ?? ing.default_unit ?? "pcs";

                        return (
                          <div
                            key={ing.id}
                            style={{
                              display: "flex", alignItems: "center", gap: 10,
                              padding: "10px 14px",
                              background: "#fff",
                              borderRadius: 12,
                              border: "1.5px solid #ddd6c8",
                              borderLeft: `3px solid ${hasQty ? color : isZeroConfirmed ? "#ccc" : "#ddd6c8"}`,
                              marginBottom: 4,
                              transition: "all 0.15s",
                              flexWrap: "wrap",
                            }}
                          >
                            {/* Name + unit + delete — affichage produit canonique */}
                            <div className="produit-main" style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
                                <span className="produit-name" style={{
                                  fontSize: 13, fontWeight: hasQty ? 700 : 500,
                                  color: hasQty ? "#1a1a1a" : isZeroConfirmed ? "#999" : "#666",
                                  textDecoration: isZeroConfirmed ? "line-through" : "none",
                                  flex: 1, minWidth: 0,
                                }}>
                                  {ing.name}
                                </span>
                                {isActive && (
                                  <button type="button" onClick={async (e) => {
                                    e.stopPropagation();
                                    if (!confirm(`Retirer "${ing.name}" de cet inventaire ?`)) return;
                                    // Remove from quantities
                                    setQuantities(prev => { const n = { ...prev }; delete n[ing.id]; return n; });
                                    // Delete the line from DB
                                    if (session) await supabase.from("inventaire_lignes").delete().eq("inventaire_id", session.id).eq("ingredient_id", ing.id);
                                    // Deactivate ingredient
                                    await supabase.from("ingredients").update({ is_active: false }).eq("id", ing.id);
                                    setIngredients(prev => prev.filter(p => p.id !== ing.id));
                                  }} style={{
                                    flexShrink: 0, width: 20, height: 20, borderRadius: 5,
                                    border: "none", background: "none", color: "#ccc",
                                    fontSize: 11, cursor: "pointer", display: "flex",
                                    alignItems: "center", justifyContent: "center",
                                  }} title="Supprimer ce produit">✕</button>
                                )}
                              </div>
                              <div style={{ fontSize: 10, color: "#999", marginTop: 1, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                                <span>
                                  {pack
                                    ? `crt ${pack.pack_count} × ${pack.pack_each_qty ?? 1}${packUnit}`
                                    : (ing.default_unit ?? "pcs")}
                                  {hasQty && pack && <span style={{ color: "#7C3AED" }}> = {rawQtyNum} {packUnit}</span>}
                                </span>
                                {/* Previous inventory comparison */}
                                {hasQty && prevQuantities[ing.id] != null && (() => {
                                  const prev = prevQuantities[ing.id];
                                  const delta = rawQtyNum - prev;
                                  if (delta === 0) return null;
                                  return (
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4,
                                      background: delta > 0 ? "rgba(74,103,65,0.10)" : "rgba(220,38,38,0.10)",
                                      color: delta > 0 ? "#4a6741" : "#DC2626",
                                    }}>
                                      {delta > 0 ? "+" : ""}{delta} vs prec.
                                    </span>
                                  );
                                })()}
                                {/* Theoretical stock vs real */}
                                {hasQty && theoreticalStock[ing.id] != null && (() => {
                                  const theo = Math.round(theoreticalStock[ing.id] * 10) / 10;
                                  const ecart = Math.round((rawQtyNum - theo) * 10) / 10;
                                  if (ecart === 0 || theo <= 0) return null;
                                  return (
                                    <span style={{
                                      fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4,
                                      background: Math.abs(ecart) > theo * 0.2 ? "rgba(220,38,38,0.10)" : "rgba(212,160,60,0.10)",
                                      color: Math.abs(ecart) > theo * 0.2 ? "#DC2626" : "#D4A03C",
                                    }}>
                                      theo {theo} ({ecart > 0 ? "+" : ""}{ecart})
                                    </span>
                                  );
                                })()}
                                {/* Stock alerts */}
                                {totalAllZones > rawQtyNum && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4, background: "rgba(37,99,235,0.10)", color: "#2563EB" }}
                                    title="Ce produit est aussi compté dans d'autres zones">
                                    Total {totalAllZones}
                                  </span>
                                )}
                                {hasQty && ing.stock_min != null && totalAllZones < ing.stock_min && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4, background: "rgba(220,38,38,0.10)", color: "#DC2626" }}>
                                    Sous min ({ing.stock_min})
                                  </span>
                                )}
                                {hasQty && ing.stock_max != null && totalAllZones > ing.stock_max && (
                                  <span style={{ fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4, background: "rgba(212,160,60,0.10)", color: "#D4A03C" }}>
                                    Sur-stock ({ing.stock_max})
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Value */}
                            {valeur != null && (
                              <span style={{ fontSize: 11, color: "#999", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                                {fmtMoney(valeur)}
                              </span>
                            )}

                            {/* Qty inputs */}
                            {readOnly ? (
                              <span style={{
                                fontSize: 15, fontWeight: 700, color: hasQty ? "#D4775A" : "#ccc",
                                minWidth: 50, textAlign: "right", flexShrink: 0,
                              }}>
                                {hasQty ? (pack ? `${nbCartons}c + ${nbLoose}` : `${rawQtyNum}`) : "-"}
                              </span>
                            ) : pack ? (
                              /* Dual input: cartons + loose units, avec steppers −/+ */
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 4, flexShrink: 0 }}>
                                <MiniStepper
                                  value={hasQty || isZeroConfirmed ? nbCartons : ""}
                                  active={nbCartons > 0}
                                  color="#7C3AED"
                                  label="crt"
                                  onChange={(c) => handleQtyChange(ing.id, String(c * pack.pack_count + nbLoose))}
                                />
                                <span style={{ fontSize: 11, color: "#999", fontWeight: 600, alignSelf: "center" }}>+</span>
                                <MiniStepper
                                  value={hasQty || isZeroConfirmed ? nbLoose : ""}
                                  active={nbLoose > 0}
                                  color={color}
                                  label={packUnit}
                                  onChange={(l) => handleQtyChange(ing.id, String(nbCartons * pack.pack_count + l))}
                                />
                              </div>
                            ) : (
                              /* Stepper input with +/- buttons */
                              <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
                                <button type="button" onClick={() => {
                                  const cur = typeof rawQty === "number" ? rawQty : 0;
                                  handleQtyChange(ing.id, String(Math.max(0, cur - 1)));
                                }} style={{
                                  width: 32, height: 36, borderRadius: "8px 0 0 8px",
                                  border: "1px solid #ddd6c8", borderRight: "none",
                                  background: "#f9f5ef", color: "#D4775A", fontSize: 18,
                                  fontWeight: 700, cursor: "pointer", display: "flex",
                                  alignItems: "center", justifyContent: "center",
                                }}>-</button>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={rawQty ?? ""}
                                  onChange={(e) => handleQtyChange(ing.id, e.target.value)}
                                  placeholder="0"
                                  style={{
                                    width: 52, height: 36, borderRadius: 0,
                                    border: hasQty ? `1.5px solid ${color}` : "1px solid #ddd6c8",
                                    padding: "0 4px", fontSize: 14, fontWeight: 600,
                                    textAlign: "center", background: "#fff", outline: "none",
                                    color: hasQty ? color : "#1a1a1a",
                                  }}
                                />
                                <button type="button" onClick={() => {
                                  const cur = typeof rawQty === "number" ? rawQty : 0;
                                  handleQtyChange(ing.id, String(cur + 1));
                                }} style={{
                                  width: 32, height: 36, borderRadius: "0 8px 8px 0",
                                  border: "1px solid #ddd6c8", borderLeft: "none",
                                  background: "#f9f5ef", color: "#4a6741", fontSize: 18,
                                  fontWeight: 700, cursor: "pointer", display: "flex",
                                  alignItems: "center", justifyContent: "center",
                                }}>+</button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RequireRole>
  );
}

// ── Styles ──────────────────────────────────────────────────

const summaryCard: React.CSSProperties = {
  display: "flex",
  gap: 24,
  padding: "14px 18px",
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd6c8",
  marginBottom: 16,
};

const summaryItem: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  flex: 1,
};

const summaryLabel: React.CSSProperties = {
  fontSize: 11,
  color: "#999",
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.3,
};

const summaryValue: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#1a1a1a",
  fontFamily: "Oswald, sans-serif",
};
