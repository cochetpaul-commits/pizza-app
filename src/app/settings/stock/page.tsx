"use client";

import { useState, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import { OSWALD } from "@/components/TuileProduit";

/**
 * Réglages › Stock et doses (déplacés depuis la page Stock le 10/10/2026) :
 * recalcul des sorties de stock depuis les ventes Popina, et doses automatiques
 * (touche de caisse → quantité du produit). Bello Mio seulement : Piccola Mia n'a pas Popina.
 */

type Suggestion = { popina_product_id: string; popina_name: string; popina_category: string; ingredient_id: string; ingredient_name: string; suggested_dose: number; suggested_unit: string; rule: string };

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const CARD: CSSProperties = { background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "16px 18px" };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const H2: CSSProperties = { fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: ".03em", margin: "0 0 4px", color: "#1a1a1a" };

export default function Page() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Contenu />
    </RequireRole>
  );
}

function Contenu() {
  const { current: etab } = useEtablissement();
  const popina = !etab?.slug?.includes("piccola");
  const [synchro, setSynchro] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [chargement, setChargement] = useState(false);
  const [application, setApplication] = useState(false);

  async function synchroniser() {
    setSynchro(true); setMessage(null);
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const res = await fetchApi("/api/stock/sync-ventes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date_from: from, date_to: to }) });
    if (res.ok) {
      const d = await res.json();
      setMessage(`${d.ingredients_impacted} produits impactés (${d.matched_products} touches reconnues, ${d.unmatched_products} sans correspondance).`);
    } else setMessage("La synchronisation a échoué.");
    setSynchro(false);
  }

  async function proposerDoses() {
    setChargement(true);
    const res = await fetchApi("/api/stock/auto-doses");
    setSuggestions(res.ok ? ((await res.json()) as Suggestion[]) : []);
    setChargement(false);
  }

  async function appliquerDoses() {
    if (!suggestions?.length) return;
    setApplication(true);
    const entries = suggestions.map((s) => ({ popina_product_id: s.popina_product_id, ingredient_id: s.ingredient_id, dose: s.suggested_dose, dose_unit: s.suggested_unit }));
    await fetchApi("/api/stock/auto-doses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ entries }) });
    setApplication(false);
    setMessage(`${entries.length} doses appliquées.`);
    setSuggestions(null);
  }

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 60px", display: "grid", gap: 14 }}>
      <div>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 26, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, color: "#1a1a1a" }}>Stock et doses</h1>
        <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Le stock théorique vit dans la Base produits : dernier inventaire clôturé + réceptions − ventes. Ici, les réglages qui le font tourner.</div>
      </div>

      {message && <div style={{ padding: "10px 14px", borderRadius: 12, background: "rgba(74,103,65,0.1)", color: "#4a6741", fontSize: 13, fontWeight: 600 }}>{message}</div>}

      {!popina ? (
        <div style={CARD}><div style={{ fontSize: 13, color: MUTED }}>Piccola Mia n&apos;utilise pas Popina : les sorties de stock ne sont pas calculées à partir des ventes pour cet établissement.</div></div>
      ) : (
        <>
          <div style={CARD}>
            <h2 style={H2}>Sorties de stock depuis les ventes</h2>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Chaque nuit, les ventes Popina de la veille sont décomposées (fiches techniques, doses) en sorties de stock. Ce bouton recalcule les 30 derniers jours, par exemple après avoir corrigé des fiches ou des doses.</div>
            <button type="button" onClick={() => void synchroniser()} disabled={synchro} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700, opacity: synchro ? 0.6 : 1 }}>{synchro ? "Recalcul…" : "Recalculer les 30 derniers jours"}</button>
          </div>

          <div style={CARD}>
            <h2 style={H2}>Doses automatiques</h2>
            <div style={{ fontSize: 13, color: MUTED, marginBottom: 12 }}>Pour les touches de caisse reliées à un produit sans dose (verre de vin, spiritueux, soft), une dose est proposée d&apos;après le nom et la contenance. Vous vérifiez la liste avant d&apos;appliquer.</div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => void proposerDoses()} disabled={chargement} style={{ ...BTN, opacity: chargement ? 0.6 : 1 }}>{chargement ? "Analyse…" : "Proposer des doses"}</button>
              {suggestions && suggestions.length > 0 && <button type="button" onClick={() => void appliquerDoses()} disabled={application} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700, opacity: application ? 0.6 : 1 }}>{application ? "Application…" : `Appliquer ${suggestions.length} dose${suggestions.length > 1 ? "s" : ""}`}</button>}
            </div>
            {suggestions && (
              suggestions.length === 0 ? <div style={{ fontSize: 13, color: MUTED, marginTop: 12 }}>Toutes les doses sont déjà renseignées.</div> : (
                <div style={{ marginTop: 12, border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
                    <thead><tr>
                      <th style={{ textAlign: "left", padding: "8px 12px" }}>Touche de caisse</th><th style={{ textAlign: "left", padding: "8px 12px" }}>Produit</th><th style={{ textAlign: "right", padding: "8px 12px" }}>Dose proposée</th><th style={{ textAlign: "left", padding: "8px 12px" }}>Règle</th>
                    </tr></thead>
                    <tbody>
                      {suggestions.map((s) => (
                        <tr key={s.popina_product_id}>
                          <td style={{ padding: "8px 12px", fontWeight: 600 }}>{s.popina_name}</td>
                          <td style={{ padding: "8px 12px", color: MUTED }}>{s.ingredient_name}</td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{s.suggested_dose} {s.suggested_unit}</td>
                          <td style={{ padding: "8px 12px", color: MUTED, fontSize: 12 }}>{s.rule}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
}
