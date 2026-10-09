"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetchApi";
import { OSWALD } from "@/components/TuileProduit";
import { dateInventaire, fmtQte, MOUVEMENT_COULEURS, MOUVEMENT_LIBELLES, type StockItem, type StockMovement } from "@/lib/stockTypes";

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";

/**
 * Stock théorique d'un produit dans le volet de sa fiche (10/10/2026) : quantité, seuils,
 * et les derniers mouvements (réceptions, ventes décomposées, inventaire).
 */
export function BlocStock({ ingredientId, stock, inventaireDate }: { ingredientId: string; stock: StockItem | null; inventaireDate: string | null }) {
  // Mouvements du produit affiché ; la liste repart à « chargement » quand on change de produit
  const [etat, setEtat] = useState<{ pour: string; mouvements: StockMovement[] } | null>(null);
  const mouvements = etat?.pour === ingredientId ? etat.mouvements : null;

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const res = await fetchApi(`/api/stock/movements?ingredient_id=${ingredientId}&limit=20`);
        const json = res.ok ? ((await res.json()) as StockMovement[]) : [];
        if (!annule) setEtat({ pour: ingredientId, mouvements: Array.isArray(json) ? json : [] });
      } catch { if (!annule) setEtat({ pour: ingredientId, mouvements: [] }); }
    })();
    return () => { annule = true; };
  }, [ingredientId]);

  const dateInv = dateInventaire(inventaireDate);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${BORD}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED }}>Stock théorique</span>
        <Link href="/inventaire" style={{ fontSize: 12, fontWeight: 600, color: "#D4775A", textDecoration: "none" }}>Faire l&apos;inventaire →</Link>
      </div>
      {stock ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: stock.alerte ? "rgba(180,68,58,0.08)" : "#f7f3ec", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>En stock</div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.1, color: stock.alerte ? "#b4443a" : "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{fmtQte(stock.stock)} <span style={{ fontSize: 13, fontWeight: 500, color: MUTED }}>{stock.unit ?? ""}</span></div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{stock.alerte ? "sous le minimum" : dateInv ? `depuis l'inventaire du ${dateInv}` : "calculé sur les mouvements"}</div>
          </div>
          <div style={{ background: "#f7f3ec", borderRadius: 12, padding: "10px 12px" }}>
            <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>Seuils</div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.1, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{stock.stock_min != null ? fmtQte(stock.stock_min) : "—"}{stock.stock_objectif != null && <span style={{ fontSize: 13, fontWeight: 500, color: MUTED }}> → {fmtQte(stock.stock_objectif)}</span>}</div>
            <div style={{ fontSize: 11.5, color: MUTED }}>{stock.stock_min != null ? `minimum${stock.stock_objectif != null ? " → objectif" : ""} · +${fmtQte(stock.receptions)} reçus, −${fmtQte(stock.ventes)} vendus` : "pas de minimum défini"}</div>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 13, color: MUTED }}>Pas de stock suivi pour ce produit : il n&apos;est ni dans l&apos;inventaire, ni relié à une touche de caisse, ni reçu par une commande.</div>
      )}

      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED, margin: "14px 0 6px" }}>Derniers mouvements</div>
      {mouvements == null ? (
        <div style={{ fontSize: 12.5, color: FAIBLE }}>Chargement…</div>
      ) : mouvements.length === 0 ? (
        <div style={{ fontSize: 12.5, color: FAIBLE }}>Aucun mouvement enregistré.</div>
      ) : (
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
            <tbody>
              {mouvements.map((m) => {
                const couleur = MOUVEMENT_COULEURS[m.type] ?? FAIBLE;
                return (
                  <tr key={m.id}>
                    <td style={{ padding: 0, width: 4, background: couleur }} />
                    <td style={{ padding: "8px 10px" }}>
                      <div style={{ fontWeight: 600 }}>{MOUVEMENT_LIBELLES[m.type] ?? m.type}</div>
                      <div style={{ fontSize: 11.5, color: MUTED }}>{fmtDate(m.created_at)}{m.note ? ` · ${m.note}` : ""}</div>
                    </td>
                    <td style={{ padding: "8px 10px", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: m.quantity > 0 ? "#4a6741" : "#D4775A" }}>
                      {m.quantity > 0 ? "+" : ""}{fmtQte(m.quantity)} {m.unit ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
