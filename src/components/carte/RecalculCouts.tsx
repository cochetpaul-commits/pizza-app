"use client";

import React, { useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { BORD, MUTED, FAIBLE, BON, ATTENTION, MAUVAIS, OSWALD, BTN, TH, TD, pastille } from "@/components/ui/charte";

/**
 * Recalcul des coûts de toutes les fiches (25/11/2026) : la liste de ce qui change d'abord, puis « Appliquer ».
 * Prix d'achat du jour, même règle que la fiche ouverte ; poids et coût au kilo enregistrés au passage.
 */
type Changement = { id: string; nom: string; etablissements: string[]; avant: { total: number | null; poids: number | null; kg: number | null }; apres: { total: number; poids: number; kg: number | null }; ecart_pct: number | null; ignoree: boolean };

const eur = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`);
const poids = (g: number | null) => (!g ? "—" : g >= 1000 ? `${(g / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : `${Math.round(g)} g`);

export function RecalculCouts({ onFermer, onApplique }: { onFermer: () => void; onApplique: () => void }) {
  const [etat, setEtat] = useState<"chargement" | "pret" | "application" | "fait" | "erreur">("chargement");
  const [nbFiches, setNbFiches] = useState(0);
  const [changements, setChangements] = useState<Changement[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetchApi("/api/fiches/recalcul");
        const j = await r.json();
        if (annule) return;
        if (!r.ok) { setMessage(j.error ?? "Erreur"); setEtat("erreur"); return; }
        setNbFiches(j.nbFiches); setChangements(j.changements); setEtat("pret");
      } catch (e) { if (!annule) { setMessage(e instanceof Error ? e.message : "Erreur"); setEtat("erreur"); } }
    })();
    return () => { annule = true; };
  }, []);

  async function appliquer() {
    setEtat("application");
    try {
      const r = await fetchApi("/api/fiches/recalcul", { method: "POST" });
      const j = await r.json();
      if (!r.ok) { setMessage(j.error ?? "Erreur"); setEtat("erreur"); return; }
      setMessage(`${j.ecrites} fiche${j.ecrites > 1 ? "s" : ""} mise${j.ecrites > 1 ? "s" : ""} à jour${j.ignorees ? `, ${j.ignorees} laissée${j.ignorees > 1 ? "s" : ""} de côté (ingrédients sans prix)` : ""}.${j.echecs?.length ? ` Échecs : ${j.echecs.join(" ; ")}` : ""}`);
      setEtat("fait");
      onApplique();
    } catch (e) { setMessage(e instanceof Error ? e.message : "Erreur"); setEtat("erreur"); }
  }

  const aEcrire = changements.filter((c) => !c.ignoree);
  const gros = aEcrire.filter((c) => c.ecart_pct == null || Math.abs(c.ecart_pct) >= 10).length;

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, background: "rgba(26,26,26,0.35)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 14 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 820, maxHeight: "88vh", display: "flex", flexDirection: "column", boxShadow: "0 10px 40px rgba(0,0,0,0.18)" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORD}` }}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20, textTransform: "uppercase" }}>Recalculer les coûts</div>
          <div style={{ color: MUTED, fontSize: 13 }}>Prix d&apos;achat du jour, même calcul que la fiche ouverte. Le poids et le coût au kilo sont enregistrés au passage.</div>
        </div>
        <div style={{ padding: "12px 20px", overflow: "auto", flex: 1 }}>
          {etat === "chargement" && <div style={{ padding: 30, textAlign: "center", color: MUTED }}>Calcul en cours…</div>}
          {etat === "erreur" && <div style={{ color: MAUVAIS, fontSize: 13 }}>{message}</div>}
          {etat === "fait" && <div style={{ color: BON, fontSize: 14, fontWeight: 600 }}>{message}</div>}
          {(etat === "pret" || etat === "application") && (
            changements.length === 0 ? <div style={{ padding: 20, textAlign: "center", color: MUTED }}>Les {nbFiches} fiches sont déjà à jour.</div> : (
              <>
                <div style={{ fontSize: 13, marginBottom: 10 }}>
                  <b>{aEcrire.length}</b> fiche{aEcrire.length > 1 ? "s" : ""} sur {nbFiches} changent, dont <b>{gros}</b> de plus de 10 % (en haut de la liste).
                  {changements.length > aEcrire.length && <> {changements.length - aEcrire.length} resteront telles quelles : leur nouveau coût tomberait à zéro (ingrédients sans prix).</>}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead><tr><th style={TH}>Fiche</th><th style={{ ...TH, textAlign: "right" }}>Coût recette</th><th style={{ ...TH, textAlign: "right" }}>Écart</th><th style={{ ...TH, textAlign: "right" }}>Poids</th><th style={{ ...TH, textAlign: "right" }}>Coût au kilo</th></tr></thead>
                  <tbody>
                    {changements.map((c) => {
                      const couleur = c.ignoree ? FAIBLE : c.ecart_pct == null ? "#1a1a1a" : Math.abs(c.ecart_pct) >= 25 ? MAUVAIS : Math.abs(c.ecart_pct) >= 10 ? ATTENTION : MUTED;
                      return (
                        <tr key={c.id} style={{ opacity: c.ignoree ? 0.6 : 1 }}>
                          <td style={TD}>{c.nom}{c.ignoree && <> <span style={pastille(FAIBLE)}>non touchée</span></>}</td>
                          <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}><span style={{ color: FAIBLE }}>{eur(c.avant.total)}</span> → <b>{eur(c.apres.total)}</b></td>
                          <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", color: couleur, fontWeight: 600 }}>{c.ecart_pct == null ? "—" : `${c.ecart_pct > 0 ? "+" : ""}${c.ecart_pct.toLocaleString("fr-FR")} %`}</td>
                          <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{c.avant.poids !== c.apres.poids ? <><span style={{ color: FAIBLE }}>{poids(c.avant.poids)}</span> → </> : null}{poids(c.apres.poids)}</td>
                          <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{c.apres.kg != null ? `${eur(c.apres.kg)} / kg` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${BORD}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onFermer} style={BTN}>{etat === "fait" ? "Fermer" : "Annuler"}</button>
          {(etat === "pret" || etat === "application") && aEcrire.length > 0 && (
            <button type="button" disabled={etat === "application"} onClick={appliquer} style={{ ...BTN, background: BON, borderColor: BON, color: "#fff", opacity: etat === "application" ? 0.6 : 1 }}>
              {etat === "application" ? "Mise à jour…" : `Appliquer aux ${aEcrire.length} fiches`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
