import React, { useState, useEffect, useRef } from "react";

const LIQUID_CATS = new Set<string>(["vins", "spiritueux", "biere", "liqueurs", "soft", "sirops", "cafeteria"]);
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
import { cachedSupplierColor } from "@/lib/supplierColors";
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
        marginLeft: "auto", fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 6,
        background: `${accent}18`, color: accent,
      }}>{count}</span>
      <span style={{ fontSize: 10, color: "#b0a894", transition: "transform 0.2s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}>▼</span>
    </button>
  );
});

// ─── Edit state type (kept in sync with page.tsx) ───────────────────────────
export type EditState = {
  name: string; category: Category; subCategory: string; is_active: boolean; supplierId: string;
  importName: string;
  popinaName: string;
  popinaDoseCl: string;
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
  altOffers?: LatestOffer[];
  suppliersMap?: Map<string, Supplier>;
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
  onToggleEstablishment?: (id: string, estab: "bellomio" | "piccola", current: string[]) => void;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
  duplicateMatch?: { id: string; name: string; score: number } | null;
  onMergeDuplicate?: (keepId: string, deleteId: string) => void;
  onIgnoreDuplicate?: (id1: string, id2: string) => void;
  subCategorySuggestions?: string[];
};

export const IngredientRow = React.memo(function IngredientRow({
  item: x, offer, altOffers, suppliersMap, supplierName, supplierIdForDisplay, alert, isEditing, compactMode, edit,
  suppliers, storageZones,
  onStartEdit, onSaveEdit, onDelete, onSetStatus, onEditChange, onEditImportName, onCreateDerived, onOpenSupplier, onToggleEstablishment,
  selected, onToggleSelect, duplicateMatch, onMergeDuplicate, onIgnoreDuplicate, subCategorySuggestions,
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

  // Price comparison: find cheapest among all active offers with unit_price
  const priceComparison = React.useMemo(() => {
    if (!altOffers || altOffers.length <= 1 || !suppliersMap) return null;
    const withPrice = altOffers.filter(o => o.unit_price != null && o.unit_price > 0);
    if (withPrice.length <= 1) return null;
    // Deduplicate by supplier_id (keep cheapest per supplier)
    const bySupplier = new Map<string, typeof withPrice[0]>();
    for (const o of withPrice) {
      const existing = bySupplier.get(o.supplier_id);
      if (!existing || (o.unit_price! < existing.unit_price!)) {
        bySupplier.set(o.supplier_id, o);
      }
    }
    if (bySupplier.size <= 1) return null;
    const sorted = [...bySupplier.values()].sort((a, b) => a.unit_price! - b.unit_price!);
    const cheapest = sorted[0];
    const cheapestName = suppliersMap.get(cheapest.supplier_id)?.name ?? null;
    const currentSupId = offer?.supplier_id ?? x.supplier_id;
    const isCheapest = currentSupId === cheapest.supplier_id;
    return { cheapest, cheapestName, count: sorted.length, isCheapest, sorted };
  }, [altOffers, suppliersMap, offer, x.supplier_id]);

  const alg = parseAllergens(x.allergens);
  const sb = stBadge(st);
  const pul = (x.purchase_unit_label ?? "").toLowerCase();
  const shortUnit = pul.includes("bouteille") || pul === "btl" || pul === "bt" ? "btl"
    : pul.includes("carton") ? "crt" : pul.includes("sachet") ? "sac"
    : pul.includes("fut") || pul.includes("fût") ? "fût" : pul ? pul.slice(0, 4) : "pc";
  const condInfo = offer?.density_kg_per_l != null ? `${fmtQty(offer.density_kg_per_l)} kg/L`
    : offer?.piece_weight_g != null ? `${fmtQty(offer.piece_weight_g)} g/${shortUnit}`
    : x.piece_volume_ml != null ? fmtVolume(x.piece_volume_ml) + `/${shortUnit}`
    : x.purchase_unit_name === "l" ? `${x.density_g_per_ml ?? 1} kg/L`
    : x.piece_weight_g ? `${x.piece_weight_g} g/${shortUnit}` : "—";

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
      {/* ── DESKTOP ROW — single line ── */}
      <div
        className="hidden md:block"
        onClick={() => { if (isEditing) onSaveEdit(); else onStartEdit(x); }}
        style={{ padding: "8px 16px", background: "white", transition: "background 0.1s", cursor: "pointer" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <IngredientAvatar ingredientId={x.id} name={x.name} category={x.category} size={28} editable />
          <span className="produit-name" style={{ fontWeight: 600, fontSize: 13, color: catAccent, flex: "1 1 0", minWidth: 0 }}>{x.name}</span>
          {x.is_derived && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED", flexShrink: 0 }}>DERIVE</span>}
          {alert && <span style={{ fontSize: 10, fontWeight: 800, padding: "1px 5px", borderRadius: 6, color: alert.direction === "up" ? "#DC2626" : "#16A34A", background: alert.direction === "up" ? "rgba(220,38,38,0.10)" : "rgba(22,163,74,0.10)", flexShrink: 0 }}>{alert.direction === "up" ? "+" : "-"}{(Math.abs(alert.change_pct) * 100).toFixed(0)}%</span>}
          <span className="pastille-ronde" style={{ fontSize: 11, padding: "2px 9px", flexShrink: 0 }}>{price}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: sb.bg, color: sb.color, flexShrink: 0 }}>{sb.label}</span>
          {/* Carte d'identité : catégorie ET fournisseur, toujours les deux */}
          <span className="pastille" style={{ "--pastille-c": catAccent, flexShrink: 0 } as React.CSSProperties}>{CAT_LABELS[x.category]}</span>
          {supplierName && supplierIdForDisplay ? (
            <button className="pastille" onClick={(e) => { e.stopPropagation(); onOpenSupplier?.(supplierIdForDisplay); }} style={{ "--pastille-c": cachedSupplierColor(supplierName), border: "none", cursor: "pointer", flexShrink: 0 } as React.CSSProperties}>{supplierName}</button>
          ) : <span style={{ fontSize: 11, color: "#ccc", flexShrink: 0 }}>—</span>}
          <button onClick={(e) => { e.stopPropagation(); onToggleEstablishment?.(x.id, "bellomio", ingEstabs); }} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: hasBM ? "rgba(212,119,90,0.1)" : "rgba(0,0,0,0.04)", color: hasBM ? "#D4775A" : "#ccc", border: "none", cursor: "pointer", flexShrink: 0 }}>BM</button>
          <button onClick={(e) => { e.stopPropagation(); onToggleEstablishment?.(x.id, "piccola", ingEstabs); }} style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: hasPM ? "rgba(212,160,60,0.1)" : "rgba(0,0,0,0.04)", color: hasPM ? "#D4A03C" : "#ccc", border: "none", cursor: "pointer", flexShrink: 0 }}>PM</button>
          {alg.length > 0 && (
            <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
              {alg.map(a => (
                <span key={a} title={a} style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 4, background: "rgba(220,38,38,0.08)", color: "#DC2626", border: "1px solid rgba(220,38,38,0.20)" }}>
                  {ALLERGEN_SHORT[a as keyof typeof ALLERGEN_SHORT] ?? a}
                </span>
              ))}
            </div>
          )}
          {priceComparison && !priceComparison.isCheapest && priceComparison.cheapestName && (
            <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
              {priceComparison.cheapestName} ({priceComparison.cheapest.unit_price!.toFixed(2)}{"\u00A0\u20AC"}/{priceComparison.cheapest.unit ?? "kg"})
            </span>
          )}
          {priceComparison && priceComparison.isCheapest && priceComparison.count > 1 && (
            <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>Meilleur prix ({priceComparison.count})</span>
          )}
          {!hasPrice && <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", flexShrink: 0 }}>prix manquant</span>}
          {st !== "validated" && canValidate && (
            <button disabled={!canValidate} onClick={(e) => { e.stopPropagation(); onSetStatus(x.id, "validated"); }} style={{ height: 20, padding: "0 8px", borderRadius: 5, border: "1px solid #4a6741", background: "rgba(74,103,65,0.08)", fontSize: 10, fontWeight: 600, cursor: "pointer", color: "#4a6741", flexShrink: 0 }}>Valider</button>
          )}
          {!x.is_derived && onCreateDerived && (
            <button onClick={(e) => { e.stopPropagation(); onCreateDerived(x); }} title="Derive" style={{ ...BTN_ACTION, background: "rgba(124,58,237,0.10)", color: "#7C3AED", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>⚗</button>
          )}
          {isEditing && <button onClick={(e) => { e.stopPropagation(); onSaveEdit(); }} style={{ ...BTN_ACTION, background: "#4a6741", color: "white", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>OK</button>}
          <a href={`/ingredients/${x.id}`} onClick={(e) => e.stopPropagation()} title="Fiche detail" style={{ ...BTN_ACTION, background: "rgba(26,26,26,0.06)", color: "#1a1a1a", fontSize: 13, fontWeight: 700, textDecoration: "none", flexShrink: 0 }}>→</a>
          {/* Croix visible aussi fiche ouverte : c'est en la lisant qu'on decide de supprimer */}
          <button onClick={(e) => { e.stopPropagation(); onDelete(x.id, x.name); }} title="Supprimer le produit" style={{ ...BTN_ACTION, background: "rgba(220,38,38,0.10)", color: "#DC2626", flexShrink: 0 }}>✕</button>
        </div>
      </div>

      {/* ── MOBILE ROW ── */}
      <div
        className="md:hidden"
        onClick={() => { if (isEditing) onSaveEdit(); else onStartEdit(x); }}
        style={{ padding: "10px 12px", background: "white", cursor: "pointer" }}
      >
        {/* Row 1: Checkbox + Avatar + Name + Price */}
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {onToggleSelect && (
            <input
              type="checkbox"
              checked={selected ?? false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(x.id); }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: 16, height: 16, accentColor: catAccent, cursor: "pointer", flexShrink: 0 }}
            />
          )}
          {!compactMode && <IngredientAvatar ingredientId={x.id} name={x.name} category={x.category} size={30} editable />}
          <div className="produit-main">
            <div className="produit-name" style={{ fontWeight: 600, fontSize: 13, color: catAccent }}>{x.name}</div>
          </div>
          <button onClick={(e) => { e.stopPropagation(); onDelete(x.id, x.name); }} style={{
            width: 24, height: 24, borderRadius: 6, border: "none",
            background: "rgba(220,38,38,0.08)", color: "#DC2626",
            fontSize: 12, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>x</button>
        </div>
        {/* Row 2: carte d'identité — statut · catégorie (sous-cat) · fournisseur, toujours les trois */}
        {!compactMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4, flexWrap: "wrap", paddingLeft: onToggleSelect ? 54 : 38 }}>
            <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 999, background: sb.bg, color: sb.color }}>{sb.label}</span>
            <span className="pastille" style={{ "--pastille-c": catAccent } as React.CSSProperties}>
              {CAT_LABELS[x.category]}{x.sub_category ? ` · ${x.sub_category}` : ""}
            </span>
            {alert && <span style={{ fontSize: 9, fontWeight: 700, color: alert.direction === "up" ? "#DC2626" : "#16A34A" }}>{alert.direction === "up" ? "+" : "-"}{(Math.abs(alert.change_pct) * 100).toFixed(0)}%</span>}
            {supplierName
              ? <span className="pastille" style={{ "--pastille-c": cachedSupplierColor(supplierName) } as React.CSSProperties}>{supplierName}</span>
              : <span style={{ fontSize: 10, color: "#aaa" }}>— sans fournisseur</span>}
          </div>
        )}
        {/* Row 3: Price comparison */}
        {!compactMode && priceComparison && (
          <div style={{ paddingLeft: onToggleSelect ? 54 : 38, marginTop: 3 }}>
            {!priceComparison.isCheapest && priceComparison.cheapestName ? (
              <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600 }}>
                - cher : {priceComparison.cheapestName} ({priceComparison.cheapest.unit_price!.toFixed(2)}{"\u00A0\u20AC"}/{priceComparison.cheapest.unit ?? "kg"})
              </span>
            ) : priceComparison.count > 1 ? (
              <span style={{ fontSize: 10, color: "#16A34A", fontWeight: 600 }}>
                Meilleur prix ({priceComparison.count} fournisseurs)
              </span>
            ) : null}
          </div>
        )}
        {!compactMode && !hasPrice && <div style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", marginTop: 4, paddingLeft: onToggleSelect ? 54 : 38 }}>prix manquant</div>}
        {/* Prix : pastille ronde en bas à droite (charte) */}
        {hasPrice && (
          <div className="produit-footer">
            <span className="pastille-ronde">{price}</span>
          </div>
        )}
      </div>

      {/* ── DUPLICATE ALERT ── */}
      {isEditing && duplicateMatch && (
        <div style={{
          margin: "0 8px 8px", padding: "10px 14px", borderRadius: 10,
          background: "#fef3c7", border: "1.5px solid #f59e0b",
          display: "flex", flexDirection: "column", gap: 8,
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e" }}>
            Doublon potentiel ({Math.round(duplicateMatch.score * 100)}% similarité)
          </div>
          <div style={{ fontSize: 13, color: "#1a1a1a" }}>
            Un produit similaire existe : <strong>{duplicateMatch.name}</strong>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button"
              onClick={() => onMergeDuplicate?.(duplicateMatch.id, x.id)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "none",
                background: "#8B1A1A", color: "#fff", fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Fusionner (garder existant)
            </button>
            <button type="button"
              onClick={() => onMergeDuplicate?.(x.id, duplicateMatch.id)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "1.5px solid #8B1A1A",
                background: "#fff", color: "#8B1A1A", fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Fusionner (garder celui-ci)
            </button>
            <button type="button"
              onClick={() => onDelete(x.id, x.name)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "1.5px solid #DC2626",
                background: "#fff", color: "#DC2626", fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Supprimer
            </button>
            <button type="button"
              onClick={() => onIgnoreDuplicate?.(x.id, duplicateMatch.id)}
              style={{
                padding: "6px 16px", borderRadius: 8, border: "1.5px solid #999",
                background: "#fff", color: "#777", fontWeight: 600, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit", marginLeft: "auto",
              }}>
              Ignorer
            </button>
          </div>
        </div>
      )}

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
        const CONTENT_UNITS = ["cl", "ml", "L", "g", "kg", "pcs"] as const;
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
                  }
                  // Don't auto-swap prices: both EUR/kg and EUR/pack are editable.
                  // The user types in whichever field is the source (orange border = source).
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
                <span style={{ fontSize: 11, color: "#888", paddingBottom: 8 }}>
                  {baseLabel}{baseLabel !== "kg" && baseLabel !== "litre" ? "(s)" : ""}
                  {edit.baseUnit === "piece" && edit.pieceContentQty && (
                    <span style={{ color: "#bbb" }}> de {edit.pieceContentQty}{edit.pieceContentUnit}</span>
                  )}
                </span>
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
                <div style={fieldLabel}>Sous-catégorie</div>
                <input style={inputStyle} value={edit.subCategory} list={`subcat-${x.id}`}
                  onChange={(e) => onEditChange({ ...edit, subCategory: e.target.value })}
                  placeholder="Ex: Vins rouges, Rhum..." />
                {subCategorySuggestions && subCategorySuggestions.length > 0 && (
                  <datalist id={`subcat-${x.id}`}>
                    {subCategorySuggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
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
                <div style={fieldLabel}>Sous-catégorie</div>
                <input style={inputStyle} value={edit.subCategory} list={`subcat-${x.id}`}
                  onChange={(e) => onEditChange({ ...edit, subCategory: e.target.value })}
                  placeholder="Ex: Vins rouges, Rhum..." />
                {subCategorySuggestions && subCategorySuggestions.length > 0 && (
                  <datalist id={`subcat-${x.id}`}>
                    {subCategorySuggestions.map(s => <option key={s} value={s} />)}
                  </datalist>
                )}
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

          {/* ── Bottom action button ── */}
          <button onClick={(e) => { e.stopPropagation(); onSaveEdit(); }} style={{
            width: "100%", height: 40, borderRadius: 10, border: "none",
            background: "#4a6741", color: "white", fontSize: 13, fontWeight: 700,
            cursor: "pointer", marginTop: 16,
          }}>{st !== "validated" ? "Valider" : "OK"}</button>
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
