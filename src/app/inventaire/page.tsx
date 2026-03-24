"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CAT_LABELS, type Category, type Ingredient } from "@/types/ingredients";

// ── Types ────────────────────────────────────────────────────

type Inventaire = {
  id: string;
  date: string;
  statut: "en_cours" | "cloture";
  total_valeur: number | null;
  created_at: string;
  notes: string | null;
};

type StorageZone = {
  id: string;
  name: string;
  display_order: number;
};

const SANS_ZONE = "__sans_zone__";

/** Resolve zone: explicit storage_zone on ingredient, or fallback */
function resolveZone(ing: Ingredient, zones: StorageZone[]): string {
  if (ing.storage_zone) {
    // Check if zone still exists in DB
    if (zones.some(z => z.name === ing.storage_zone)) return ing.storage_zone;
  }
  return SANS_ZONE;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
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

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [zones, setZones] = useState<StorageZone[]>([]);
  const [activeZone, setActiveZone] = useState<string>(SANS_ZONE);
  const [showAddZone, setShowAddZone] = useState(false);
  const [newZoneName, setNewZoneName] = useState("");
  const [addingZone, setAddingZone] = useState(false);
  const [showManageZones, setShowManageZones] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((t) => t + 1), []);

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
      const [{ data, error }, { data: zData }] = await Promise.all([q, zq]);
      if (error) { console.error("ingredients query:", error); }
      setIngredients((data ?? []) as Ingredient[]);
      const zList = (zData ?? []) as StorageZone[];
      setZones(zList);
      if (zList.length > 0) setActiveZone(zList[0].name);
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
      const active = list.find((i) => i.statut === "en_cours") ?? null;
      setSession(active);
      setHistorique(list.filter((i) => i.statut === "cloture"));

      if (active) {
        const { data: lignes, error: ligErr } = await supabase
          .from("inventaire_lignes")
          .select("ingredient_id, quantite")
          .eq("inventaire_id", active.id);
        if (ligErr) { console.error("inventaire_lignes query:", ligErr); }
        if (!cancelled) {
          const q: Record<string, number | ""> = {};
          for (const l of lignes ?? []) {
            if (l.ingredient_id && l.quantite > 0) q[l.ingredient_id] = l.quantite;
          }
          setQuantities(q);
        }
      } else {
        setQuantities({});
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [reloadKey, reloadTick]);

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

  const upsertLigne = useCallback(async (sessionId: string, ingredientId: string, qty: number, ing: Ingredient) => {
    if (qty <= 0) {
      await supabase.from("inventaire_lignes")
        .delete()
        .eq("inventaire_id", sessionId)
        .eq("ingredient_id", ingredientId);
      return;
    }
    await supabase.from("inventaire_lignes").upsert({
      inventaire_id: sessionId,
      ingredient_id: ingredientId,
      quantite: qty,
      unite: ing.default_unit ?? null,
      cout_unitaire: ing.cost_per_unit ?? null,
    }, { onConflict: "inventaire_id,ingredient_id" });
  }, []);

  function handleQtyChange(id: string, val: string) {
    const parsed = val === "" ? "" : parseFloat(val);
    if (val !== "" && isNaN(parsed as number)) return;
    setQuantities((prev) => ({ ...prev, [id]: parsed }));

    // Debounced DB save
    if (!session) return;
    clearTimeout(debounceRef.current[id]);
    debounceRef.current[id] = setTimeout(() => {
      const qty = typeof parsed === "number" ? parsed : 0;
      const ing = ingredients.find((i) => i.id === id);
      if (ing) upsertLigne(session.id, id, qty, ing);
    }, 600);
  }

  // ── Cloturer ──────────────────────────────────────────────

  async function cloturerSession() {
    if (!session || !userId) return;
    const ok = confirm("Cloturer cet inventaire ? Il ne sera plus modifiable.");
    if (!ok) return;

    setSaving(true);

    // Compute total value
    let total = 0;
    for (const ing of ingredients) {
      const qty = Number(quantities[ing.id] ?? 0);
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
    await reload();
    setSaving(false);
  }

  // ── View closed inventory ─────────────────────────────────

  async function viewInventaire(inv: Inventaire) {
    setViewingId(inv.id);
    const { data: lignes, error: ligErr } = await supabase
      .from("inventaire_lignes")
      .select("ingredient_id, quantite")
      .eq("inventaire_id", inv.id);
    if (ligErr) { console.error("inventaire_lignes view query:", ligErr); }
    const q: Record<string, number | ""> = {};
    for (const l of lignes ?? []) {
      if (l.ingredient_id && l.quantite > 0) q[l.ingredient_id] = l.quantite;
    }
    setQuantities(q);
  }

  function backToList() {
    setViewingId(null);
    if (session) {
      // Reload active session lines
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
    await loadZones();
    setNewZoneName("");
    setShowAddZone(false);
    setAddingZone(false);
    setActiveZone(name);
  }

  async function deleteZone(zone: StorageZone) {
    // Check if any ingredients use this zone
    const count = ingredients.filter(i => i.storage_zone === zone.name).length;
    const msg = count > 0
      ? `"${zone.name}" est utilisée par ${count} ingrédient(s). Les ingrédients seront déplacés dans "Sans zone". Supprimer ?`
      : `Supprimer la zone "${zone.name}" ?`;
    if (!confirm(msg)) return;

    // Clear storage_zone on ingredients that use this zone
    if (count > 0) {
      await supabase.from("ingredients").update({ storage_zone: null }).eq("storage_zone", zone.name);
    }
    await supabase.from("storage_zones").delete().eq("id", zone.id);
    const zList = await loadZones();
    // Reload ingredients to reflect cleared zones
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

  // ── Computed ───────────────────────────────────────────────

  // Tabs: DB zones + "Sans zone" if any unassigned ingredients
  const displayZones = useMemo(() => {
    const tabs: { id: string; nom: string }[] = zones.map(z => ({ id: z.name, nom: z.name }));
    // Check if any ingredients have no zone
    const hasUnassigned = ingredients.some(i => resolveZone(i, zones) === SANS_ZONE);
    if (hasUnassigned) {
      tabs.push({ id: SANS_ZONE, nom: "Sans zone" });
    }
    return tabs;
  }, [zones, ingredients]);

  const zoneIngredients = useMemo(() => {
    return ingredients.filter((ing) => resolveZone(ing, zones) === activeZone);
  }, [ingredients, activeZone, zones]);

  const isActive = !!session && !viewingId;
  const isViewing = !!viewingId;
  const readOnly = isViewing;

  // Summary per zone
  const zoneSummary = useMemo(() => {
    let articles = 0;
    let saisis = 0;
    let value = 0;
    for (const ing of zoneIngredients) {
      articles++;
      const qty = Number(quantities[ing.id] ?? 0);
      if (qty > 0) {
        saisis++;
        if (ing.cost_per_unit != null) value += qty * ing.cost_per_unit;
      }
    }
    return { articles, saisis, value };
  }, [zoneIngredients, quantities]);

  // Global summary
  const totalSummary = useMemo(() => {
    let saisis = 0;
    let value = 0;
    for (const ing of ingredients) {
      const qty = Number(quantities[ing.id] ?? 0);
      if (qty > 0) {
        saisis++;
        if (ing.cost_per_unit != null) value += qty * ing.cost_per_unit;
      }
    }
    return { saisis, value };
  }, [ingredients, quantities]);

  // Zone counts for badges
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ing of ingredients) {
      const qty = Number(quantities[ing.id] ?? 0);
      if (qty > 0) {
        const zone = resolveZone(ing, zones);
        counts[zone] = (counts[zone] ?? 0) + 1;
      }
    }
    return counts;
  }, [ingredients, quantities, zones]);

  // ── Render: empty state (no active session) ───────────────

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", marginTop: 40 }}>Chargement...</p>
        </div>
      </RequireRole>
    );
  }

  if (!isActive && !isViewing) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>

          {/* Empty state card */}
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

          {/* Historique */}
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
                  <div style={{ fontSize: 15, fontWeight: 700, color: "#D4775A" }}>
                    {inv.total_valeur != null ? fmtMoney(inv.total_valeur) : "-"}
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

  return (
    <RequireRole allowedRoles={["group_admin"]}>
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
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>
                {fmtDate(session.date)} &middot; Les quantites s&apos;enregistrent automatiquement
              </div>
            )}
          </div>
          {isActive && (
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
          )}
        </div>

        {/* Summary */}
        <div style={summaryCard}>
          <div style={summaryItem}>
            <span style={summaryLabel}>Articles saisis</span>
            <span style={summaryValue}>{totalSummary.saisis} / {ingredients.length}</span>
          </div>
          <div style={{ width: 1, background: "#ddd6c8", alignSelf: "stretch" }} />
          <div style={summaryItem}>
            <span style={summaryLabel}>Valeur totale</span>
            <span style={summaryValue}>
              {totalSummary.value > 0 ? fmtMoney(totalSummary.value) : "-"}
            </span>
          </div>
        </div>

        {/* Zone tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
          {displayZones.map((z) => {
            const isActiveZone = activeZone === z.id;
            const count = zoneCounts[z.id] ?? 0;
            return (
              <button
                key={z.id}
                type="button"
                onClick={() => setActiveZone(z.id)}
                style={{
                  padding: "8px 14px", borderRadius: 20, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                  border: isActiveZone ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                  background: isActiveZone ? "#D4775A" : "#fff",
                  color: isActiveZone ? "#fff" : "#1a1a1a",
                  transition: "all 0.15s",
                }}
              >
                {z.nom}
                {count > 0 && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8,
                    background: isActiveZone ? "rgba(255,255,255,0.3)" : "#D4775A",
                    color: "#fff",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
          {/* Add zone button */}
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
          {/* Manage zones button */}
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
            display: "flex", gap: 8, marginBottom: 12, alignItems: "center",
            padding: "10px 14px", background: "#fff", borderRadius: 10,
            border: "1.5px solid #ddd6c8",
          }}>
            <input
              autoFocus
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addZone(); if (e.key === "Escape") setShowAddZone(false); }}
              placeholder="Nom de la zone (ex: Chambre froide)"
              style={{
                flex: 1, height: 34, borderRadius: 8, border: "1.5px solid #e5ddd0",
                padding: "4px 12px", fontSize: 13, background: "#fff",
              }}
            />
            <button
              type="button"
              onClick={addZone}
              disabled={addingZone || !newZoneName.trim()}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none",
                background: "#D4775A", color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: "pointer", opacity: addingZone || !newZoneName.trim() ? 0.5 : 1,
              }}
            >
              {addingZone ? "..." : "Ajouter"}
            </button>
            <button
              type="button"
              onClick={() => { setShowAddZone(false); setNewZoneName(""); }}
              style={{
                padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8",
                background: "#fff", fontSize: 12, cursor: "pointer", color: "#999",
              }}
            >Annuler</button>
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
              const count = ingredients.filter(i => i.storage_zone === z.name).length;
              return (
                <div key={z.id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "6px 0", borderBottom: "1px solid #f0ebe2",
                }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{z.name}</span>
                    <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                      {count} ingrédient{count !== 1 ? "s" : ""}
                    </span>
                  </div>
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
              );
            })}
          </div>
        )}

        {/* Zone summary line */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, padding: "0 4px" }}>
          <span style={{ fontSize: 11, color: "#999" }}>
            {zoneSummary.saisis} / {zoneSummary.articles} articles saisis
          </span>
          {zoneSummary.value > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#D4775A" }}>
              {fmtMoney(zoneSummary.value)}
            </span>
          )}
        </div>

        {/* Ingredient list */}
        {zoneIngredients.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 32 }}>
            Aucun article dans cette zone
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {zoneIngredients.map((ing) => {
              const qty = quantities[ing.id];
              const qtyNum = typeof qty === "number" ? qty : 0;
              const hasQty = qtyNum > 0;
              const valeur = hasQty && ing.cost_per_unit != null
                ? qtyNum * ing.cost_per_unit : null;

              return (
                <div
                  key={ing.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 14px", background: hasQty ? "#fff" : "#faf8f4",
                    borderRadius: 8, border: hasQty ? "1px solid #ddd6c8" : "1px solid transparent",
                    transition: "all 0.15s",
                  }}
                >
                  {/* Name + category */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13, fontWeight: hasQty ? 700 : 500,
                      color: hasQty ? "#1a1a1a" : "#666",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                      {ing.name}
                    </div>
                    <div style={{ fontSize: 10, color: "#999", marginTop: 1 }}>
                      {CAT_LABELS[ing.category as Category] ?? ing.category}
                      {ing.default_unit ? ` · ${ing.default_unit}` : ""}
                    </div>
                  </div>

                  {/* Value */}
                  {valeur != null && (
                    <span style={{ fontSize: 11, color: "#999", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                      {fmtMoney(valeur)}
                    </span>
                  )}

                  {/* Qty input */}
                  {readOnly ? (
                    <span style={{
                      fontSize: 15, fontWeight: 700, color: hasQty ? "#D4775A" : "#ccc",
                      minWidth: 50, textAlign: "right", flexShrink: 0,
                    }}>
                      {hasQty ? qtyNum : "-"}
                    </span>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={qty ?? ""}
                      onChange={(e) => handleQtyChange(ing.id, e.target.value)}
                      placeholder="0"
                      style={{
                        width: 70, height: 36, borderRadius: 8,
                        border: hasQty ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
                        padding: "0 8px", fontSize: 14, fontWeight: 600,
                        textAlign: "right", background: "#fff", outline: "none",
                        color: hasQty ? "#D4775A" : "#1a1a1a",
                        flexShrink: 0,
                      }}
                    />
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
