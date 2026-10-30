"use client";

import React from "react";
import type { Ingredient } from "@/types/ingredients";
import { MiniStepper } from "./MiniStepper";
import { ACCENT, BON, BORD, BORD_LIGNE, MUTED } from "@/components/ui/charte";

/**
 * Une ligne de l'inventaire (30/10/2026) : sortie de la page et mémorisée. Avant, chaque chiffre tapé
 * redessinait toutes les lignes de la zone ; maintenant seule la ligne touchée se redessine.
 */
export type PackInfo = { pack_count: number; pack_each_qty: number | null; pack_each_unit: string | null };
export type LigneInventaireProps = {
  ing: Ingredient; pack: PackInfo | undefined; rawQty: number | "" | undefined; totalAllZones: number;
  prevQty: number | null | undefined; theo: number | null | undefined; zoneCouleur: string; supplier: { name: string; color: string | null } | undefined;
  isActive: boolean; readOnly: boolean; color: string;
  onQty: (id: string, val: string) => void; onRetirer: (ing: Ingredient) => void;
};
const fmtMoney = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR" });

export const LigneInventaire = React.memo(function LigneInventaire({ ing, pack, rawQty, totalAllZones, prevQty, theo, zoneCouleur, supplier, isActive, readOnly, color, onQty, onRetirer }: LigneInventaireProps) {
                                                                            const rawQtyNum = typeof rawQty === "number" ? rawQty : 0;
    const hasQty = rawQtyNum > 0;
    const isZeroConfirmed = rawQty === 0;
    const valeur = hasQty && ing.cost_per_unit != null
      ? rawQtyNum * ing.cost_per_unit : null;

    // For pack items: decompose stored qty into cartons + loose
    const nbCartons = pack ? Math.floor(rawQtyNum / pack.pack_count) : 0;
    const nbLoose = pack ? rawQtyNum % pack.pack_count : rawQtyNum;
    const packUnit = pack?.pack_each_unit ?? ing.default_unit ?? "pcs";

    return (
      <div
        key={ing.id}
        className="inv-article"
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 14px 9px 16px",
          borderBottom: `1px solid ${BORD_LIGNE}`,
          boxShadow: `inset 6px 0 0 ${hasQty ? color : isZeroConfirmed ? "#d6d0c4" : `${color}55`}`,
          flexWrap: "wrap",
        }}
      >
        {/* Name + unit + delete — affichage produit canonique */}
        <div className="produit-main">
          <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
            <span className="produit-name" style={{
              fontSize: 13.5, fontWeight: hasQty ? 600 : 500,
              color: hasQty ? "#1a1a1a" : isZeroConfirmed ? MUTED : "#1a1a1a",
              textDecoration: isZeroConfirmed ? "line-through" : "none",
              flex: 1, minWidth: 0,
            }}>
              {ing.name}
            </span>
            {isActive && (
              <button type="button" onClick={(e) => { e.stopPropagation(); onRetirer(ing); }} style={{
                flexShrink: 0, width: 20, height: 20, borderRadius: 5,
                border: "none", background: "none", color: "#ccc",
                fontSize: 11, cursor: "pointer", display: "flex",
                alignItems: "center", justifyContent: "center",
              }} title="Supprimer ce produit">✕</button>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#999", marginTop: 1, display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            <span className="pastille-cadre">
              {pack
                ? `crt ${pack.pack_count} × ${pack.pack_each_qty ?? 1}${packUnit}`
                : (ing.default_unit ?? "pcs")}
            </span>
            {ing.storage_zone && <span className="pastille" style={{ "--pastille-c": zoneCouleur } as React.CSSProperties}>{ing.storage_zone}</span>}
            {supplier && (
              <span className="pastille" style={{ "--pastille-c": supplier.color ?? "#b0a894" } as React.CSSProperties}>
                {supplier.name}
              </span>
            )}
            <a
              href={`/ingredients?edit=${ing.id}&back=${encodeURIComponent("/inventaire")}`}
              title="Modifier la fiche produit"
              className="pastille-cadre"
              style={{ textDecoration: "none", cursor: "pointer" }}
              onClick={(e) => e.stopPropagation()}
            >
              ✎
            </a>
            {/* Previous inventory comparison */}
            {hasQty && prevQty != null && (() => {
              const prev = prevQty as number;
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
            {hasQty && theo != null && (() => {
              const theoArrondi = Math.round((theo as number) * 10) / 10;
              const ecart = Math.round((rawQtyNum - theoArrondi) * 10) / 10;
              if (ecart === 0 || theoArrondi <= 0) return null;
              return (
                <span style={{
                  fontSize: 9, fontWeight: 700, padding: "0 5px", borderRadius: 4,
                  background: Math.abs(ecart) > theoArrondi * 0.2 ? "rgba(220,38,38,0.10)" : "rgba(212,160,60,0.10)",
                  color: Math.abs(ecart) > theoArrondi * 0.2 ? "#DC2626" : "#D4A03C",
                }}>
                  stock théorique {theoArrondi} · écart {ecart > 0 ? "+" : ""}{ecart}
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
          <span style={{ fontSize: 12, color: MUTED, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
            {fmtMoney(valeur)}
          </span>
        )}

        {/* Qty inputs */}
        {readOnly ? (
          <span style={{
            fontSize: 15, fontWeight: 700, color: hasQty ? "#1a1a1a" : "#ccc",
            minWidth: 50, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums",
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
              onChange={(c) => onQty(ing.id, String(c * pack.pack_count + nbLoose))}
            />
            <span style={{ fontSize: 11, color: "#999", fontWeight: 600, alignSelf: "center" }}>+</span>
            <MiniStepper
              value={hasQty || isZeroConfirmed ? nbLoose : ""}
              active={nbLoose > 0}
              color={color}
              label={packUnit}
              onChange={(l) => onQty(ing.id, String(nbCartons * pack.pack_count + l))}
            />
          </div>
        ) : (
          /* Stepper input with +/- buttons */
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
            <button type="button" onClick={() => {
              const cur = typeof rawQty === "number" ? rawQty : 0;
              onQty(ing.id, String(Math.max(0, cur - 1)));
            }} style={{
              width: 32, height: 36, borderRadius: "10px 0 0 10px",
              border: `1px solid ${BORD}`, borderRight: "none",
              background: "#fff", color: ACCENT, fontSize: 18, fontFamily: "inherit",
              fontWeight: 700, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>-</button>
            <input
              type="number"
              step="0.5"
              min="0"
              value={rawQty ?? ""}
              onChange={(e) => onQty(ing.id, e.target.value)}
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
              onQty(ing.id, String(cur + 1));
            }} style={{
              width: 32, height: 36, borderRadius: "0 10px 10px 0",
              border: `1px solid ${BORD}`, borderLeft: "none",
              background: "#fff", color: BON, fontSize: 18, fontFamily: "inherit",
              fontWeight: 700, cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>+</button>
          </div>
        )}

        {/* Total compté : pastille ronde en bas à droite (charte) */}
        {hasQty && (
          <div className="produit-footer" style={{ flexBasis: "100%", marginTop: 4 }}>
            <span className="pastille-ronde" style={{ background: "rgba(109,40,217,0.10)", color: "#6d28d9" }}>
              = {rawQtyNum} {packUnit}
            </span>
          </div>
        )}
      </div>
    );

});
