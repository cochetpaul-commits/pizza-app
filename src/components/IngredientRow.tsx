import React from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  CAT_COLORS,
  CAT_LABELS,
  type Category,
  type Ingredient,
  type IngredientStatus,
  type LatestOffer,
  type PriceKind,
  type Supplier,
} from "@/types/ingredients";
import {
  fmtVolume,
  legacyHasPrice,
  offerHasPrice,
  fmtQty,
} from "@/lib/offers";
import { formatIngredientPrice } from "@/lib/formatPrice";
import { ALLERGENS, ALLERGEN_SHORT, parseAllergens } from "@/lib/allergens";
import type { PriceAlert } from "@/lib/priceAlerts";

// ─── shared input style helpers ─────────────────────────────────────────────
const inputStyle: CSSProperties = {
  width: "100%", height: 40, borderRadius: 10,
  border: "1.5px solid #e5ddd0", padding: "8px 12px",
  fontSize: 13, background: "#fff", color: "#1a1a1a", outline: "none",
};
const selectStyle: CSSProperties = {
  ...inputStyle,
  appearance: "none", WebkitAppearance: "none" as CSSProperties["WebkitAppearance"],
  paddingRight: 28, cursor: "pointer",
};
const labelStyle: CSSProperties = { fontSize: 12, opacity: 0.75, marginBottom: 6 };

const BTN_ACTION: CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, fontSize: 14,
};

function stBadge(st: IngredientStatus) {
  if (st === "validated") return { bg: "#d1fae5", color: "#065f46", label: "Validé" };
  if (st === "unknown")   return { bg: "rgba(234,88,12,0.10)", color: "#EA580C", label: "Incompris" };
  return { bg: "#fef3c7", color: "#92400e", label: "À contrôler" };
}

// ─── CategoryHeader ─────────────────────────────────────────────────────────
export type CategoryHeaderProps = {
  cat: Category;
  count: number;
  isCollapsed: boolean;
  onToggle: (cat: Category) => void;
};

export const CategoryHeader = React.memo(function CategoryHeader({
  cat, count, isCollapsed, onToggle,
}: CategoryHeaderProps) {
  const accent = CAT_COLORS[cat];
  return (
    <button
      onClick={() => onToggle(cat)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "10px 16px", background: "transparent", border: "none",
        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        marginTop: 16, marginBottom: 6,
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      <span style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
        letterSpacing: "0.18em", textTransform: "uppercase", color: accent,
      }}>{CAT_LABELS[cat]}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 6,
        background: `${accent}18`, color: accent,
      }}>{count}</span>
      <span style={{ marginLeft: "auto", fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
    </button>
  );
});

// ─── Edit state type (kept in sync with page.tsx) ───────────────────────────
export type EditState = {
  name: string; category: Category; is_active: boolean; supplierId: string;
  importName: string;
  useOffer: boolean; priceKind: PriceKind; unit: "kg" | "l" | "pc"; unitPrice: string;
  density: string; pieceWeightG: string; packTotalQty: string; packPrice: string;
  packUnit: "kg" | "l"; packCount: string; packEachQty: string; packEachUnit: "kg" | "l" | "pc";
  packPieceWeightG: string; pieceVolumeMl: string; allergens: string[];
};

// ─── IngredientRow ──────────────────────────────────────────────────────────
export type IngredientRowProps = {
  item: Ingredient;
  offer: LatestOffer | undefined;
  supplierName: string | null;
  supplierIdForDisplay: string | null;
  alert: PriceAlert | undefined;
  isEditing: boolean;
  compactMode: boolean;
  edit: EditState | null;
  suppliers: Supplier[];
  previewEditPack: string;
  onStartEdit: (x: Ingredient) => void;
  onSaveEdit: () => void;
  onDelete: (id: string, name: string) => void;
  onSetStatus: (id: string, next: IngredientStatus) => void;
  onEditChange: (next: EditState) => void;
  onEditImportName: (id: string, current: string) => void;
  onCreateDerived?: (x: Ingredient) => void;
};

export const IngredientRow = React.memo(function IngredientRow({
  item: x, offer, supplierName, supplierIdForDisplay, alert, isEditing, compactMode, edit,
  suppliers, previewEditPack,
  onStartEdit, onSaveEdit, onDelete, onSetStatus, onEditChange, onEditImportName, onCreateDerived,
}: IngredientRowProps) {
  const price = formatIngredientPrice(x, offer ?? null);
  const estab = offer?.establishment ?? "both";
  const estabBadge = estab === "bellomio"
    ? { label: "BM", bg: "#FEF2F2", color: "#D4775A" }
    : estab === "piccola"
    ? { label: "PM", bg: "#F5F3FF", color: "#6B21A8" }
    : { label: "BM·PM", bg: "#F3F4F6", color: "#6B7280" };
  const st = (x.status ?? "to_check") as IngredientStatus;
  const hasPrice = offerHasPrice(offer) || legacyHasPrice(x);
  const canValidate = hasPrice;
  const alg = parseAllergens(x.allergens);
  const sb = stBadge(st);
  const condInfo = offer?.density_kg_per_l != null ? `${fmtQty(offer.density_kg_per_l)} kg/L`
    : offer?.piece_weight_g != null ? `${fmtQty(offer.piece_weight_g)} g/pc`
    : x.piece_volume_ml != null ? fmtVolume(x.piece_volume_ml) + "/pc"
    : x.purchase_unit_name === "l" ? `${x.density_g_per_ml ?? 1} kg/L`
    : x.piece_weight_g ? `${x.piece_weight_g} g/pc` : "—";

  const catAccent = CAT_COLORS[x.category];

  return (
    <div style={{
      background: "#fff", borderRadius: 12, border: "1.5px solid #ddd6c8",
      borderLeft: `3px solid ${catAccent}`,
      marginBottom: 6, overflow: "hidden",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.2s, border-color 0.2s",
    }}
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = catAccent; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#ddd6c8"; e.currentTarget.style.borderLeftColor = catAccent; }}
    >
      {/* ── DESKTOP ROW ── */}
      <div
        className="hidden md:flex"
        style={{ alignItems: "center", padding: "10px 16px", gap: 8, background: "white", transition: "background 0.1s" }}
      >
        {/* Désignation */}
        <div style={{ flex: 3, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: CAT_COLORS[x.category] }}>{x.name}</span>
            {x.is_derived && (
              <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED", border: "1px solid rgba(124,58,237,0.20)" }}>DÉRIVÉ</span>
            )}
            {alert && (
              <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 6, color: alert.direction === "up" ? "#DC2626" : "#16A34A", background: alert.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", border: `1px solid ${alert.direction === "up" ? "rgba(220,38,38,0.30)" : "rgba(22,163,74,0.30)"}` }}>
                {alert.direction === "up" ? "↑" : "↓"} {(Math.abs(alert.change_pct) * 100).toFixed(0)}%
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#999999", marginTop: 1 }}>
            {supplierName || CAT_LABELS[x.category]}
            {x.source_prep_recipe_name ? ` · Pivot: ${x.source_prep_recipe_name}` : ""}
            {x.status_note ? ` · ${x.status_note}` : ""}
            {x.is_derived && x.rendement ? ` · Rendement ${(x.rendement * 100).toFixed(1)}%` : ""}
          </div>
          {alg.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 3 }}>
              {alg.map(a => (
                <span key={a} title={a} style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.20)" }}>
                  {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                </span>
              ))}
            </div>
          )}
          {!hasPrice && <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", display: "inline-block", marginTop: 3 }}>prix manquant</span>}
          {st !== "validated" && (
            <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
              <button onClick={() => onSetStatus(x.id, "to_check")} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #e5ddd0", background: "white", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>À contrôler</button>
              <button disabled={!canValidate} onClick={() => { if (!canValidate) return; onSetStatus(x.id, "validated"); }} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 10, fontWeight: 600, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>
              <button onClick={() => onSetStatus(x.id, "unknown")} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #e5ddd0", background: "white", fontSize: 10, fontWeight: 600, cursor: "pointer" }}>Incompris</button>
            </div>
          )}
        </div>

        {/* Prix */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{price}</span>
        </div>

        {/* Conditionnement */}
        <div style={{ flex: 1, fontSize: 12, color: "#666" }}>{condInfo}</div>

        {/* Statut */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: sb.bg, color: sb.color }}>{sb.label}</span>
        </div>

        {/* Fournisseur */}
        <div style={{ flex: 1, fontSize: 12, color: "#666", display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
          {supplierName && supplierIdForDisplay ? (
            <Link href={`/fournisseurs/${supplierIdForDisplay}`} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>{supplierName}</Link>
          ) : "—"}
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: estabBadge.bg, color: estabBadge.color }}>{estabBadge.label}</span>
        </div>

        {/* Actions */}
        <div style={{ width: 110, display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end" }}>
          {!x.is_derived && onCreateDerived && (
            <button onClick={() => onCreateDerived(x)} title="Créer un dérivé" style={{ ...BTN_ACTION, background: "rgba(124,58,237,0.10)", color: "#7C3AED", fontSize: 12, fontWeight: 700 }}>⚗</button>
          )}
          {!isEditing
            ? <button onClick={() => onStartEdit(x)} title="Modifier" style={{ ...BTN_ACTION, background: "#D4775A", color: "white", fontWeight: 700 }}>→</button>
            : <button onClick={onSaveEdit} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700 }}>OK</button>}
          <button onClick={() => onDelete(x.id, x.name)} title="Supprimer" style={{ ...BTN_ACTION, background: "#ede6d9", color: "#aaa" }}>✕</button>
        </div>
      </div>

      {/* ── MOBILE ROW ── */}
      <div
        className="md:hidden"
        style={{ padding: "12px 14px", background: "white" }}
      >
        {compactMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CAT_COLORS[x.category] }}>{x.name}</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", flexShrink: 0 }}>{price}</span>
            {alert && <span style={{ fontSize: 10, color: alert.direction === "up" ? "#DC2626" : "#16A34A", flexShrink: 0 }}>{alert.direction === "up" ? "↑" : "↓"}</span>}
            {!isEditing
              ? <button onClick={() => onStartEdit(x)} style={{ ...BTN_ACTION, background: "#D4775A", color: "white", fontWeight: 700 }}>→</button>
              : <button onClick={onSaveEdit} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 10, fontWeight: 700 }}>OK</button>}
            <button onClick={() => onDelete(x.id, x.name)} style={{ ...BTN_ACTION, background: "#ede6d9", color: "#aaa" }}>✕</button>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: CAT_COLORS[x.category] }}>{x.name}</span>
                  {x.is_derived && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED" }}>DÉRIVÉ</span>}
                </div>
                <div style={{ fontSize: 10, color: "#999999", marginTop: 2 }}>
                  {supplierName || CAT_LABELS[x.category]}
                  {x.status_note ? ` · ${x.status_note}` : ""}
                  {x.is_derived && x.rendement ? ` · ${(x.rendement * 100).toFixed(1)}%` : ""}
                </div>
                {alg.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 4 }}>
                    {alg.map(a => (
                      <span key={a} style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.18)" }}>
                        {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{price}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: sb.bg, color: sb.color, display: "inline-block", marginTop: 3 }}>{sb.label}</span>
                {alert && <div style={{ fontSize: 10, fontWeight: 800, color: alert.direction === "up" ? "#DC2626" : "#16A34A", marginTop: 2 }}>{alert.direction === "up" ? "↑" : "↓"} {(Math.abs(alert.change_pct) * 100).toFixed(0)}%</div>}
              </div>
            </div>
            {!hasPrice && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 4 }}>prix manquant</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {st !== "validated" && <button onClick={() => { if (!canValidate) return; onSetStatus(x.id, "validated"); }} disabled={!canValidate} style={{ flex: 1, height: 30, borderRadius: 7, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 11, fontWeight: 700, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>}
              {!isEditing
                ? <button onClick={() => onStartEdit(x)} style={{ flex: 1, height: 30, borderRadius: 10, border: "1.5px solid #e5ddd0", background: "#fff", color: "#D4775A", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Modifier</button>
                : <button onClick={onSaveEdit} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>OK</button>}
              {!x.is_derived && onCreateDerived && (
                <button onClick={() => onCreateDerived(x)} title="Créer un dérivé" style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(124,58,237,0.25)", background: "rgba(124,58,237,0.08)", color: "#7C3AED", fontSize: 13, cursor: "pointer" }}>⚗</button>
              )}
              <button onClick={() => onDelete(x.id, x.name)} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "#ede6d9", color: "#aaa", fontSize: 14, cursor: "pointer" }}>✕</button>
            </div>
          </>
        )}
      </div>

      {/* ── EDIT FORM ── */}
      {isEditing && edit && (
        <div className="grid gap-2.5" style={{ padding: "14px 16px", borderTop: "1px solid #e5ddd0", background: "#faf7f2" }}>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: "2fr 1fr 1fr" }}>
            <input style={inputStyle} value={edit.name} onChange={(e) => onEditChange({ ...edit, name: e.target.value })} />
            <select style={selectStyle} value={edit.category} onChange={(e) => onEditChange({ ...edit, category: e.target.value as Category })}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select style={selectStyle} value={edit.supplierId} onChange={(e) => onEditChange({ ...edit, supplierId: e.target.value })}>
              <option value="">—</option>
              {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          {/* Nom d'import (clé stable pour matching factures) */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              flex: 1, display: "flex", alignItems: "center", gap: 6,
              background: "#f5f0e8", border: "1.5px solid #e5ddd0", borderRadius: 10,
              padding: "8px 12px", fontSize: 13, color: "#999", cursor: "not-allowed",
            }}>
              <span style={{ fontSize: 12 }}>🔒</span>
              <span style={{ fontFamily: "monospace", fontSize: 12 }}>{edit.importName || "—"}</span>
              <span style={{ fontSize: 10, color: "#bbb", marginLeft: "auto" }}>(verrouillé)</span>
            </div>
            <button
              type="button"
              onClick={() => onEditImportName(x.id, edit.importName)}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 8, border: "1.5px solid #e5ddd0", background: "white", color: "#888", cursor: "pointer", flexShrink: 0 }}
            >✎</button>
          </div>
          <div className="grid grid-cols-2 gap-2.5 items-center">
            <div className="flex items-center gap-2.5">
              <span className="font-extrabold">Offre fournisseur</span>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={edit.useOffer} onChange={(e) => onEditChange({ ...edit, useOffer: e.target.checked })} style={{ accentColor: "#D4775A" }} />
                <span className="muted">recommandé</span>
              </label>
            </div>
            <select style={selectStyle} value={edit.is_active ? "1" : "0"} onChange={(e) => onEditChange({ ...edit, is_active: e.target.value === "1" })}>
              <option value="1">Actif</option><option value="0">Inactif</option>
            </select>
          </div>
          {edit.useOffer && (
            <>
              <div><div style={labelStyle}>Mode prix</div>
                <select style={selectStyle} value={edit.priceKind} onChange={(e) => onEditChange({ ...edit, priceKind: e.target.value as PriceKind })}>
                  <option value="unit">Unitaire</option><option value="pack_simple">Pack</option><option value="pack_composed">Pack composé</option>
                </select>
              </div>
              {edit.priceKind === "unit" && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input style={inputStyle} placeholder="Prix unitaire" value={edit.unitPrice} onChange={(e) => onEditChange({ ...edit, unitPrice: e.target.value })} />
                    <select style={selectStyle} value={edit.unit} onChange={(e) => onEditChange({ ...edit, unit: e.target.value as "kg" | "l" | "pc" })}>
                      <option value="kg">kg</option><option value="l">L</option><option value="pc">pc</option>
                    </select>
                  </div>
                  {edit.unit === "l" && <input style={inputStyle} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => onEditChange({ ...edit, density: e.target.value })} />}
                  {edit.unit === "pc" && <input style={inputStyle} placeholder="Poids pièce (g)" value={edit.pieceWeightG} onChange={(e) => onEditChange({ ...edit, pieceWeightG: e.target.value })} />}
                  {edit.unit === "pc" && <input style={inputStyle} placeholder="Volume pièce (ml)" value={edit.pieceVolumeMl} onChange={(e) => onEditChange({ ...edit, pieceVolumeMl: e.target.value })} />}
                  <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                </>
              )}
              {edit.priceKind === "pack_simple" && (
                <>
                  <div className="grid grid-cols-3 gap-2.5">
                    <input style={inputStyle} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => onEditChange({ ...edit, packPrice: e.target.value })} />
                    <input style={inputStyle} placeholder="Qté totale (kg/L)" value={edit.packTotalQty} onChange={(e) => onEditChange({ ...edit, packTotalQty: e.target.value })} />
                    <select style={selectStyle} value={edit.packUnit} onChange={(e) => onEditChange({ ...edit, packUnit: e.target.value as "kg" | "l" })}>
                      <option value="kg">kg</option><option value="l">L</option>
                    </select>
                  </div>
                  {edit.packUnit === "l" && <input style={inputStyle} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => onEditChange({ ...edit, density: e.target.value })} />}
                  <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                </>
              )}
              {edit.priceKind === "pack_composed" && (
                <>
                  <div className="grid grid-cols-2 gap-2.5">
                    <input style={inputStyle} placeholder="Prix pack (€)" value={edit.packPrice} onChange={(e) => onEditChange({ ...edit, packPrice: e.target.value })} />
                    <input style={inputStyle} placeholder="Nombre d'unités (ex: 8)" value={edit.packCount} onChange={(e) => onEditChange({ ...edit, packCount: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <select style={selectStyle} value={edit.packEachUnit} onChange={(e) => onEditChange({ ...edit, packEachUnit: e.target.value as "kg" | "l" | "pc" })}>
                      <option value="l">L</option><option value="kg">kg</option><option value="pc">pc</option>
                    </select>
                    {edit.packEachUnit !== "pc"
                      ? <input style={inputStyle} placeholder="Qté par unité (ex: 1.5)" value={edit.packEachQty} onChange={(e) => onEditChange({ ...edit, packEachQty: e.target.value })} />
                      : <input style={inputStyle} placeholder="Poids pièce (g)" value={edit.packPieceWeightG} onChange={(e) => onEditChange({ ...edit, packPieceWeightG: e.target.value })} />}
                  </div>
                  {edit.packEachUnit === "l" && <input style={inputStyle} placeholder="Densité (kg/L)" value={edit.density} onChange={(e) => onEditChange({ ...edit, density: e.target.value })} />}
                  <div className="muted text-[12px]">{previewEditPack || "—"}</div>
                </>
              )}
            </>
          )}
          {/* Allergènes */}
          <div className="pt-1">
            <div className="text-[11px] font-extrabold opacity-60 mb-2 uppercase tracking-wide">Allergènes</div>
            <div className="flex flex-wrap gap-1.5">
              {ALLERGENS.map(a => {
                const checked = edit.allergens.includes(a);
                return (
                  <label key={a} title={a} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 800, background: checked ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.04)", border: `1px solid ${checked ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.10)"}`, color: checked ? "#DC2626" : "#6B6257", transition: "all 120ms" }}>
                    <input type="checkbox" checked={checked} style={{ margin: 0 }}
                      onChange={() => onEditChange({ ...edit, allergens: checked ? edit.allergens.filter(v => v !== a) : [...edit.allergens, a] })} />
                    {ALLERGEN_SHORT[a]}
                  </label>
                );
              })}
            </div>
            <div className="muted text-[10px] mt-1">{edit.allergens.length === 0 ? "Aucun allergène" : edit.allergens.join(" · ")}</div>
          </div>
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  // Custom comparison for React.memo
  if (prev.item.id !== next.item.id) return false;
  if (prev.item.status !== next.item.status) return false;
  if (prev.item.name !== next.item.name) return false;
  if (prev.item.category !== next.item.category) return false;
  if (prev.offer?.unit_price !== next.offer?.unit_price) return false;
  if (prev.isEditing !== next.isEditing) return false;
  if (prev.compactMode !== next.compactMode) return false;
  if (prev.alert?.change_pct !== next.alert?.change_pct) return false;
  if (prev.isEditing && prev.edit !== next.edit) return false;
  if (prev.previewEditPack !== next.previewEditPack) return false;
  if (prev.supplierName !== next.supplierName) return false;
  if (prev.onCreateDerived !== next.onCreateDerived) return false;
  return true;
});
