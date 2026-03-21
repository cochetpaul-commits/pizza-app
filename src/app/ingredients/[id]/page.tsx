"use client";

import { Suspense, useState, useEffect, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { StepperInput } from "@/components/StepperInput";
import { compressImage } from "@/lib/compressImage";
import { computeDerivedPrice, computeRendement } from "@/lib/rendement";
import { CAT_COLORS } from "@/types/ingredients";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

type Ingredient = {
  id: string; name: string; category: string;
  allergens: string | null; status: string | null; status_note: string | null;
  supplier_id: string | null; establishments: string[] | null;
  unit?: string | null;
  order_unit_label?: string | null;
  storage_zone?: string | null;
  parent_ingredient_id?: string | null;
  rendement?: number | null;
  is_derived?: boolean;
  cost_per_unit?: number | null;
};


type DerivedIngredient = {
  id: string;
  name: string;
  rendement: number | null;
  cost_per_unit: number | null;
};

type ParentInfo = {
  id: string;
  name: string;
  cost_per_unit: number | null;
};

type Offer = {
  id: string;
  supplier_id: string;
  supplier_name: string;
  unit: string;
  unit_price: number;
  supplier_label: string | null;
  is_active: boolean;
  created_at: string;
  establishment: string | null;
  price_kind: string | null;
};

// Colors for suppliers in the chart
const LINE_COLORS = ["#8B1A1A", "#1E40AF", "#5C7A4E", "#7C3AED", "#92400E", "#EA580C"];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtPrice(v: number, unit: string) {
  return `${v.toFixed(2)} €/${unit}`;
}

function IngredientDetailInner() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const fromVariations = searchParams.get("from") === "variations-prix";
  const { current: etab } = useEtablissement();

  const [ingredient, setIngredient] = useState<Ingredient | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Photo upload
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!id) return;
    const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ingredients/${id}.jpg`;
    setPhotoUrl(url);
    setPhotoError(false);
  }, [id]);

  async function handlePhotoUpload(file: File) {
    if (!id) return;
    setUploading(true);
    try {
      const compressed = await compressImage(file, 200, 0.8);
      const { error: upErr } = await supabase.storage
        .from("ingredients")
        .upload(`${id}.jpg`, compressed, { upsert: true, contentType: "image/jpeg" });
      if (upErr) throw upErr;
      setPhotoUrl(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ingredients/${id}.jpg?t=${Date.now()}`);
      setPhotoError(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  }

  // Derived ingredients
  // Order unit editing
  const [orderUnit, setOrderUnit] = useState("");
  const [orderUnitSaved, setOrderUnitSaved] = useState(false);
  // Storage zone
  const [storageZone, setStorageZone] = useState<string>("");
  const [storageZoneSaved, setStorageZoneSaved] = useState(false);
  const [storageZoneOptions, setStorageZoneOptions] = useState<{ id: string; name: string }[]>([]);

  const [derivedList, setDerivedList] = useState<DerivedIngredient[]>([]);
  const [parentInfo, setParentInfo] = useState<ParentInfo | null>(null);
  const [showDerivePanel, setShowDerivePanel] = useState(false);
  const [deriveName, setDeriveName] = useState("");
  const [poidsBrut, setPoidsBrut] = useState<number | "">(1);
  const [poidsNet, setPoidsNet] = useState<number | "">(0.5);
  const [deriveSaving, setDeriveSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Non connecté");

        const ingQuery = supabase.from("ingredients").select("*").eq("id", id).eq("user_id", user.id);
        if (etab) ingQuery.or(`etablissement_id.eq.${etab.id},etablissement_id.is.null`);

        const offQuery = supabase.from("supplier_offers")
          .select("id, supplier_id, unit, unit_price, supplier_label, is_active, created_at, establishment, price_kind")
          .eq("ingredient_id", id)
          .eq("user_id", user.id)
          .not("unit_price", "is", null)
          .order("created_at", { ascending: true });
        if (etab) offQuery.or(`etablissement_id.eq.${etab.id},etablissement_id.is.null`);

        const [{ data: ing, error: e1 }, { data: offerData, error: e2 }] = await Promise.all([
          ingQuery.single(),
          offQuery,
        ]);

        if (e1) throw new Error(e1.message);
        if (e2) throw new Error(e2.message);
        const ingTyped = ing as Ingredient;
        setIngredient(ingTyped);
        setOrderUnit(ingTyped.order_unit_label ?? "");
        setStorageZone(ingTyped.storage_zone ?? "");

        // Fetch supplier names
        const supplierIds = [...new Set((offerData ?? []).map((o: { supplier_id: string }) => o.supplier_id))];
        const supMap: Record<string, string> = {};
        if (supplierIds.length > 0) {
          const { data: suppliers } = await supabase.from("suppliers").select("id, name").in("id", supplierIds);
          for (const s of suppliers ?? []) supMap[s.id] = s.name;
        }

        const enriched: Offer[] = (offerData ?? []).map((o: Omit<Offer, "supplier_name">) => ({
          ...o,
          supplier_name: supMap[o.supplier_id] ?? "—",
        }));
        setOffers(enriched);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    };
    run();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, etab?.id]);

  // Load storage zones
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("storage_zones").select("id, name").order("display_order").order("name");
      setStorageZoneOptions((data ?? []) as { id: string; name: string }[]);
    })();
  }, []);

  // Load derived ingredients + parent info
  useEffect(() => {
    if (!id || !ingredient) return;
    const loadRelations = async () => {
      // Load children (derived from this ingredient)
      const { data: children } = await supabase
        .from("ingredients")
        .select("id, name, rendement, cost_per_unit")
        .eq("parent_ingredient_id", id)
        .eq("is_derived", true);
      setDerivedList((children ?? []) as DerivedIngredient[]);

      // Load parent info if this is a derived ingredient
      if (ingredient.parent_ingredient_id) {
        const { data: parent } = await supabase
          .from("ingredients")
          .select("id, name, cost_per_unit")
          .eq("id", ingredient.parent_ingredient_id)
          .single();
        setParentInfo(parent as ParentInfo | null);
      }
    };
    loadRelations();
  }, [id, ingredient?.parent_ingredient_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Suppliers with at least one offer
  const supplierList = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of offers) map.set(o.supplier_id, o.supplier_name);
    return [...map.entries()];
  }, [offers]);

  // Chart data: unified timeline per date, one key per supplier_id
  const chartData = useMemo(() => {
    // Group offers by date (YYYY-MM-DD) per supplier — take the last price per day
    const byDateBySupplier = new Map<string, Map<string, number>>();
    for (const o of offers) {
      const day = o.created_at.slice(0, 10);
      if (!byDateBySupplier.has(day)) byDateBySupplier.set(day, new Map());
      byDateBySupplier.get(day)!.set(o.supplier_id, o.unit_price);
    }
    const sortedDates = [...byDateBySupplier.keys()].sort();
    // Forward-fill: carry the last known price for each supplier
    const lastPrice = new Map<string, number>();
    return sortedDates.map(day => {
      const dayMap = byDateBySupplier.get(day)!;
      // Update last known prices
      for (const [supId, price] of dayMap) lastPrice.set(supId, price);
      const point: Record<string, string | number> = { date: fmtDate(day) };
      for (const [supId] of supplierList) {
        const p = dayMap.get(supId);
        if (p !== undefined) point[supId] = p;
        // Only show actual data points (no fill — gaps show as line breaks)
      }
      return point;
    });
  }, [offers, supplierList]);

  // Best current price per unit
  const bestOffers = useMemo(() => {
    const activeByUnit = new Map<string, Offer[]>();
    for (const o of offers.filter(o => o.is_active)) {
      const list = activeByUnit.get(o.unit) ?? [];
      list.push(o);
      activeByUnit.set(o.unit, list);
    }
    const result: Array<{ unit: string; best: Offer; others: Offer[] }> = [];
    for (const [unit, list] of activeByUnit) {
      const sorted = [...list].sort((a, b) => a.unit_price - b.unit_price);
      result.push({ unit, best: sorted[0], others: sorted.slice(1) });
    }
    return result;
  }, [offers]);

  // Recent history (last 20 entries, newest first)
  const recentHistory = useMemo(() => [...offers].reverse().slice(0, 20), [offers]);

  if (loading) return (
    <main className="container"><div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div></main>
  );

  if (error || !ingredient) return (
    <main className="container">
      <div className="errorBox">{error ?? "Ingredient introuvable"}</div>
    </main>
  );

  return (
    <>
      <main className="container safe-bottom">

        {/* ── Header ── */}
        {fromVariations && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <Link href="/variations-prix" className="btn">Variations prix</Link>
          </div>
        )}
        <div style={{ marginBottom: 20, display: "flex", gap: 16, alignItems: "flex-start" }}>
          {/* Photo — label+input pour compatibilité iOS Safari */}
          <label
            htmlFor="ingredient-photo-input"
            style={{
              width: 64, height: 64, borderRadius: "50%", flexShrink: 0,
              overflow: "hidden", cursor: "pointer", position: "relative",
              border: `2px solid ${CAT_COLORS[ingredient.category as keyof typeof CAT_COLORS] ?? "#ddd6c8"}`,
              background: `${CAT_COLORS[ingredient.category as keyof typeof CAT_COLORS] ?? "#999"}22`,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {photoUrl && !photoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt={ingredient.name}
                width={64}
                height={64}
                style={{ objectFit: "cover", width: 64, height: 64 }}
                onError={() => setPhotoError(true)}
              />
            ) : (
              <span style={{
                fontFamily: "Oswald, sans-serif", fontWeight: 700,
                fontSize: 20, color: CAT_COLORS[ingredient.category as keyof typeof CAT_COLORS] ?? "#999",
              }}>
                {ingredient.name.trim().split(/\s+/).length >= 2
                  ? `${ingredient.name.trim().split(/\s+/)[0][0]}${ingredient.name.trim().split(/\s+/)[1][0]}`.toUpperCase()
                  : ingredient.name.trim().slice(0, 2).toUpperCase()}
              </span>
            )}
            {/* Overlay upload */}
            <div style={{
              position: "absolute", inset: 0, borderRadius: "50%",
              background: uploading ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}>
              <span style={{ color: "#fff", fontSize: uploading ? 10 : 16, fontWeight: 700 }}>
                {uploading ? "..." : "📷"}
              </span>
            </div>
          </label>
          <input
            id="ingredient-photo-input"
            ref={fileRef}
            type="file"
            accept="image/*"
            style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handlePhotoUpload(f);
              e.target.value = "";
            }}
          />

          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 className="h1" style={{ marginBottom: 4 }}>{ingredient.name}</h1>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, opacity: 0.65 }}>{ingredient.category}</span>
            {ingredient.is_derived && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                background: "rgba(124,58,237,0.10)", color: "#7C3AED",
                border: "1px solid rgba(124,58,237,0.25)",
              }}>
                DÉRIVÉ
              </span>
            )}
            {ingredient.status && ingredient.status !== "ok" && (
              <span style={{
                fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8,
                background: ingredient.status === "to_check" ? "rgba(234,88,12,0.12)" : "rgba(22,163,74,0.10)",
                color: ingredient.status === "to_check" ? "#EA580C" : "#16A34A",
                border: `1px solid ${ingredient.status === "to_check" ? "rgba(234,88,12,0.3)" : "rgba(22,163,74,0.3)"}`,
              }}>
                {ingredient.status === "to_check" ? "À vérifier" : ingredient.status}
              </span>
            )}
            {ingredient.allergens && (
              <span style={{ fontSize: 11, opacity: 0.55 }}>Allergènes: {ingredient.allergens}</span>
            )}
          </div>
          </div>
        </div>

        {/* ── Unité de commande ── */}
        <div className="card" style={{ marginBottom: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.65, whiteSpace: "nowrap" }}>Unité de commande</span>
          <input
            type="text"
            value={orderUnit}
            onChange={(e) => { setOrderUnit(e.target.value); setOrderUnitSaved(false); }}
            onBlur={async () => {
              const val = orderUnit.trim() || null;
              await supabase.from("ingredients").update({ order_unit_label: val }).eq("id", id);
              setOrderUnitSaved(true);
              setTimeout(() => setOrderUnitSaved(false), 2000);
            }}
            placeholder="ex: pcs, carton de 6, seau 5kg…"
            style={{
              flex: 1, height: 32, borderRadius: 8,
              border: "1.5px solid #e5ddd0", padding: "4px 10px",
              fontSize: 13, background: "#fff",
            }}
          />
          {orderUnitSaved && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Enregistre</span>}
        </div>

        {/* ── Lieu de stockage ── */}
        <div className="card" style={{ marginBottom: 12, padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.65, whiteSpace: "nowrap" }}>Stockage</span>
          <select
            value={storageZone}
            onChange={async (e) => {
              const val = e.target.value || null;
              setStorageZone(e.target.value);
              await supabase.from("ingredients").update({ storage_zone: val }).eq("id", id);
              setStorageZoneSaved(true);
              setTimeout(() => setStorageZoneSaved(false), 2000);
            }}
            style={{
              flex: 1, height: 32, borderRadius: 8,
              border: "1.5px solid #e5ddd0", padding: "4px 10px",
              fontSize: 13, background: "#fff", cursor: "pointer",
            }}
          >
            <option value="">— Aucun —</option>
            {storageZoneOptions.map(z => (
              <option key={z.id} value={z.name}>{z.name}</option>
            ))}
          </select>
          {storageZoneSaved && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600 }}>Enregistre</span>}
        </div>

        {/* ── Meilleur prix ── */}
        {bestOffers.length > 0 && (
          <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 10 }}>Prix actuel</div>
            {bestOffers.map(({ unit, best, others }) => (
              <div key={unit} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>{best.supplier_name}</span>
                  <span style={{ fontSize: 20, fontWeight: 900, color: "#16A34A" }}>
                    {fmtPrice(best.unit_price, unit)}
                  </span>
                </div>
                {others.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {others.map((o, i) => (
                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, padding: "3px 0" }}>
                        <span style={{ fontSize: 12, opacity: 0.6 }}>{o.supplier_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)" }}>
                          {fmtPrice(o.unit_price, unit)}
                          <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 4, color: "#DC2626" }}>
                            +{(((o.unit_price - best.unit_price) / best.unit_price) * 100).toFixed(1)} %
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Chart ── */}
        {chartData.length >= 2 && supplierList.length > 0 && (
          <div className="card" style={{ marginBottom: 12, padding: "14px 16px" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 14 }}>Évolution des prix</div>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.07)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ borderRadius: 10, border: "1px solid rgba(217,199,182,0.95)", background: "#FAF7F2", fontSize: 12 }}
                  formatter={(value: unknown, name: unknown) => {
                    const supName = supplierList.find(([id]) => id === name)?.[1] ?? String(name);
                    return [`${Number(value).toFixed(2)} €`, supName];
                  }}
                />
                {supplierList.length > 1 && <Legend formatter={(value) => supplierList.find(([id]) => id === value)?.[1] ?? value} wrapperStyle={{ fontSize: 11 }} />}
                {supplierList.map(([supId], idx) => (
                  <Line
                    key={supId}
                    type="monotone"
                    dataKey={supId}
                    stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* ── Historique table ── */}
        {recentHistory.length > 0 && (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>
              Historique des offres
              <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.55, marginLeft: 6 }}>({offers.length} entrées)</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(217,199,182,0.7)" }}>
                    <th style={{ textAlign: "left", padding: "4px 8px 8px 0", fontWeight: 700, opacity: 0.6 }}>Date</th>
                    <th style={{ textAlign: "left", padding: "4px 8px 8px", fontWeight: 700, opacity: 0.6 }}>Fournisseur</th>
                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Prix</th>
                    <th style={{ textAlign: "right", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Unité</th>
                    <th style={{ textAlign: "center", padding: "4px 0 8px 8px", fontWeight: 700, opacity: 0.6 }}>Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHistory.map((o, i) => (
                    <tr key={o.id ?? i} style={{ borderBottom: "1px solid rgba(217,199,182,0.35)" }}>
                      <td style={{ padding: "6px 8px 6px 0", opacity: 0.75 }}>{fmtDate(o.created_at)}</td>
                      <td style={{ padding: "6px 8px", fontWeight: o.is_active ? 700 : 400 }}>
                        {o.supplier_name}
                        {o.supplier_label ? <span style={{ opacity: 0.55, fontSize: 11, marginLeft: 4 }}>{o.supplier_label}</span> : null}
                      </td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", fontWeight: 800 }}>
                        {o.unit_price.toFixed(2)} €
                      </td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "right", opacity: 0.65 }}>{o.unit}</td>
                      <td style={{ padding: "6px 0 6px 8px", textAlign: "center" }}>
                        {o.is_active ? (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(22,163,74,0.10)", color: "#16A34A", border: "1px solid rgba(22,163,74,0.25)", borderRadius: 6, padding: "1px 6px" }}>Actif</span>
                        ) : (
                          <span style={{ fontSize: 10, opacity: 0.4 }}>Archivé</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {offers.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
            Aucune offre enregistrée pour cet ingrédient.
          </div>
        )}

        {/* ── Ingrédient dérivé — info parent ── */}
        {ingredient.is_derived && parentInfo && (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 12, borderLeft: "4px solid #7C3AED" }}>
            <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 6, color: "#7C3AED" }}>
              Ingrédient dérivé
            </div>
            <div style={{ fontSize: 13 }}>
              <span style={{ opacity: 0.65 }}>Basé sur : </span>
              <Link href={`/ingredients/${parentInfo.id}`} style={{ fontWeight: 700, color: "#1a1a1a" }}>
                {parentInfo.name}
              </Link>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 12 }}>
              <span>
                Rendement : <strong>{ingredient.rendement ? `${(ingredient.rendement * 100).toFixed(1)}%` : "—"}</strong>
              </span>
              <span>
                Prix parent : <strong>{parentInfo.cost_per_unit ? `${parentInfo.cost_per_unit.toFixed(2)} €/kg` : "—"}</strong>
              </span>
              <span>
                Prix calculé : <strong style={{ color: "#7C3AED" }}>
                  {parentInfo.cost_per_unit && ingredient.rendement
                    ? `${computeDerivedPrice(parentInfo.cost_per_unit, ingredient.rendement).toFixed(2)} €/kg`
                    : "—"}
                </strong>
              </span>
            </div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 6 }}>
              Prix mis à jour automatiquement quand le prix parent change
            </div>
          </div>
        )}

        {/* ── Section dérivés (sur un ingrédient parent) ── */}
        {!ingredient.is_derived && (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                Dérivés
                {derivedList.length > 0 && (
                  <span style={{ fontWeight: 400, fontSize: 12, opacity: 0.55, marginLeft: 6 }}>({derivedList.length})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeriveName(`${ingredient.name} cuit`);
                  setPoidsBrut(1);
                  setPoidsNet(0.5);
                  setShowDerivePanel(true);
                }}
                style={{
                  fontSize: 11, fontWeight: 700, color: "#D4775A",
                  background: "rgba(212,119,90,0.08)", border: "1px solid rgba(212,119,90,0.20)",
                  borderRadius: 8, padding: "5px 12px", cursor: "pointer",
                }}
              >
                + Créer un dérivé
              </button>
            </div>

            {derivedList.length === 0 && !showDerivePanel && (
              <p style={{ fontSize: 12, color: "#999", margin: 0 }}>
                Aucun ingrédient dérivé. Créez-en un pour calculer automatiquement le prix après cuisson, épluchage, etc.
              </p>
            )}

            {derivedList.map((d) => (
              <div key={d.id} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "8px 0", borderBottom: "1px solid rgba(217,199,182,0.35)",
              }}>
                <div>
                  <Link href={`/ingredients/${d.id}`} style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                    {d.name}
                  </Link>
                  <span style={{ fontSize: 10, color: "#999", marginLeft: 8 }}>
                    Rendement {d.rendement ? `${(d.rendement * 100).toFixed(1)}%` : "—"}
                  </span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#7C3AED" }}>
                  {d.cost_per_unit ? `${d.cost_per_unit.toFixed(2)} €/kg` : "—"}
                </span>
              </div>
            ))}

            {/* ── Panneau création dérivé ── */}
            {showDerivePanel && (
              <div style={{
                background: "#f2ede4", borderRadius: 16, padding: 20, marginTop: 12,
              }}>
                <div style={{
                  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 14,
                }}>
                  CRÉER UN INGRÉDIENT DÉRIVÉ
                </div>

                <div style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
                  Basé sur : <strong style={{ color: "#1a1a1a" }}>{ingredient.name}</strong>
                  {bestOffers.length > 0 && (
                    <span style={{ marginLeft: 8 }}>
                      Prix brut : <strong style={{ color: "#1a1a1a" }}>{bestOffers[0].best.unit_price.toFixed(2)} €/{bestOffers[0].unit}</strong>
                    </span>
                  )}
                </div>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12, opacity: 0.75, display: "block", marginBottom: 4 }}>Nom du dérivé</label>
                  <input
                    type="text"
                    value={deriveName}
                    onChange={(e) => setDeriveName(e.target.value)}
                    style={{
                      width: "100%", height: 40, borderRadius: 10,
                      border: "1.5px solid #e5ddd0", padding: "8px 12px",
                      fontSize: 13, background: "#fff",
                    }}
                  />
                </div>

                <div style={{ display: "flex", gap: 16, marginBottom: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, opacity: 0.75, display: "block", marginBottom: 4 }}>Poids brut (kg)</label>
                    <StepperInput value={poidsBrut} onChange={setPoidsBrut} step={0.1} min={0.1} placeholder="1.0" />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", paddingTop: 18, fontSize: 18, color: "#999" }}>→</div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, opacity: 0.75, display: "block", marginBottom: 4 }}>Poids après (kg)</label>
                    <StepperInput value={poidsNet} onChange={setPoidsNet} step={0.1} min={0.1} placeholder="0.5" />
                  </div>
                </div>

                {/* Calculs en temps réel */}
                {(() => {
                  const brut = typeof poidsBrut === "number" ? poidsBrut : 0;
                  const net = typeof poidsNet === "number" ? poidsNet : 0;
                  const rend = brut > 0 && net > 0 ? computeRendement(brut, net) : 0;
                  const parentPrice = bestOffers.length > 0 ? bestOffers[0].best.unit_price : (ingredient.cost_per_unit ?? 0);
                  const derivedPrice = rend > 0 ? computeDerivedPrice(parentPrice, rend) : 0;

                  return (
                    <div style={{
                      background: "#fff", borderRadius: 12, padding: "12px 16px",
                      marginBottom: 16, display: "flex", justifyContent: "space-between",
                    }}>
                      <div>
                        <div style={{ fontSize: 11, color: "#999" }}>Rendement calculé</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: rend > 0 ? "#1a1a1a" : "#ccc" }}>
                          {rend > 0 ? `${(rend * 100).toFixed(1)}%` : "—"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#999" }}>Prix dérivé</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: derivedPrice > 0 ? "#7C3AED" : "#ccc" }}>
                          {derivedPrice > 0 ? `${derivedPrice.toFixed(2)} €/kg` : "—"}
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => setShowDerivePanel(false)}
                    style={{
                      padding: "10px 20px", borderRadius: 10,
                      border: "1px solid #ddd6c8", background: "#fff",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    disabled={deriveSaving || !deriveName.trim()}
                    onClick={async () => {
                      if (!deriveName.trim()) return;
                      setDeriveSaving(true);
                      const brut = typeof poidsBrut === "number" ? poidsBrut : 0;
                      const net = typeof poidsNet === "number" ? poidsNet : 0;
                      const rend = brut > 0 && net > 0 ? computeRendement(brut, net) : 0;
                      const parentPrice = bestOffers.length > 0 ? bestOffers[0].best.unit_price : (ingredient.cost_per_unit ?? 0);
                      const derivedPrice = rend > 0 ? computeDerivedPrice(parentPrice, rend) : 0;

                      const { data: newIng, error: createErr } = await supabase
                        .from("ingredients")
                        .insert({
                          name: deriveName.trim(),
                          category: ingredient.category,
                          parent_ingredient_id: ingredient.id,
                          rendement: rend > 0 ? Number(rend.toFixed(4)) : null,
                          is_derived: true,
                          purchase_price: derivedPrice > 0 ? Number(derivedPrice.toFixed(4)) : null,
                          purchase_unit: 1,
                          purchase_unit_label: "kg",
                          status: "validated",
                        })
                        .select("id, name, rendement, cost_per_unit")
                        .single();

                      if (createErr) {
                        alert(createErr.message);
                      } else if (newIng) {
                        setDerivedList((prev) => [...prev, newIng as DerivedIngredient]);
                        setShowDerivePanel(false);
                      }
                      setDeriveSaving(false);
                    }}
                    style={{
                      padding: "10px 20px", borderRadius: 10,
                      border: "none", background: "#D4775A", color: "#fff",
                      fontSize: 13, fontWeight: 700, cursor: "pointer",
                      opacity: deriveSaving || !deriveName.trim() ? 0.5 : 1,
                    }}
                  >
                    {deriveSaving ? "Création…" : "Créer l'ingrédient"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </>
  );
}

export default function IngredientDetailPage() {
  return (
    <Suspense fallback={
      <main className="container">
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Chargement…</div>
      </main>
    }>
      <IngredientDetailInner />
    </Suspense>
  );
}
