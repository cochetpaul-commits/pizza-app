import React from "react";
import type { CSSProperties } from "react";
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
import { IngredientAvatar } from "@/components/IngredientAvatar";

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


const BTN_ACTION: CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: "none",
  display: "flex", alignItems: "center", justifyContent: "center",
  cursor: "pointer", flexShrink: 0, fontSize: 14,
};

function stBadge(st: IngredientStatus) {
  if (st === "validated") return { bg: "#d1fae5", color: "#065f46", label: "Validé" };
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
      onMouseEnter={e => { e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.borderColor = accent; }}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.04)"; e.currentTarget.style.borderColor = "#ddd6c8"; e.currentTarget.style.borderLeftColor = accent; }}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 10,
        padding: "12px 16px", background: "#fff",
        border: "1.5px solid #ddd6c8", borderLeft: `3px solid ${accent}`,
        borderRadius: 12, cursor: "pointer", textAlign: "left", fontFamily: "inherit",
        marginTop: 16, marginBottom: 6,
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
        transition: "box-shadow 0.2s, border-color 0.2s",
      }}
    >
      <span style={{ width: 10, height: 10, borderRadius: "50%", background: accent, flexShrink: 0 }} />
      <span style={{
        fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 700,
        letterSpacing: "0.14em", textTransform: "uppercase", color: accent,
      }}>{CAT_LABELS[cat]}</span>
      <span style={{
        fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
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
  packPieceWeightG: string; pieceVolumeMl: string; packEachVolumeUnit: string; allergens: string[];
  pricingPkg: string; // conditionnement prix (bouteille, sac, carton…) — independent from orderUnitLabel
  orderUnitLabel: string;
  orderQuantity: string;
  storageZone: string;
  stockMin: string;
  stockObjectif: string;
  stockMax: string;
  establishments: string[];
};

// ─── IngredientRow ──────────────────────────────────────────────────────────
export type StorageZoneOption = { id: string; name: string };

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
  storageZones: StorageZoneOption[];
  previewEditPack: string;
  onStartEdit: (x: Ingredient) => void;
  onSaveEdit: () => void;
  onDelete: (id: string, name: string) => void;
  onSetStatus: (id: string, next: IngredientStatus) => void;
  onEditChange: (next: EditState) => void;
  onEditImportName: (id: string, current: string) => void;
  onCreateDerived?: (x: Ingredient) => void;
  onOpenSupplier?: (supplierId: string) => void;
};

export const IngredientRow = React.memo(function IngredientRow({
  item: x, offer, supplierName, supplierIdForDisplay, alert, isEditing, compactMode, edit,
  suppliers, storageZones,
  onStartEdit, onSaveEdit, onDelete, onSetStatus, onEditChange, onEditImportName, onCreateDerived, onOpenSupplier,
}: IngredientRowProps) {
  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>({ identite: true, prix: true, complements: false });
  const toggleSection = (key: string) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const price = formatIngredientPrice(x, offer ?? null);
  const estab = offer?.establishment ?? "both";
  const st = (x.status ?? "to_check") as IngredientStatus;
  const hasPrice = offerHasPrice(offer, { piece_volume_ml: x.piece_volume_ml }) || legacyHasPrice(x);
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
        onClick={() => { if (isEditing) onSaveEdit(); else onStartEdit(x); }}
        style={{ alignItems: "center", padding: "10px 16px", gap: 10, background: "white", transition: "background 0.1s", cursor: "pointer" }}
      >
        {/* Avatar */}
        <IngredientAvatar ingredientId={x.id} name={x.name} category={x.category} size={36} editable />

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
            <span style={{ fontFamily: "monospace", color: "#bbb" }}>{x.id.slice(0, 8)}</span>
            {" · "}{supplierName || CAT_LABELS[x.category]}
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
              <button disabled={!canValidate} onClick={(e) => { e.stopPropagation(); if (!canValidate) return; onSetStatus(x.id, "validated"); }} style={{ height: 22, padding: "0 8px", borderRadius: 5, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 10, fontWeight: 600, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>
            </div>
          )}
        </div>

        {/* Prix */}
        <div style={{ flex: 1 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", whiteSpace: "pre-line" }}>{price}</span>
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
            <button onClick={(e) => { e.stopPropagation(); onOpenSupplier?.(supplierIdForDisplay); }} style={{ color: "inherit", textDecoration: "underline dotted", textUnderlineOffset: 2, background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: "inherit" }}>{supplierName}</button>
          ) : "—"}
          {(estab === "bellomio" || estab === "both") && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#FEF2F2", color: "#D4775A" }}>BM</span>}
          {(estab === "piccola" || estab === "both") && <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#F5F3FF", color: "#6B21A8" }}>PM</span>}
        </div>

        {/* Actions */}
        <div style={{ width: 90, display: "flex", gap: 5, alignItems: "center", justifyContent: "flex-end" }}>
          {!x.is_derived && onCreateDerived && (
            <button onClick={(e) => { e.stopPropagation(); onCreateDerived(x); }} title="Créer un dérivé" style={{ ...BTN_ACTION, background: "rgba(124,58,237,0.10)", color: "#7C3AED", fontSize: 12, fontWeight: 700 }}>⚗</button>
          )}
          {isEditing && <button onClick={(e) => { e.stopPropagation(); onSaveEdit(); }} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700 }}>OK</button>}
          {!isEditing && <button onClick={(e) => { e.stopPropagation(); onDelete(x.id, x.name); }} title="Supprimer" style={{ ...BTN_ACTION, background: "rgba(220,38,38,0.10)", color: "#DC2626" }}>✕</button>}
        </div>
      </div>

      {/* ── MOBILE ROW ── */}
      <div
        className="md:hidden"
        onClick={() => { if (isEditing) onSaveEdit(); else onStartEdit(x); }}
        style={{ padding: "12px 14px", background: "white", cursor: "pointer" }}
      >
        {compactMode ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: CAT_COLORS[x.category] }}>{x.name}</div>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", flexShrink: 0, whiteSpace: "pre-line" }}>{price}</span>
            {alert && <span style={{ fontSize: 10, color: alert.direction === "up" ? "#DC2626" : "#16A34A", flexShrink: 0 }}>{alert.direction === "up" ? "↑" : "↓"}</span>}
            {isEditing && <button onClick={(e) => { e.stopPropagation(); onSaveEdit(); }} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 10, fontWeight: 700 }}>OK</button>}
            {!isEditing && <button onClick={(e) => { e.stopPropagation(); onDelete(x.id, x.name); }} style={{ ...BTN_ACTION, background: "rgba(220,38,38,0.10)", color: "#DC2626" }}>✕</button>}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
              <IngredientAvatar ingredientId={x.id} name={x.name} category={x.category} size={36} editable />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <span style={{ fontWeight: 600, fontSize: 13, color: CAT_COLORS[x.category] }}>{x.name}</span>
                  {x.is_derived && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED" }}>DÉRIVÉ</span>}
                </div>
                <div style={{ fontSize: 10, color: "#999999", marginTop: 2 }}>
                  <span style={{ fontFamily: "monospace", color: "#bbb" }}>{x.id.slice(0, 8)}</span>
                  {" · "}{supplierName || CAT_LABELS[x.category]}
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
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", whiteSpace: "pre-line" }}>{price}</div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 999, background: sb.bg, color: sb.color, display: "inline-block", marginTop: 3 }}>{sb.label}</span>
                {alert && <div style={{ fontSize: 10, fontWeight: 800, color: alert.direction === "up" ? "#DC2626" : "#16A34A", marginTop: 2 }}>{alert.direction === "up" ? "↑" : "↓"} {(Math.abs(alert.change_pct) * 100).toFixed(0)}%</div>}
              </div>
            </div>
            {!hasPrice && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 4 }}>prix manquant</div>}
            <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
              {st !== "validated" && <button onClick={(e) => { e.stopPropagation(); if (!canValidate) return; onSetStatus(x.id, "validated"); }} disabled={!canValidate} style={{ flex: 1, height: 30, borderRadius: 7, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 11, fontWeight: 700, cursor: canValidate ? "pointer" : "not-allowed", color: "#4a6741", opacity: !canValidate ? 0.4 : 1 }}>Valider</button>}
              {isEditing && <button onClick={(e) => { e.stopPropagation(); onSaveEdit(); }} style={{ flex: 1, height: 30, borderRadius: 7, border: "none", background: "#4a6741", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>OK</button>}
              {!isEditing && !x.is_derived && onCreateDerived && (
                <button onClick={(e) => { e.stopPropagation(); onCreateDerived(x); }} title="Créer un dérivé" style={{ width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(124,58,237,0.25)", background: "rgba(124,58,237,0.08)", color: "#7C3AED", fontSize: 13, cursor: "pointer" }}>⚗</button>
              )}
              {!isEditing && <button onClick={(e) => { e.stopPropagation(); onDelete(x.id, x.name); }} style={{ width: 30, height: 30, borderRadius: 7, border: "none", background: "rgba(220,38,38,0.10)", color: "#DC2626", fontSize: 14, cursor: "pointer" }}>✕</button>}
            </div>
          </>
        )}
      </div>

      {/* ── EDIT FORM ── */}
      {isEditing && edit && (() => {
        const isLiquidCat = edit.category === "alcool_spiritueux" || edit.category === "boisson";

        // Packaging options
        const PACKAGINGS = ["kg", "litre", "piece", "---", "bac", "barquette", "bidon", "boite", "bouteille", "brick", "carton", "cagette", "fut", "pack", "paquet", "plateau", "poche", "sac", "sachet", "seau"] as const;

        // Derive current "packaging" from edit state
        const currentPkg = edit.priceKind === "unit"
          ? (edit.unit === "kg" ? "kg" : edit.unit === "l" ? "litre" : "piece")
          : (edit.pricingPkg && PACKAGINGS.includes(edit.pricingPkg as typeof PACKAGINGS[number]) ? edit.pricingPkg : "pack");

        // Handle packaging change — preserve price, do NOT touch orderUnitLabel
        // "bouteille" = unit piece (not a pack), "carton/pack/sac/etc" = pack
        const PIECE_PACKAGINGS = new Set(["piece", "bouteille", "barquette", "brick", "poche", "sachet"]);
        const onPkgChange = (pkg: string) => {
          const currentPrice = isBaseUnit ? edit.unitPrice : edit.packPrice;
          if (pkg === "kg") onEditChange({ ...edit, priceKind: "unit", unit: "kg", unitPrice: currentPrice || edit.unitPrice, pricingPkg: pkg });
          else if (pkg === "litre") onEditChange({ ...edit, priceKind: "unit", unit: "l", unitPrice: currentPrice || edit.unitPrice, pricingPkg: pkg });
          else if (PIECE_PACKAGINGS.has(pkg)) onEditChange({ ...edit, priceKind: "unit", unit: "pc", unitPrice: currentPrice || edit.unitPrice, pricingPkg: pkg });
          else onEditChange({ ...edit, priceKind: "pack_simple", packUnit: isLiquidCat ? "l" : "kg", pricingPkg: pkg, packPrice: currentPrice || edit.packPrice });
        };

        // Normalize comma to dot for numeric inputs
        const numVal = (v: string) => v.replace(",", ".");

        const isBaseUnit = currentPkg === "kg" || currentPkg === "litre" || PIECE_PACKAGINGS.has(currentPkg);

        const fieldLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 4 };

        const SectionHeader = ({ label, sectionKey }: { label: string; sectionKey: string }) => (
          <button
            type="button"
            onClick={() => toggleSection(sectionKey)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "10px 14px", marginBottom: openSections[sectionKey] ? 12 : 0,
              background: "#f0ebe3", border: "none", borderRadius: 8, cursor: "pointer",
              fontFamily: "var(--font-dm), 'DM Sans', sans-serif",
              fontSize: 13, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase" as const,
              letterSpacing: "0.06em",
            }}
          >
            <span>{label}</span>
            <span style={{ fontSize: 10, transition: "transform 0.2s", transform: openSections[sectionKey] ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
          </button>
        );

        return (
        <div style={{ padding: "16px", borderTop: "1.5px solid #e5ddd0", background: "#faf7f2" }}>

          {/* ─── BLOC 1: IDENTITÉ ─── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader label="Informations générales" sectionKey="identite" />
            {openSections.identite && (<>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div>
                <div style={fieldLabel}>Nom</div>
                <input style={inputStyle} value={edit.name} onChange={(e) => onEditChange({ ...edit, name: e.target.value })} />
              </div>
              <div>
                <div style={fieldLabel}>Catégorie</div>
                <select style={selectStyle} value={edit.category} onChange={(e) => onEditChange({ ...edit, category: e.target.value as Category })}>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
                </select>
              </div>
              <div>
                <div style={fieldLabel}>Fournisseur</div>
                <select style={selectStyle} value={edit.supplierId} onChange={(e) => onEditChange({ ...edit, supplierId: e.target.value })}>
                  <option value="">—</option>
                  {suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, alignItems: "end" }}>
              <div>
                <div style={fieldLabel}>Nom d&apos;import</div>
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  background: "#f5f0e8", border: "1.5px solid #e5ddd0", borderRadius: 10,
                  padding: "8px 12px", fontSize: 12, color: "#999", height: 40,
                }}>
                  <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edit.importName || "—"}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onEditImportName(x.id, edit.importName)}
                style={{ fontSize: 11, padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e5ddd0", background: "white", color: "#888", cursor: "pointer", height: 40 }}
              >✎</button>
            </div>
            </>)}
          </div>

          {/* ─── BLOC 2: PRIX D'ACHAT ─── */}
          <div style={{ marginBottom: 16 }}>
            <SectionHeader label="Prix d&apos;achat" sectionKey="prix" />

            {openSections.prix && (<>
            {/* Ligne 1 : Prix / Conditionnement */}
            <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 10 }}>
              <div>
                <div style={fieldLabel}>Prix</div>
                <input
                  style={{ ...inputStyle, width: 120 }}
                  value={isBaseUnit ? edit.unitPrice : edit.packPrice}
                  onChange={(e) => isBaseUnit
                    ? onEditChange({ ...edit, unitPrice: numVal(e.target.value) })
                    : onEditChange({ ...edit, packPrice: numVal(e.target.value) })
                  }
                />
              </div>
              <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", paddingBottom: 8 }}>€ /</span>
              <div>
                <div style={fieldLabel}>Conditionnement</div>
                <select style={{ ...selectStyle, width: 140 }} value={currentPkg} onChange={(e) => onPkgChange(e.target.value)}>
                  <option value="kg">kg</option>
                  <option value="litre">litre</option>
                  <option value="piece">pièce</option>
                  <option disabled>────────</option>
                  <option value="bac">bac</option>
                  <option value="barquette">barquette</option>
                  <option value="bidon">bidon</option>
                  <option value="boite">boite</option>
                  <option value="bouteille">bouteille</option>
                  <option value="brick">brick</option>
                  <option value="carton">carton</option>
                  <option value="cagette">cagette</option>
                  <option value="fut">fût</option>
                  <option value="pack">pack</option>
                  <option value="paquet">paquet</option>
                  <option value="plateau">plateau</option>
                  <option value="poche">poche</option>
                  <option value="sac">sac</option>
                  <option value="sachet">sachet</option>
                  <option value="seau">seau</option>
                </select>
              </div>
            </div>

            {/* Ligne 2 : Conversion conditionnement → base (si packaging) */}
            {!isBaseUnit && (
              <div style={{ padding: "10px 12px", background: "#fff", borderRadius: 10, border: "1.5px solid #e5ddd0", marginBottom: 10 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "end", flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#666", paddingBottom: 8 }}>1 {currentPkg} contient</span>
                  <div>
                    <input
                      style={{ ...inputStyle, width: 70 }}
                      value={edit.packCount || edit.packTotalQty}
                      onChange={(e) => onEditChange({ ...edit, packCount: numVal(e.target.value), packTotalQty: numVal(e.target.value) })}
                      placeholder="nb"
                    />
                  </div>
                  <span style={{ fontSize: 13, color: "#666", paddingBottom: 8 }}>×</span>
                  <div>
                    <select style={{ ...selectStyle, width: 120 }} value={edit.packEachUnit || edit.packUnit || "pc"} onChange={(e) => {
                      const v = e.target.value;
                      if (v === "pc") onEditChange({ ...edit, priceKind: "pack_composed", packEachUnit: "pc", packUnit: "l" });
                      else onEditChange({ ...edit, priceKind: "pack_simple", packUnit: v as "kg" | "l", packEachUnit: "kg" as "kg" | "l" | "pc" });
                    }}>
                      <option value="pc">bouteille/piece</option>
                      <option value="kg">kg</option>
                      <option value="l">litre</option>
                    </select>
                  </div>
                  {(edit.packEachUnit === "pc" || (!edit.packEachUnit && edit.priceKind === "pack_composed")) && (
                    <>
                      <span style={{ fontSize: 13, color: "#666", paddingBottom: 8 }}>de</span>
                      <div>
                        <input
                          style={{ ...inputStyle, width: 70 }}
                          value={edit.packEachQty || ""}
                          onChange={(e) => onEditChange({ ...edit, packEachQty: numVal(e.target.value) })}
                          placeholder="vol."
                        />
                      </div>
                      <div>
                        <select style={{ ...selectStyle, width: 60 }} value={edit.packEachVolumeUnit || "cl"} onChange={(e) => onEditChange({ ...edit, packEachVolumeUnit: e.target.value })}>
                          <option value="cl">cl</option>
                          <option value="ml">ml</option>
                          <option value="L">L</option>
                          <option value="g">g</option>
                          <option value="kg">kg</option>
                        </select>
                      </div>
                    </>
                  )}
                </div>
                {/* Auto-calculated unit price */}
                {(() => {
                  const packPrice = parseFloat(String(edit.packPrice)) || 0;
                  const count = parseFloat(String(edit.packCount || edit.packTotalQty)) || 0;
                  if (packPrice > 0 && count > 0) {
                    const unitPrice = packPrice / count;
                    return (
                      <div style={{ fontSize: 12, color: "#4a6741", fontWeight: 600, marginTop: 4 }}>
                        = {unitPrice.toFixed(2)}€ / unite ({count} × {unitPrice.toFixed(2)}€ = {packPrice.toFixed(2)}€)
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            </>)}
          </div>

          {/* ─── BLOC 3: COMPLÉMENTS ─── */}
          <div>
            <SectionHeader label="Compléments" sectionKey="complements" />
            {openSections.complements && (<>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr 1fr", gap: 8, marginBottom: 12 }}>
              <div>
                <div style={fieldLabel}>Unité de commande</div>
                <select style={selectStyle} value={edit.orderUnitLabel} onChange={(e) => onEditChange({ ...edit, orderUnitLabel: e.target.value })}>
                  <option value="">— Aucune —</option>
                  <option value="kg">kg</option>
                  <option value="litre">litre</option>
                  <option value="pièce">pièce</option>
                  <option disabled>────────</option>
                  <option value="bac">bac</option>
                  <option value="barquette">barquette</option>
                  <option value="bidon">bidon</option>
                  <option value="boite">boite</option>
                  <option value="bouteille">bouteille</option>
                  <option value="brick">brick</option>
                  <option value="carton">carton</option>
                  <option value="cagette">cagette</option>
                  <option value="fût">fût</option>
                  <option value="pack">pack</option>
                  <option value="paquet">paquet</option>
                  <option value="plateau">plateau</option>
                  <option value="poche">poche</option>
                  <option value="sac">sac</option>
                  <option value="sachet">sachet</option>
                  <option value="seau">seau</option>
                </select>
              </div>
              {edit.orderUnitLabel && !["kg", "litre", "pièce"].includes(edit.orderUnitLabel) && (
                <div>
                  <div style={fieldLabel}>Qté</div>
                  <input style={{ ...inputStyle, width: 60 }} value={edit.orderQuantity} onChange={(e) => onEditChange({ ...edit, orderQuantity: numVal(e.target.value) })} placeholder="ex: 6" />
                </div>
              )}
              {edit.orderUnitLabel === "pièce" && currentPkg !== "piece" && (
                <div>
                  <div style={fieldLabel}>Poids pièce (g)</div>
                  <input style={{ ...inputStyle, width: 100 }} value={edit.pieceWeightG} onChange={(e) => onEditChange({ ...edit, pieceWeightG: numVal(e.target.value) })} placeholder="ex: 1600" />
                </div>
              )}
              <div>
                <div style={fieldLabel}>Stockage</div>
                <select style={selectStyle} value={edit.storageZone} onChange={(e) => onEditChange({ ...edit, storageZone: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {storageZones.map(z => <option key={z.id} value={z.name}>{z.name}</option>)}
                </select>
              </div>
              <div>
                <div style={fieldLabel}>Statut</div>
                <select style={selectStyle} value={edit.is_active ? "1" : "0"} onChange={(e) => onEditChange({ ...edit, is_active: e.target.value === "1" })}>
                  <option value="1">Actif</option><option value="0">Inactif</option>
                </select>
              </div>
            </div>

            <div style={fieldLabel}>Niveaux de stock</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
              <div>
                <div style={fieldLabel}>Stock minimum</div>
                <input style={{ ...inputStyle, width: 100 }} type="number" value={edit.stockMin} onChange={(e) => onEditChange({ ...edit, stockMin: numVal(e.target.value) })} placeholder="0" />
              </div>
              <div>
                <div style={fieldLabel}>Stock objectif</div>
                <input style={{ ...inputStyle, width: 100 }} type="number" value={edit.stockObjectif} onChange={(e) => onEditChange({ ...edit, stockObjectif: numVal(e.target.value) })} placeholder="0" />
              </div>
              <div>
                <div style={fieldLabel}>Stock maximum</div>
                <input style={{ ...inputStyle, width: 100 }} type="number" value={edit.stockMax} onChange={(e) => onEditChange({ ...edit, stockMax: numVal(e.target.value) })} placeholder="0" />
              </div>
            </div>

            <div style={fieldLabel}>Établissements</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              {([["bellomio", "Bello Mio", "#D4775A"], ["piccola", "Piccola Mia", "#6B21A8"]] as const).map(([key, label, color]) => {
                const checked = edit.establishments.includes(key);
                return (
                  <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, background: checked ? `${color}18` : "rgba(0,0,0,0.04)", border: `1.5px solid ${checked ? color : "rgba(0,0,0,0.10)"}`, color: checked ? color : "#6B6257", transition: "all 120ms" }}>
                    <input type="checkbox" checked={checked} style={{ margin: 0 }}
                      onChange={() => {
                        const next = checked ? edit.establishments.filter(e => e !== key) : [...edit.establishments, key];
                        onEditChange({ ...edit, establishments: next });
                      }} />
                    {label}
                  </label>
                );
              })}
            </div>

            <div style={fieldLabel}>Allergènes</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
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
            {edit.allergens.length > 0 && <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>{edit.allergens.join(" · ")}</div>}
            </>)}
          </div>
        </div>
        );
      })()}
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

  if (prev.supplierName !== next.supplierName) return false;
  if (prev.onCreateDerived !== next.onCreateDerived) return false;
  return true;
});
