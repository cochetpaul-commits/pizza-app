import React, { useState, useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import {
  CATEGORIES,
  CAT_COLORS,
  CAT_LABELS,
  type Category,
  type Ingredient,
  type IngredientStatus,
  type LatestOffer,
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

// ─── MobileAccordion (module-level to avoid focus loss on re-render) ────────
function MobileAccordion({ label, sectionKey, isOpen, onToggleSection, children }: {
  label: string; sectionKey: string; isOpen: boolean;
  onToggleSection: (key: string) => void; children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <button type="button" onClick={() => onToggleSection(sectionKey)}
        style={{
          width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 12px", background: isOpen ? "#f0ebe3" : "#fff", border: "1.5px solid #e5ddd0",
          borderRadius: isOpen ? "8px 8px 0 0" : 8, cursor: "pointer",
          fontSize: 11, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase" as const,
          letterSpacing: "0.06em",
        }}>
        <span>{label}</span>
        <span style={{ fontSize: 10, transition: "transform 0.2s", transform: isOpen ? "rotate(0)" : "rotate(-90deg)" }}>&#9660;</span>
      </button>
      {isOpen && (
        <div style={{ padding: 12, background: "#fff", border: "1.5px solid #e5ddd0", borderTop: "none", borderRadius: "0 0 8px 8px" }}>
          {children}
        </div>
      )}
    </div>
  );
}



// ─── Unified packaging type options (shared by piece type, conditionnement, order unit) ──
const PACK_TYPES = [
  "piece", "bac", "barquette", "bidon", "bloc", "boite", "bouteille",
  "brick", "cagette", "carton", "fut", "meule", "pack", "paquet",
  "plateau", "poche", "sac", "sachet", "seau",
] as const;
const PACK_LABELS: Record<string, string> = {
  piece: "Piece", bac: "Bac", barquette: "Barquette", bidon: "Bidon",
  bloc: "Bloc", boite: "Boite", bouteille: "Bouteille", brick: "Brick",
  cagette: "Cagette", carton: "Carton", fut: "Fut", meule: "Meule",
  pack: "Pack", paquet: "Paquet", plateau: "Plateau", poche: "Poche",
  sac: "Sac", sachet: "Sachet", seau: "Seau",
};

// ─── StyledSelect (custom dropdown replacing native <select>) ────────────
type SelectOption = { value: string; label: string; disabled?: boolean };

function StyledSelect({ value, onChange, options, width, placeholder, accentColor }: {
  value: string;
  onChange: (v: string) => void;
  options: SelectOption[];
  width?: number | string;
  placeholder?: string;
  accentColor?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value && !o.disabled);
  const accent = accentColor ?? "#D4775A";

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Convert hex accent to rgba for backgrounds
  const accentBg = `${accent}10`;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        style={{
          width: "100%", height: 40, textAlign: "left",
          borderRadius: 10, border: `1.5px solid ${open ? accent : "#e5ddd0"}`,
          padding: "0 32px 0 12px", fontSize: 13,
          background: "#fff", color: selected ? "#1a1a1a" : "#999",
          cursor: "pointer", fontFamily: "inherit",
          transition: "border-color 150ms",
          outline: "none",
        }}
      >
        {selected?.label ?? placeholder ?? "—"}
        <svg
          width="10" height="6" viewBox="0 0 10 6"
          style={{
            position: "absolute", right: 12, top: "50%",
            transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
            transition: "transform 200ms ease",
          }}
        >
          <path d="M1 1l4 4 4-4" stroke={open ? accent : "#999"} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          minWidth: "100%", width: "max-content",
          background: "#fff", border: "1.5px solid #e5ddd0", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 120,
          maxHeight: 220, overflowY: "auto",
          padding: "4px 0",
          animation: "fadeSlideDown 150ms ease-out",
        }}>
          {options.map((o, i) => {
            if (o.disabled) {
              return <div key={i} style={{ height: 1, background: "#e5ddd0", margin: "4px 8px" }} />;
            }
            const isSelected = o.value === value;
            return (
              <div
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); }}
                style={{
                  padding: "7px 12px", fontSize: 12, cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 8,
                  color: isSelected ? accent : "#1a1a1a",
                  fontWeight: isSelected ? 700 : 400,
                  background: isSelected ? accentBg : "transparent",
                  transition: "background 100ms",
                }}
                onMouseOver={e => { if (!isSelected) e.currentTarget.style.background = "#f5f0e8"; }}
                onMouseOut={e => { if (!isSelected) e.currentTarget.style.background = isSelected ? accentBg : "transparent"; }}
              >
                {isSelected && (
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: accent, flexShrink: 0 }} />
                )}
                {o.label}
              </div>
            );
          })}
        </div>
      )}
      <style>{`@keyframes fadeSlideDown { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

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
  useOffer: boolean;
  baseUnit: "piece" | "kg" | "litre";
  baseUnitLabel: string;        // "bouteille", "barquette", etc.
  pieceContentQty: string;      // e.g. "20"
  pieceContentUnit: string;     // "cl", "ml", "L", "g", "kg"
  hasConditionnement: boolean;
  conditionnementLabel: string; // "carton", "sac", etc.
  qtyPerConditionnement: string; // "6"
  pricePerBaseUnit: string;     // "2.00"
  pricePerConditionnement: string; // "12.00"
  pricePerKgOrL: string;       // "10.00"
  priceSource: "base" | "cond" | "kgL" | null;
  allergens: string[];
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
  const [mobileSection, setMobileSection] = React.useState<string>("prix"); // mobile accordion: only one open at a time
  const toggleMobileSection = React.useCallback((key: string) => {
    setMobileSection(prev => prev === key ? "" : key);
  }, []);

  const price = formatIngredientPrice(x, offer ?? null);
  // Use ingredient's establishments array (not offer.establishment)
  const ingEstabs = x.establishments ?? ["bellomio", "piccola"];
  const hasBM = ingEstabs.includes("bellomio");
  const hasPM = ingEstabs.includes("piccola");
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
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: hasBM ? "rgba(212,119,90,0.1)" : "rgba(0,0,0,0.04)", color: hasBM ? "#D4775A" : "#ccc" }}>BM</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: hasPM ? "rgba(212,160,60,0.1)" : "rgba(0,0,0,0.04)", color: hasPM ? "#D4A03C" : "#ccc" }}>PM</span>
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
        // Normalize comma to dot for numeric inputs
        const numVal = (v: string) => v.replace(",", ".");

        const fieldLabel: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#888", marginBottom: 3 };
        const sectionLabel: CSSProperties = {
          fontSize: 10, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase" as const,
          letterSpacing: "0.08em", marginBottom: 8, paddingBottom: 4,
          borderBottom: "1px solid #e5ddd0",
        };

        // ── Pricing helpers (IIFE scope) ──
        const CONTENT_UNITS = ["cl", "ml", "L", "g", "kg"] as const;
        const contentToMl = (qty: number, unit: string): number | null => {
          if (unit === "cl") return qty * 10; if (unit === "ml") return qty; if (unit === "L") return qty * 1000; return null;
        };
        const contentToG = (qty: number, unit: string): number | null => {
          if (unit === "g") return qty; if (unit === "kg") return qty * 1000; return null;
        };
        const isWeightContent = (unit: string) => unit === "g" || unit === "kg";
        const isVolumeContent = (unit: string) => unit === "cl" || unit === "ml" || unit === "L";

        const autoCalc = (next: EditState) => {
          const baseP = parseFloat(next.pricePerBaseUnit) || 0;
          const condP = parseFloat(next.pricePerConditionnement) || 0;
          const kgLP = parseFloat(next.pricePerKgOrL) || 0;
          const condQty = parseFloat(next.qtyPerConditionnement) || 0;
          const contentQty = parseFloat(next.pieceContentQty) || 0;

          if (next.priceSource === "base" && baseP > 0) {
            if (next.hasConditionnement && condQty > 0) next.pricePerConditionnement = (baseP * condQty).toFixed(2);
            if (next.baseUnit === "piece" && contentQty > 0) {
              const cu = next.pieceContentUnit;
              if (isWeightContent(cu)) { const g = contentToG(contentQty, cu); if (g && g > 0) next.pricePerKgOrL = (baseP / g * 1000).toFixed(2); }
              else if (isVolumeContent(cu)) { const ml = contentToMl(contentQty, cu); if (ml && ml > 0) next.pricePerKgOrL = (baseP / ml * 1000).toFixed(2); }
            }
          } else if (next.priceSource === "cond" && condP > 0) {
            if (condQty > 0) {
              const cb = condP / condQty; next.pricePerBaseUnit = cb.toFixed(2);
              if (next.baseUnit === "piece" && contentQty > 0) {
                const cu = next.pieceContentUnit;
                if (isWeightContent(cu)) { const g = contentToG(contentQty, cu); if (g && g > 0) next.pricePerKgOrL = (cb / g * 1000).toFixed(2); }
                else if (isVolumeContent(cu)) { const ml = contentToMl(contentQty, cu); if (ml && ml > 0) next.pricePerKgOrL = (cb / ml * 1000).toFixed(2); }
              }
            }
          } else if (next.priceSource === "kgL" && kgLP > 0) {
            if (next.baseUnit === "piece" && contentQty > 0) {
              const cu = next.pieceContentUnit; let cb = 0;
              if (isWeightContent(cu)) { const g = contentToG(contentQty, cu); if (g && g > 0) cb = kgLP * g / 1000; }
              else if (isVolumeContent(cu)) { const ml = contentToMl(contentQty, cu); if (ml && ml > 0) cb = kgLP * ml / 1000; }
              if (cb > 0) { next.pricePerBaseUnit = cb.toFixed(2); if (next.hasConditionnement && condQty > 0) next.pricePerConditionnement = (cb * condQty).toFixed(2); }
            } else if (next.baseUnit === "kg" || next.baseUnit === "litre") {
              next.pricePerBaseUnit = kgLP.toFixed(2);
              if (next.hasConditionnement && condQty > 0) next.pricePerConditionnement = (kgLP * condQty).toFixed(2);
            }
          }
        };

        const handlePriceChange = (field: "base" | "cond" | "kgL", value: string) => {
          const next = { ...edit, priceSource: field as EditState["priceSource"] };
          if (field === "base") next.pricePerBaseUnit = numVal(value);
          else if (field === "cond") next.pricePerConditionnement = numVal(value);
          else next.pricePerKgOrL = numVal(value);
          autoCalc(next); onEditChange(next);
        };

        const baseLabel = edit.baseUnit === "kg" ? "kg" : edit.baseUnit === "litre" ? "litre" : (edit.baseUnitLabel || "piece");
        const showKgLPrice = edit.baseUnit === "piece" && parseFloat(edit.pieceContentQty) > 0;
        const kgLUnit = edit.baseUnit === "piece" && isWeightContent(edit.pieceContentUnit) ? "kg" : "L";

        const pillStyle = (active: boolean): CSSProperties => ({
          padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${active ? "#D4775A" : "#e5ddd0"}`,
          background: active ? "rgba(212,119,90,0.10)" : "#fff", color: active ? "#D4775A" : "#666",
          fontSize: 12, fontWeight: 700, cursor: "pointer",
        });

        const buildSummary = (): string | null => {
          const parts: string[] = [];
          const bp = parseFloat(edit.pricePerBaseUnit); const cp = parseFloat(edit.pricePerConditionnement); const kp = parseFloat(edit.pricePerKgOrL);
          if (bp > 0) parts.push(`${bp.toFixed(2)}EUR/${baseLabel}`);
          if (edit.hasConditionnement && cp > 0) { const cq = parseFloat(edit.qtyPerConditionnement) || 0; parts.push(`${cp.toFixed(2)}EUR/${edit.conditionnementLabel || "cond."}${cq > 0 ? ` (${cq} ${baseLabel})` : ""}`); }
          if (showKgLPrice && kp > 0) parts.push(`${kp.toFixed(2)}EUR/${kgLUnit}`);
          return parts.length > 0 ? parts.join("  --  ") : null;
        };
        const summary = buildSummary();

        // ── Shared content renderers (used by both desktop & mobile) ──

        const renderPrixContent = () => (<>
          {/* Base unit pills */}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
            {(["kg", "litre", "piece"] as const).map(u => (
              <button key={u} type="button" style={pillStyle(edit.baseUnit === u)}
                onClick={() => {
                  const next: EditState = { ...edit, baseUnit: u,
                    baseUnitLabel: u === "piece" ? (edit.baseUnitLabel || "piece") : "",
                    pieceContentQty: u !== "piece" ? "" : edit.pieceContentQty,
                    pieceContentUnit: u !== "piece" ? "cl" : edit.pieceContentUnit,
                    pricePerKgOrL: u !== "piece" ? "" : edit.pricePerKgOrL,
                    priceSource: null, pricePerBaseUnit: edit.pricePerBaseUnit,
                    pricePerConditionnement: edit.pricePerConditionnement,
                  };
                  onEditChange(next);
                }}>
                {u === "kg" ? "kg" : u === "litre" ? "Litre" : "Piece"}
              </button>
            ))}
          </div>

          {/* Piece details */}
          {edit.baseUnit === "piece" && (
            <div style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap", marginBottom: 8, padding: "8px 10px", background: "#faf7f2", borderRadius: 8, border: "1px solid #ede6d8" }}>
              <div>
                <div style={fieldLabel}>Type</div>
                <StyledSelect width={120} value={edit.baseUnitLabel || "piece"}
                  onChange={(v) => onEditChange({ ...edit, baseUnitLabel: v })}
                  options={PACK_TYPES.map(p => ({ value: p, label: PACK_LABELS[p] }))}
                />
              </div>
              <div>
                <div style={fieldLabel}>Contenu</div>
                <input style={{ ...inputStyle, width: 65 }} value={edit.pieceContentQty}
                  onChange={(e) => { const next = { ...edit, pieceContentQty: numVal(e.target.value) }; if (edit.priceSource) autoCalc(next); onEditChange(next); }}
                  placeholder="ex: 75" />
              </div>
              <div>
                <StyledSelect width={60} value={edit.pieceContentUnit}
                  onChange={(v) => { const next = { ...edit, pieceContentUnit: v }; if (edit.priceSource) autoCalc(next); onEditChange(next); }}
                  options={CONTENT_UNITS.map(u => ({ value: u, label: u }))}
                />
              </div>
            </div>
          )}

          {/* Conditionnement toggle */}
          <div style={{ marginBottom: 8 }}>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#666" }}>
              <input type="checkbox" checked={edit.hasConditionnement}
                onChange={() => {
                  const next = { ...edit, hasConditionnement: !edit.hasConditionnement };
                  if (!next.hasConditionnement) {
                    next.pricePerConditionnement = ""; if (next.priceSource === "cond") next.priceSource = null;
                  } else if ((next.baseUnit === "kg" || next.baseUnit === "litre") && parseFloat(next.pricePerBaseUnit) > 0 && !next.pricePerConditionnement) {
                    // When enabling conditionnement on a kg/L item, the existing price is almost
                    // always the pack price (e.g. 18.68€ for a 1.5kg barquette), not the per-kg price.
                    // Move it to the pack field so the user just needs to enter the pack qty.
                    next.pricePerConditionnement = next.pricePerBaseUnit;
                    next.pricePerBaseUnit = "";
                    next.priceSource = "cond";
                  }
                  onEditChange(next);
                }}
                style={{ margin: 0 }} />
              Conditionnement
            </label>
            {edit.hasConditionnement && (
              <div style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap", marginTop: 6 }}>
                <div>
                  <div style={fieldLabel}>Type</div>
                  <StyledSelect width={110} value={edit.conditionnementLabel || "carton"}
                    onChange={(v) => onEditChange({ ...edit, conditionnementLabel: v })}
                    options={PACK_TYPES.map(p => ({ value: p, label: PACK_LABELS[p] }))}
                  />
                </div>
                <div>
                  <div style={fieldLabel}>Qté/{edit.conditionnementLabel || "cond."}</div>
                  <input style={{ ...inputStyle, width: 60 }} value={edit.qtyPerConditionnement}
                    onChange={(e) => { const next = { ...edit, qtyPerConditionnement: numVal(e.target.value) }; if (edit.priceSource) autoCalc(next); onEditChange(next); }}
                    placeholder="ex: 6" />
                </div>
                <span style={{ fontSize: 11, color: "#888", paddingBottom: 8 }}>{baseLabel}(s)</span>
              </div>
            )}
          </div>

          {/* Price inputs */}
          <div style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap", marginBottom: 8 }}>
            <div>
              <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>EUR / {baseLabel}</div>
              <input style={{ ...inputStyle, width: 90, borderColor: edit.priceSource === "base" ? "#D4775A" : undefined }}
                value={edit.pricePerBaseUnit} onChange={(e) => handlePriceChange("base", e.target.value)} placeholder="0.00" />
            </div>
            {edit.hasConditionnement && (
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>EUR / {edit.conditionnementLabel || "cond."}</div>
                <input style={{ ...inputStyle, width: 90, borderColor: edit.priceSource === "cond" ? "#D4775A" : undefined }}
                  value={edit.pricePerConditionnement} onChange={(e) => handlePriceChange("cond", e.target.value)} placeholder="0.00" />
              </div>
            )}
            {showKgLPrice && (
              <div>
                <div style={{ fontSize: 10, color: "#888", marginBottom: 2 }}>EUR / {kgLUnit}</div>
                <input style={{ ...inputStyle, width: 90, borderColor: edit.priceSource === "kgL" ? "#D4775A" : undefined }}
                  value={edit.pricePerKgOrL} onChange={(e) => handlePriceChange("kgL", e.target.value)} placeholder="0.00" />
              </div>
            )}
          </div>

          {/* Summary */}
          {summary && (
            <div style={{ fontSize: 11, color: "#4a6741", fontWeight: 600, padding: "6px 10px", background: "rgba(74,103,65,0.06)", borderRadius: 6 }}>
              {summary}
            </div>
          )}
        </>);

        const renderCommandeContent = () => (<>
          {/* Order unit + qty + stockage */}
          <div style={{ display: "flex", gap: 6, alignItems: "end", flexWrap: "wrap", marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={fieldLabel}>Unité cmd</div>
              <StyledSelect value={edit.orderUnitLabel} onChange={(v) => onEditChange({ ...edit, orderUnitLabel: v })}
                placeholder="—"
                options={[{ value: "", label: "—" }, { value: "kg", label: "kg" }, { value: "litre", label: "litre" }, { value: "", label: "", disabled: true }, ...PACK_TYPES.map(p => ({ value: p, label: PACK_LABELS[p] }))]}
              />
            </div>
            {edit.orderUnitLabel && !["kg", "litre", "pièce"].includes(edit.orderUnitLabel) && (
              <div>
                <div style={fieldLabel}>Qté</div>
                <input style={{ ...inputStyle, width: 55 }} value={edit.orderQuantity} onChange={(e) => onEditChange({ ...edit, orderQuantity: numVal(e.target.value) })} placeholder="6" />
              </div>
            )}
            <div style={{ flex: 1, minWidth: 100 }}>
              <div style={fieldLabel}>Stockage</div>
              <StyledSelect value={edit.storageZone} onChange={(v) => onEditChange({ ...edit, storageZone: v })}
                placeholder="—"
                options={[{ value: "", label: "—" }, ...storageZones.map(z => ({ value: z.name, label: z.name }))]}
              />
            </div>
          </div>

          {/* Stock levels */}
          <div style={fieldLabel}>Niveaux de stock</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>Min</div>
              <input style={inputStyle} type="number" value={edit.stockMin} onChange={(e) => onEditChange({ ...edit, stockMin: numVal(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>Objectif</div>
              <input style={inputStyle} type="number" value={edit.stockObjectif} onChange={(e) => onEditChange({ ...edit, stockObjectif: numVal(e.target.value) })} placeholder="0" />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#aaa", marginBottom: 2 }}>Max</div>
              <input style={inputStyle} type="number" value={edit.stockMax} onChange={(e) => onEditChange({ ...edit, stockMax: numVal(e.target.value) })} placeholder="0" />
            </div>
          </div>
        </>);

        const renderEtabAllergenesContent = () => (<>
          {/* Establishments */}
          <div style={fieldLabel}>Établissements</div>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {([["bellomio", "Bello Mio", "#D4775A"], ["piccola", "Piccola Mia", "#D4A03C"]] as const).map(([key, label, color]) => {
              const checked = edit.establishments.includes(key);
              return (
                <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, cursor: "pointer", fontSize: 11, fontWeight: 700, background: checked ? `${color}18` : "rgba(0,0,0,0.04)", border: `1.5px solid ${checked ? color : "rgba(0,0,0,0.10)"}`, color: checked ? color : "#6B6257", transition: "all 120ms" }}>
                  <input type="checkbox" checked={checked} style={{ margin: 0 }}
                    onChange={() => { const next = checked ? edit.establishments.filter(e => e !== key) : [...edit.establishments, key]; onEditChange({ ...edit, establishments: next }); }} />
                  {label}
                </label>
              );
            })}
          </div>

          {/* Allergens */}
          <div style={fieldLabel}>Allergènes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {ALLERGENS.map(a => {
              const checked = edit.allergens.includes(a);
              return (
                <label key={a} title={a} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 6px", borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 800, background: checked ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.04)", border: `1px solid ${checked ? "rgba(220,38,38,0.35)" : "rgba(0,0,0,0.10)"}`, color: checked ? "#DC2626" : "#6B6257", transition: "all 120ms" }}>
                  <input type="checkbox" checked={checked} style={{ margin: 0 }}
                    onChange={() => onEditChange({ ...edit, allergens: checked ? edit.allergens.filter(v => v !== a) : [...edit.allergens, a] })} />
                  {ALLERGEN_SHORT[a]}
                </label>
              );
            })}
          </div>
          {edit.allergens.length > 0 && <div style={{ fontSize: 9, color: "#999", marginTop: 3 }}>{edit.allergens.join(" · ")}</div>}
        </>);

        return (
        <div style={{ padding: "12px 16px", borderTop: "1.5px solid #e5ddd0", background: "#faf7f2" }}>

          {/* ═══ DESKTOP TOP BAR: 4 columns ═══ */}
          <div className="hidden md:block" style={{ marginBottom: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 8, marginBottom: 6 }}>
              <div>
                <div style={fieldLabel}>Nom</div>
                <input style={inputStyle} value={edit.name} onChange={(e) => onEditChange({ ...edit, name: e.target.value })} />
              </div>
              <div>
                <div style={fieldLabel}>Catégorie</div>
                <StyledSelect value={edit.category}
                  onChange={(v) => onEditChange({ ...edit, category: v as Category })}
                  options={CATEGORIES.map(c => ({ value: c, label: CAT_LABELS[c] }))}
                  accentColor={CAT_COLORS[edit.category]}
                />
              </div>
              <div>
                <div style={fieldLabel}>Fournisseur</div>
                <StyledSelect value={edit.supplierId}
                  onChange={(v) => onEditChange({ ...edit, supplierId: v })}
                  placeholder="—"
                  options={[{ value: "", label: "—" }, ...suppliers.filter(s => s.is_active).map(s => ({ value: s.id, label: s.name }))]}
                />
              </div>
              <div>
                <div style={fieldLabel}>Statut</div>
                <StyledSelect value={edit.is_active ? "1" : "0"} onChange={(v) => onEditChange({ ...edit, is_active: v === "1" })}
                  options={[{ value: "1", label: "Actif" }, { value: "0", label: "Inactif" }]}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 6, background: "#f5f0e8", border: "1.5px solid #e5ddd0", borderRadius: 8, padding: "6px 10px", fontSize: 11, color: "#999", height: 32 }}>
                <span style={{ fontSize: 10, color: "#aaa", fontWeight: 600 }}>Import:</span>
                <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edit.importName || "—"}</span>
              </div>
              <button type="button" onClick={() => onEditImportName(x.id, edit.importName)}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #e5ddd0", background: "white", color: "#888", cursor: "pointer", height: 32 }}>✎</button>
            </div>
          </div>

          {/* ═══ MOBILE TOP BAR: stacked rows ═══ */}
          <div className="md:hidden" style={{ marginBottom: 10 }}>
            <div style={{ marginBottom: 6 }}>
              <div style={fieldLabel}>Nom</div>
              <input style={inputStyle} value={edit.name} onChange={(e) => onEditChange({ ...edit, name: e.target.value })} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
              <div>
                <div style={fieldLabel}>Catégorie</div>
                <StyledSelect value={edit.category}
                  onChange={(v) => onEditChange({ ...edit, category: v as Category })}
                  options={CATEGORIES.map(c => ({ value: c, label: CAT_LABELS[c] }))}
                  accentColor={CAT_COLORS[edit.category]}
                />
              </div>
              <div>
                <div style={fieldLabel}>Fournisseur</div>
                <StyledSelect value={edit.supplierId}
                  onChange={(v) => onEditChange({ ...edit, supplierId: v })}
                  placeholder="—"
                  options={[{ value: "", label: "—" }, ...suppliers.filter(s => s.is_active).map(s => ({ value: s.id, label: s.name }))]}
                />
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <div style={{ width: 80 }}>
                <StyledSelect value={edit.is_active ? "1" : "0"} onChange={(v) => onEditChange({ ...edit, is_active: v === "1" })}
                  options={[{ value: "1", label: "Actif" }, { value: "0", label: "Inactif" }]}
                />
              </div>
              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, background: "#f5f0e8", border: "1.5px solid #e5ddd0", borderRadius: 8, padding: "6px 8px", fontSize: 10, color: "#999", height: 36 }}>
                <span style={{ color: "#aaa", fontWeight: 600 }}>Import:</span>
                <span style={{ fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{edit.importName || "—"}</span>
              </div>
              <button type="button" onClick={() => onEditImportName(x.id, edit.importName)}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, border: "1.5px solid #e5ddd0", background: "white", color: "#888", cursor: "pointer", height: 36 }}>✎</button>
            </div>
          </div>

          {/* ═══ DESKTOP: 2 columns, no accordions ═══ */}
          <div className="hidden md:grid md:grid-cols-2 gap-3" style={{ alignItems: "start" }}>
            <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e5ddd0", padding: 12 }}>
              <div style={sectionLabel}>Prix d&apos;achat</div>
              {renderPrixContent()}
            </div>
            <div style={{ background: "#fff", borderRadius: 10, border: "1.5px solid #e5ddd0", padding: 12 }}>
              <div style={sectionLabel}>Commande & stock</div>
              {renderCommandeContent()}
              <div style={{ borderTop: "1px solid #e5ddd0", marginTop: 10, paddingTop: 10 }}>
                {renderEtabAllergenesContent()}
              </div>
            </div>
          </div>

          {/* ═══ MOBILE: stacked accordions ═══ */}
          <div className="md:hidden">
            <MobileAccordion label="Prix d'achat" sectionKey="prix" isOpen={mobileSection === "prix"} onToggleSection={toggleMobileSection}>
              {renderPrixContent()}
            </MobileAccordion>
            <MobileAccordion label="Commande & stock" sectionKey="commande" isOpen={mobileSection === "commande"} onToggleSection={toggleMobileSection}>
              {renderCommandeContent()}
            </MobileAccordion>
            <MobileAccordion label="Établ. & allergènes" sectionKey="etab" isOpen={mobileSection === "etab"} onToggleSection={toggleMobileSection}>
              {renderEtabAllergenesContent()}
            </MobileAccordion>
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
