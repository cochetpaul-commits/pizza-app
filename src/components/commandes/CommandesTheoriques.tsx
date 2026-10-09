"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { fetchApi } from "@/lib/fetchApi";
import { OSWALD } from "@/components/TuileProduit";
import { EtatVide } from "@/components/ui/EtatVide";
import { couleurTexteSur, styleBarreCategorie } from "@/lib/styleCategories";
import { fmtQte } from "@/lib/stockTypes";

/**
 * Proposition de commande (ex-onglet « Commandes à passer » de la page Stock, déplacée le 10/10/2026) :
 * pour chaque fournisseur, ce qu'il faudrait commander pour tenir jusqu'à la prochaine livraison,
 * d'après le stock théorique, la consommation moyenne et les objectifs de stock.
 * Gabarit commun : une barre par fournisseur, tableau accroché dessous.
 */

type OrderLine = { ingredient_id: string; name: string; category: string | null; unit: string; current_stock: number; avg_daily: number; stock_objectif: number; days_until_delivery: number; stock_at_delivery: number; qty_to_order: number; pack_label: string | null; pack_price: number | null; estimated_cost: number | null; urgent: boolean };
type SupplierOrder = { supplier_id: string; supplier_name: string; supplier_color: string | null; delivery_days: string[] | null; next_delivery_in: number; franco_minimum: number | null; lines: OrderLine[]; total_estimated: number };

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const TH: CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: FAIBLE, padding: "8px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "10px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export function CommandesTheoriques({ bureau }: { bureau: boolean }) {
  const [orders, setOrders] = useState<SupplierOrder[] | null>(null);
  const [calculeA, setCalculeA] = useState<string | null>(null);
  const [chargement, setChargement] = useState(false);
  const [ouverts, setOuverts] = useState<Set<string>>(new Set());

  const charger = useCallback(async () => {
    setChargement(true);
    try {
      const res = await fetchApi("/api/stock/commandes-theoriques");
      const d = res.ok ? await res.json() : null;
      const liste = (d?.suppliers ?? []) as SupplierOrder[];
      setOrders(liste);
      setOuverts(new Set(liste.map((o) => o.supplier_id)));
      setCalculeA(d?.generated_at ? new Date(d.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }) : null);
    } finally { setChargement(false); }
  }, []);
  useEffect(() => { void charger(); }, [charger]);

  const basculer = (id: string) => setOuverts((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const urgents = (orders ?? []).reduce((n, o) => n + o.lines.filter((l) => l.urgent).length, 0);
  const total = (orders ?? []).reduce((n, o) => n + o.total_estimated, 0);

  return (
    <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.ct-ligne:hover td{background:#f7f3ec}.ct-ligne:last-child td{border-bottom:0}`}</style>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <span style={{ color: MUTED, fontSize: 12.5 }}>
          {orders ? `${orders.length} fournisseur${orders.length > 1 ? "s" : ""} avec des produits à commander` : "Calcul…"}
          {urgents > 0 && <b style={{ color: "#b4443a" }}> · {urgents} urgent{urgents > 1 ? "s" : ""}</b>}
          {total > 0 && <> · {euros(total)} estimés</>}
          {calculeA && <> · calculé à {calculeA}</>}
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <Link href="/ingredients?tab=a_commander" style={{ ...BTN, display: "inline-flex", alignItems: "center", textDecoration: "none" }}>Produits sous le minimum →</Link>
          <button type="button" onClick={() => void charger()} disabled={chargement} style={{ ...BTN, opacity: chargement ? 0.6 : 1 }}>{chargement ? "Calcul…" : "Recalculer"}</button>
        </span>
      </div>

      {orders && orders.length === 0 && (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14 }}>
          <EtatVide icone="commande" titre="Rien à commander" texte="Le stock théorique couvre les prochaines livraisons. Les besoins viennent des minimums et objectifs de stock des produits." />
        </div>
      )}

      {orders && orders.map((o) => {
        const couleur = o.supplier_color ?? "#A0845C";
        const texte = couleurTexteSur(couleur);
        const ouvert = ouverts.has(o.supplier_id);
        const nbUrgents = o.lines.filter((l) => l.urgent).length;
        const franco = o.franco_minimum != null && o.franco_minimum > 0 ? (o.total_estimated >= o.franco_minimum ? "franco atteint" : `franco ${euros(o.franco_minimum)} : il manque ${euros(o.franco_minimum - o.total_estimated)}`) : null;
        return (
          <div key={o.supplier_id}>
            <button type="button" aria-expanded={ouvert} onClick={() => basculer(o.supplier_id)} className={`barre-categorie${ouvert ? " ouverte" : ""}`}
              style={{ ...styleBarreCategorie(couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouvert ? "14px 14px 0 0" : 14 }}>
              <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: texte }}>{o.supplier_name}</span>
              <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: texte, opacity: 0.7, marginLeft: -4 }}>{o.lines.length}</span>
              <span style={{ flex: 1, textAlign: "right", fontSize: 12, fontWeight: 500, color: texte, opacity: 0.9, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {[o.next_delivery_in != null ? `livraison dans ${o.next_delivery_in} j` : null, nbUrgents ? `${nbUrgents} urgent${nbUrgents > 1 ? "s" : ""}` : null, o.total_estimated > 0 ? euros(o.total_estimated) : null, franco].filter(Boolean).join(" · ")}
              </span>
              <span style={{ color: texte, fontSize: 12, opacity: 0.85, transform: ouvert ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
            </button>
            {ouvert && (
              <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: 0, borderRadius: "0 0 14px 14px", overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", minWidth: bureau ? 720 : 0, fontSize: 13 }}>
                  {bureau && (
                    <thead><tr>
                      <th style={{ ...TH, padding: 0, width: 4 }} /><th style={TH}>Produit</th>
                      <th style={{ ...TH, textAlign: "right" }}>Stock</th><th style={{ ...TH, textAlign: "right" }}>Conso / jour</th>
                      <th style={{ ...TH, textAlign: "right" }}>À la livraison</th><th style={{ ...TH, textAlign: "right" }}>À commander</th><th style={{ ...TH, textAlign: "right" }}>Coût estimé</th>
                    </tr></thead>
                  )}
                  <tbody>
                    {o.lines.map((l) => (
                      <tr key={l.ingredient_id} className="ct-ligne">
                        <td style={{ ...TD, padding: 0, width: 4, background: l.urgent ? "#b4443a" : couleur }} />
                        <td style={{ ...TD, minWidth: 180 }}>
                          <div style={{ fontWeight: 600 }}>{l.name}</div>
                          <div style={{ fontSize: 11.5, color: l.urgent ? "#b4443a" : MUTED }}>{l.urgent ? "urgent : sous le minimum à la livraison" : l.pack_label ?? ""}{!bureau && ` · stock ${fmtQte(l.current_stock)} ${l.unit}`}</div>
                        </td>
                        {bureau && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtQte(l.current_stock)} <span style={{ color: MUTED, fontSize: 12 }}>{l.unit}</span></td>}
                        {bureau && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.avg_daily > 0 ? "#1a1a1a" : FAIBLE }}>{l.avg_daily > 0 ? fmtQte(l.avg_daily) : "—"}</td>}
                        {bureau && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: l.urgent ? "#b4443a" : "#1a1a1a" }}>{fmtQte(l.stock_at_delivery)}</td>}
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                          <b style={{ fontFamily: OSWALD, fontSize: 16, color: l.urgent ? "#b4443a" : "#1a1a1a" }}>{fmtQte(l.qty_to_order)}</b> <span style={{ color: MUTED, fontSize: 12 }}>{l.unit}</span>
                        </td>
                        <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums", color: l.estimated_cost != null ? "#1a1a1a" : FAIBLE }}>{l.estimated_cost != null ? euros(l.estimated_cost) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
