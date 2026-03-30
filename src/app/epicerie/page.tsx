"use client";

import { useState, useEffect, useMemo } from "react";

import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { CATEGORIES, CAT_COLORS, CAT_LABELS, type Category } from "@/types/ingredients";
import { offerRowToCpu } from "@/lib/offerPricing";

type Ingredient = {
  id: string;
  name: string;
  category: Category;
  cost_per_unit: number | null;
  piece_weight_g: number | null;
  piece_volume_ml: number | null;
  default_unit: string | null;
};

type Supplier = { id: string; name: string };

type CalcLine = {
  id: string;
  name: string;
  category: Category;
  cpu: number;
  cpuUnit: "g" | "ml" | "pc";
  pieceQty: number;
  saleMode: "pc" | "kg" | "L";
  coeff: number;
  tva: number;
  costPiece: number;
  priceHT: number;
  priceTTC: number;
  priceRounded: number;
  margin: number;
  pieceQtyOverride: number | null;
};


const TVA_OPTIONS = [5.5, 10, 20];
const ROUND_OPTIONS = [0.05, 0.10, 0.50, 1.0];

function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function computeLine(line: Omit<CalcLine, "costPiece" | "priceHT" | "priceTTC" | "priceRounded" | "margin">): CalcLine {
  const qty = line.pieceQtyOverride ?? line.pieceQty;
  const costPiece = line.cpuUnit === "pc" ? line.cpu : line.cpu * qty;
  const priceHT = costPiece * line.coeff;
  const priceTTC = priceHT * (1 + line.tva / 100);
  return { ...line, costPiece, priceHT, priceTTC, priceRounded: 0, margin: priceHT > 0 ? ((priceHT - costPiece) / priceHT) * 100 : 0 };
}

function applyRound(lines: CalcLine[], roundStep: number): CalcLine[] {
  return lines.map(l => ({ ...l, priceRounded: roundTo(l.priceTTC, roundStep) }));
}

function StepInput({ value, onChange, step = 0.1, min = 0.1, decimals = 1 }: { value: number; onChange: (v: number) => void; step?: number; min?: number; decimals?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <button onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))}
        style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #ddd6c8", background: "#f9f9f9", cursor: "pointer", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
      <span style={{ minWidth: 36, textAlign: "center", fontWeight: 700, fontSize: 13 }}>{value.toFixed(decimals)}</span>
      <button onClick={() => onChange(Math.round((value + step) * 100) / 100)}
        style={{ width: 24, height: 24, borderRadius: 4, border: "1px solid #ddd6c8", background: "#f9f9f9", cursor: "pointer", fontWeight: 900, fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
    </div>
  );
}

export default function EpiceriePage() {
  const { current: etab } = useEtablissement();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [offers, setOffers] = useState<Record<string, string>>({});
  const [offerCpu, setOfferCpu] = useState<Record<string, { cpu: number; cpuUnit: "g" | "ml" | "pc"; pieceWeightG: number | null }>>({});
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [filterSupplier, setFilterSupplier] = useState("all");
  const [filterCat, setFilterCat] = useState<"all" | Category>("all");

  const [globalCoeff, setGlobalCoeff] = useState(3.5);
  const [globalTva, setGlobalTva] = useState(5.5);
  const [roundStep, setRoundStep] = useState(0.10);
  const [lines, setLines] = useState<CalcLine[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      let ingQ = supabase.from("ingredients").select("id,name,category,cost_per_unit,piece_weight_g,piece_volume_ml,default_unit").eq("is_active", true);
      let supQ = supabase.from("suppliers").select("id,name").eq("is_active", true);
      if (etab) {
        ingQ = ingQ.eq("etablissement_id", etab.id);
        supQ = supQ.eq("etablissement_id", etab.id);
      }
      const [{ data: ings }, { data: sups }] = await Promise.all([
        ingQ.order("name"),
        supQ.order("name"),
      ]);
      // Fetch offers for the filtered ingredients only (v_latest_offers has no etablissement_id column)
      const ingIds = (ings ?? []).map((i: { id: string }) => i.id);
      let offs: Record<string, unknown>[] = [];
      if (ingIds.length > 0) {
        const { data } = await supabase.from("v_latest_offers")
          .select("ingredient_id,supplier_id,unit,unit_price,pack_price,pack_total_qty,pack_unit,pack_count,pack_each_qty,pack_each_unit,density_kg_per_l,piece_weight_g")
          .in("ingredient_id", ingIds);
        offs = (data ?? []) as Record<string, unknown>[];
      }
      setIngredients((ings ?? []) as Ingredient[]);
      // Deduplicate suppliers by normalized name
      const seen = new Map<string, Supplier>();
      for (const s of (sups ?? []) as Supplier[]) {
        const key = (s.name ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        if (!seen.has(key)) seen.set(key, s);
      }
      setSuppliers(Array.from(seen.values()));
      const supMap = new Map((sups ?? []).map((s: Supplier) => [s.id, s.name]));
      const offMap: Record<string, string> = {};
      const cpuMap: Record<string, { cpu: number; cpuUnit: "g" | "ml" | "pc"; pieceWeightG: number | null }> = {};
      for (const o of (offs ?? []) as Record<string, unknown>[]) {
        const iid = String(o.ingredient_id ?? "");
        offMap[iid] = supMap.get(String(o.supplier_id ?? "")) ?? "—";
        const cpu = offerRowToCpu(o);
        if (cpu.g && cpu.g > 0) cpuMap[iid] = { cpu: cpu.g, cpuUnit: "g", pieceWeightG: o.piece_weight_g as number | null };
        else if (cpu.ml && cpu.ml > 0) cpuMap[iid] = { cpu: cpu.ml, cpuUnit: "ml", pieceWeightG: null };
        else if (cpu.pcs && cpu.pcs > 0) cpuMap[iid] = { cpu: cpu.pcs, cpuUnit: "pc", pieceWeightG: null };
      }
      setOffers(offMap);
      setOfferCpu(cpuMap);
      setLoading(false);
    }
    load();
  }, [etab]);

  const filtered = useMemo(() => ingredients.filter(x => {
    if (filterCat !== "all" && x.category !== filterCat) return false;
    if (filterSupplier !== "all") {
      const supName = offers[x.id];
      const wantedName = suppliers.find(s => s.id === filterSupplier)?.name;
      if (!supName || supName !== wantedName) return false;
    }
    if (search && !x.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [ingredients, filterCat, filterSupplier, search, offers, suppliers]);

  function addToCalc(ing: Ingredient) {
    if (lines.find(l => l.id === ing.id)) return;
    const offerData = offerCpu[ing.id];
    const cpu = offerData?.cpu ?? ing.cost_per_unit ?? 0;
    let cpuUnit: "g" | "ml" | "pc" = offerData?.cpuUnit ?? "pc";
    let pieceQty = 1;
    let saleMode: "pc" | "kg" | "L" = "pc";
    if (ing.piece_weight_g) { cpuUnit = "g"; pieceQty = ing.piece_weight_g; }
    else if (offerData?.pieceWeightG) { cpuUnit = "g"; pieceQty = offerData.pieceWeightG; }
    else if (ing.piece_volume_ml) { cpuUnit = "ml"; pieceQty = ing.piece_volume_ml; }
    else if (cpuUnit === "g") { pieceQty = 1000; saleMode = "kg"; }
    else if (cpuUnit === "ml") { pieceQty = 1000; saleMode = "L"; }
    const base = { id: ing.id, name: ing.name, category: ing.category, cpu, cpuUnit, pieceQty, saleMode, coeff: globalCoeff, tva: globalTva, pieceQtyOverride: null };
    setLines(prev => applyRound([...prev, computeLine(base)], roundStep));
  }

  function updateLine(id: string, patch: Partial<CalcLine>) {
    setLines(prev => applyRound(prev.map(l => l.id === id ? computeLine({ ...l, ...patch }) : l), roundStep));
  }

  function removeLine(id: string) { setLines(prev => prev.filter(l => l.id !== id)); }

  function applyGlobalCoeff() { setLines(prev => applyRound(prev.map(l => computeLine({ ...l, coeff: globalCoeff })), roundStep)); }
  function applyGlobalTva() { setLines(prev => applyRound(prev.map(l => computeLine({ ...l, tva: globalTva })), roundStep)); }

  function exportCsv() {
    const rows = [["Nom", "Coût achat", "Coeff", "Prix HT", "TVA %", "Prix TTC", "Prix arrondi", "Marge %"]];
    for (const l of lines) rows.push([l.name, l.costPiece.toFixed(4), l.coeff.toString(), l.priceHT.toFixed(2), l.tva.toString(), l.priceTTC.toFixed(2), l.priceRounded.toFixed(2), l.margin.toFixed(1) + "%"]);
    const csv = rows.map(r => r.join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `epicerie-prix-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
  }

  function copyPrices() {
    const text = lines.map(l => `${l.name}\t${l.priceRounded.toFixed(2)}`).join("\n");
    navigator.clipboard.writeText(text);
  }

  const card = { background: "#fff", border: "1px solid #E8E0D0", borderRadius: 12, padding: 16 };
  const btnPrimary = { padding: "7px 16px", borderRadius: 8, background: "#D4775A", color: "#fff", fontWeight: 800, fontSize: 13, border: "none", cursor: "pointer" as const };
  const btnSecondary = { padding: "7px 16px", borderRadius: 8, background: "transparent", color: "#D4775A", fontWeight: 800, fontSize: 13, border: "1px solid #D4775A", cursor: "pointer" as const };
  const btnGhost = (active?: boolean) => ({ padding: "5px 12px", borderRadius: 8, background: active ? "#D4775A" : "transparent", color: active ? "#fff" : "#6B6257", fontWeight: 700, fontSize: 12, border: "1px solid #ddd6c8", cursor: "pointer" as const });
  const sel = { padding: "7px 10px", borderRadius: 8, border: "1px solid #E8E0D0", fontSize: 13, background: "#fff", color: "#1A1A1A" };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
    <>
    <main style={{ minHeight: "100vh", background: "#FAF7F2", padding: 16, fontFamily: "inherit", overflowX: "hidden" as const, maxWidth: "100vw", position: "relative", boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", width: "100%" }}>

        <div style={{ marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#1A1A1A" }}>Production</h1>
        </div>

        <div className="epicerie-grid">

          {/* CATALOGUE */}
          <div className="md:sticky md:top-4" style={{ ...card, maxWidth: "100%", overflow: "hidden" }}>
            <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12, color: "#D4775A", letterSpacing: 0.5, textTransform: "uppercase" }}>Catalogue</div>

            <input placeholder="Rechercher…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #E8E0D0", fontSize: 13, marginBottom: 8, boxSizing: "border-box" as const, background: "#FAF7F2" }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
              <select style={{ ...sel, width: "100%" }} value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
                <option value="all">Tous fournisseurs</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <select style={{ ...sel, width: "100%" }} value={filterCat} onChange={e => setFilterCat(e.target.value as "all" | Category)}>
                <option value="all">Toutes catégories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
            </div>

            {loading ? <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: 20 }}>Chargement…</div> : (
              <div style={{ maxHeight: "clamp(240px, calc(100vh - 300px), 600px)", overflowY: "auto" }}>
                {filtered.length === 0 && <div style={{ color: "#9CA3AF", fontSize: 13, textAlign: "center", padding: 20 }}>Aucun produit</div>}
                {filtered.map(ing => {
                  const inCalc = lines.some(l => l.id === ing.id);
                  const offerData = offerCpu[ing.id];
                  const cpu = offerData?.cpu ?? ing.cost_per_unit;
                  const hasPrice = cpu && cpu > 0;
                  const sup = offers[ing.id];
                  const priceDisplay = !hasPrice ? null
                    : offerData?.cpuUnit === "pc" ? cpu!.toFixed(2) + " €/pc"
                    : offerData?.cpuUnit === "ml" ? (cpu! * 1000).toFixed(2) + " €/L"
                    : (cpu! * 1000).toFixed(2) + " €/kg";
                  return (
                    <div key={ing.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 10px", borderRadius: 8, marginBottom: 3, background: inCalc ? "#FEF3E8" : "#FAF7F2", border: `1px solid ${inCalc ? "#FBBF24" : "#F0EBE0"}` }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 12, color: CAT_COLORS[ing.category], whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ing.name}</div>
                        <div style={{ fontSize: 11, color: "#9B8E7E" }}>
                          {hasPrice ? priceDisplay : <span style={{ color: "#DC2626" }}>prix manquant</span>}
                          {sup ? ` · ${sup}` : ""}
                        </div>
                      </div>
                      <button onClick={() => addToCalc(ing)} disabled={inCalc || !hasPrice}
                        style={{ marginLeft: 8, width: 26, height: 26, borderRadius: 6, border: "none", background: inCalc ? "#FBBF24" : hasPrice ? "#D4775A" : "#E5E7EB", color: inCalc ? "#fff" : hasPrice ? "#fff" : "#9CA3AF", fontWeight: 900, fontSize: 15, cursor: inCalc || !hasPrice ? "default" : "pointer" }}>
                        {inCalc ? "✓" : "+"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* CALCULATEUR */}
          <div style={{ maxWidth: "100%", overflow: "hidden", minWidth: 0 }}>
            {/* Réglages globaux */}
            <div style={{ ...card, marginBottom: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 12, color: "#D4775A", letterSpacing: 0.5, textTransform: "uppercase" }}>Réglages globaux</div>
              <div style={{ display: "grid", gap: 12 }}>
                {/* Ligne 1 : Coeff · TVA · Arrondi */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9B8E7E", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Coefficient</div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <StepInput value={globalCoeff} onChange={setGlobalCoeff} step={0.1} min={1} decimals={1} />
                      <button onClick={applyGlobalCoeff} style={btnPrimary}>Appliquer</button>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9B8E7E", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>TVA</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                      {TVA_OPTIONS.map(t => <button key={t} onClick={() => setGlobalTva(t)} style={btnGhost(globalTva === t)}>{t}%</button>)}
                      <button onClick={applyGlobalTva} style={btnPrimary}>Appliquer</button>
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#9B8E7E", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Arrondi</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {ROUND_OPTIONS.map(r => <button key={r} onClick={() => { setRoundStep(r); setLines(prev => applyRound(prev, r)); }} style={btnGhost(roundStep === r)}>{r === 1 ? "1€" : r + "€"}</button>)}
                    </div>
                  </div>
                </div>
                {/* Ligne 2 : Actions (toujours sur leur propre ligne) */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button onClick={() => setLines([])} disabled={lines.length === 0} style={{ ...btnSecondary, borderColor: "#DC2626", color: "#DC2626", opacity: lines.length === 0 ? 0.4 : 1 }}>🗑 Effacer</button>
                  <button onClick={copyPrices} disabled={lines.length === 0} style={{ ...btnSecondary, opacity: lines.length === 0 ? 0.4 : 1 }}>📋 Copier</button>
                  <button onClick={exportCsv} disabled={lines.length === 0} style={{ ...btnPrimary, opacity: lines.length === 0 ? 0.4 : 1 }}>⬇ CSV</button>
                </div>
              </div>
            </div>

            {lines.length === 0 ? (
              <div style={{ ...card, border: "2px dashed #E8E0D0", textAlign: "center", padding: 48, color: "#C4B8A8" }}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>←</div>
                <div style={{ fontWeight: 700 }}>Ajoutez des produits depuis le catalogue</div>
              </div>
            ) : (
              <div style={{ ...card, padding: 0, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: "#FAF7F2", borderBottom: "2px solid #E8E0D0" }}>
                        {["Produit", "Qté/pièce", "Mode", "Coût achat", "Coeff", "TVA", "Prix HT", "Prix TTC", "Arrondi", "Marge", ""].map((h, i) => (
                          <th key={i} style={{ padding: "10px 10px", textAlign: i === 0 ? "left" : "right", fontWeight: 800, color: "#6B6257", fontSize: 10, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {lines.map((l, i) => (
                        <tr key={l.id} style={{ borderBottom: "1px solid #F0EBE0", background: i % 2 === 0 ? "#fff" : "#FDFCFA" }}>
                          <td style={{ padding: "8px 10px", maxWidth: 200 }}>
                            <div style={{ fontWeight: 800, color: CAT_COLORS[l.category], fontSize: 11, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</div>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <input type="number" min="0" step="1" value={l.pieceQtyOverride ?? l.pieceQty}
                              onChange={e => updateLine(l.id, { pieceQtyOverride: parseFloat(e.target.value) || 1 })}
                              style={{ width: 60, padding: "3px 6px", borderRadius: 6, border: "1px solid #E8E0D0", fontSize: 12, textAlign: "right" }} />
                            <span style={{ fontSize: 10, color: "#9B8E7E", marginLeft: 2 }}>{l.cpuUnit}</span>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <select value={l.saleMode} onChange={e => updateLine(l.id, { saleMode: e.target.value as "pc" | "kg" | "L" })}
                              style={{ padding: "3px 6px", borderRadius: 6, border: "1px solid #E8E0D0", fontSize: 11, background: "#fff" }}>
                              <option value="pc">pc</option>
                              <option value="kg">kg</option>
                              <option value="L">L</option>
                            </select>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right", color: "#6B6257", fontWeight: 600 }}>{l.costPiece.toFixed(3)} €</td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <StepInput value={l.coeff} onChange={v => updateLine(l.id, { coeff: v })} step={0.1} min={1} decimals={1} />
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <select value={l.tva} onChange={e => updateLine(l.id, { tva: parseFloat(e.target.value) })}
                              style={{ padding: "3px 6px", borderRadius: 6, border: "1px solid #E8E0D0", fontSize: 11, background: "#fff" }}>
                              {TVA_OPTIONS.map(t => <option key={t} value={t}>{t}%</option>)}
                            </select>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right", color: "#6B6257" }}>{l.priceHT.toFixed(2)} €</td>
                          <td style={{ padding: "4px 10px", textAlign: "right", color: "#374151" }}>{l.priceTTC.toFixed(2)} €</td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <span style={{ fontWeight: 900, fontSize: 14, color: "#D4775A" }}>{l.priceRounded.toFixed(2)} €</span>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "right" }}>
                            <span style={{ fontWeight: 800, fontSize: 12, color: l.margin >= 60 ? "#166534" : l.margin >= 40 ? "#D97706" : "#DC2626" }}>{l.margin.toFixed(1)}%</span>
                          </td>
                          <td style={{ padding: "4px 10px", textAlign: "center" }}>
                            <button onClick={() => removeLine(l.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#C4B8A8", fontSize: 16, fontWeight: 900 }}>×</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div style={{ padding: "10px 16px", borderTop: "1px solid #E8E0D0", background: "#FAF7F2", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9B8E7E" }}>
                  <span>{lines.length} produit{lines.length > 1 ? "s" : ""}</span>
                  <span>Marge moy. : <strong style={{ color: "#D4775A" }}>{(lines.reduce((a, l) => a + l.margin, 0) / lines.length).toFixed(1)}%</strong></span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
    </>
    </RequireRole>
  );
}
