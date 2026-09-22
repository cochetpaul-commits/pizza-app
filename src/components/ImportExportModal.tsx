"use client";

import { useState } from "react";
import { fetchApi } from "@/lib/fetchApi";

type Chg = { id: string | null; ligne: number; nom: string; nouveau: boolean; champs: Record<string, { avant: unknown; apres: unknown }> };
type Err = { ligne: number; nom: string; message: string };
type Preview = { lignes: number; a_modifier: number; a_creer: number; changements: Chg[]; erreurs: Err[] };

const LIBELLES: Record<string, string> = {
  name: "Nom", is_active: "Actif", establishments: "Établissements", category: "Catégorie", sub_category: "Sous-catégorie",
  purchase_price: "Prix d'achat", purchase_unit_label: "Unité d'achat", purchase_unit: "Contenu unité d'achat",
  order_unit_label: "Conditionnement", order_quantity: "Qté / conditionnement", default_unit: "Unité de base",
  piece_weight_g: "Poids pièce (g)", piece_volume_ml: "Volume pièce (ml)", density_g_per_ml: "Densité",
  storage_zone: "Zone", storage_zone_2: "Zone 2", stock_min: "Stock mini", stock_objectif: "Stock objectif", stock_max: "Stock maxi",
  favori_commande: "Favori", status: "Statut", allergens: "Allergènes", popina_name: "Nom Popina",
};
const fmt = (v: unknown) => v === null || v === undefined || v === "" ? "—" : Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "oui" : "non") : String(v);

export function ImportExportModal({ etabSlug, onClose, onDone }: { etabSlug: string; onClose: () => void; onDone: () => void }) {
  const monEtab = etabSlug.includes("piccola") ? "piccola" : "bellomio";
  const [busy, setBusy] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<{ modifies: number; crees: number; echecs: Err[] } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function exporter(etab: string, inactifs: boolean) {
    setBusy("export"); setMsg(null);
    try {
      const res = await fetchApi(`/api/ingredients/export?etab=${etab}&inactifs=${inactifs ? 1 : 0}`);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `base-produits-${etab}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
    } catch { setMsg("L'export a échoué. Réessaie dans un instant."); }
    setBusy(null);
  }

  async function analyser(f: File) {
    setBusy("preview"); setMsg(null); setPreview(null); setResult(null);
    const fd = new FormData(); fd.append("file", f); fd.append("mode", "preview"); fd.append("etab", monEtab);
    try {
      const res = await fetchApi("/api/ingredients/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) { setMsg(j.error ?? "Fichier refusé"); } else setPreview(j as Preview);
    } catch { setMsg("Impossible d'analyser le fichier."); }
    setBusy(null);
  }

  async function appliquer() {
    if (!file || !preview) return;
    const n = preview.a_modifier + preview.a_creer;
    if (!confirm(`Appliquer ${preview.a_modifier} modification${preview.a_modifier > 1 ? "s" : ""}${preview.a_creer ? ` et créer ${preview.a_creer} produit${preview.a_creer > 1 ? "s" : ""}` : ""} ? (${n} ligne${n > 1 ? "s" : ""})`)) return;
    setBusy("commit");
    const fd = new FormData(); fd.append("file", file); fd.append("mode", "commit"); fd.append("etab", monEtab);
    try {
      const res = await fetchApi("/api/ingredients/import", { method: "POST", body: fd });
      const j = await res.json();
      if (!res.ok) setMsg(j.error ?? "Import refusé"); else { setResult(j); setPreview(null); onDone(); }
    } catch { setMsg("L'import a échoué en cours de route : vérifie la liste, puis réimporte le même fichier (les lignes déjà passées ne bougeront plus)."); }
    setBusy(null);
  }

  const btn = (primary = false): React.CSSProperties => ({ padding: "9px 14px", borderRadius: 10, border: primary ? "none" : "1.5px solid #e5ddd0", background: primary ? "#D4775A" : "#fff", color: primary ? "#fff" : "#1a1a1a", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(20,15,8,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "#fffdf9", borderRadius: 20, width: "100%", maxWidth: 760, maxHeight: "92vh", overflow: "auto", padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,.25)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", fontSize: 18, textTransform: "uppercase", letterSpacing: ".04em" }}>Import / Export Excel</h2>
          <button onClick={onClose} aria-label="Fermer" style={{ border: "none", background: "#f0ebe2", borderRadius: 999, width: 30, height: 30, cursor: "pointer", fontSize: 16 }}>×</button>
        </div>

        <section style={{ border: "1px solid #e5ddd0", borderRadius: 14, padding: 14, marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a7a62", marginBottom: 8 }}>1 · Exporter</div>
          <p style={{ margin: "0 0 10px", fontSize: 13, color: "#6f6656" }}>Un classeur Excel avec une ligne par produit : catégorie, sous-catégorie, conditionnement, prix, zones de stockage, stocks… Trie et corrige dans Excel, puis réimporte le même fichier.</p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button style={btn(true)} disabled={!!busy} onClick={() => exporter(monEtab, false)}>{busy === "export" ? "Préparation…" : monEtab === "piccola" ? "Piccola Mia" : "Bello Mio"}</button>
            <button style={btn()} disabled={!!busy} onClick={() => exporter("tous", false)}>Les deux établissements</button>
            <button style={btn()} disabled={!!busy} onClick={() => exporter("tous", true)}>Tout, inactifs inclus</button>
          </div>
        </section>

        <section style={{ border: "1px solid #e5ddd0", borderRadius: 14, padding: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".1em", textTransform: "uppercase", color: "#8a7a62", marginBottom: 8 }}>2 · Réimporter</div>
          <input type="file" accept=".xlsx,.xls,.csv" disabled={!!busy} onChange={(e) => { const f = e.target.files?.[0] ?? null; setFile(f); if (f) void analyser(f); }} style={{ fontSize: 13 }} />
          {busy === "preview" && <p style={{ fontSize: 13, color: "#6f6656" }}>Analyse du fichier…</p>}
          {msg && <p style={{ fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>{msg}</p>}

          {preview && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}><strong>{preview.lignes}</strong> lignes lues</span>
                <span style={{ fontSize: 13, color: "#2f7a4a" }}><strong>{preview.a_modifier}</strong> à modifier</span>
                <span style={{ fontSize: 13, color: "#3f6a8a" }}><strong>{preview.a_creer}</strong> à créer</span>
                <span style={{ fontSize: 13, color: preview.erreurs.length ? "#b91c1c" : "#6f6656" }}><strong>{preview.erreurs.length}</strong> avertissement{preview.erreurs.length > 1 ? "s" : ""}</span>
              </div>
              {preview.erreurs.length > 0 && (
                <div style={{ background: "#fbe6e3", borderRadius: 10, padding: "8px 12px", marginBottom: 10, maxHeight: 140, overflow: "auto", fontSize: 12.5 }}>
                  {preview.erreurs.slice(0, 60).map((e, i) => <div key={i}>Ligne {e.ligne} · {e.nom || "—"} : {e.message}</div>)}
                  {preview.erreurs.length > 60 && <div>… et {preview.erreurs.length - 60} autres</div>}
                  <div style={{ marginTop: 4, color: "#7a2e26" }}>Les cellules signalées sont ignorées ; le reste de la ligne est appliqué.</div>
                </div>
              )}
              {preview.a_modifier + preview.a_creer === 0 ? (
                <p style={{ fontSize: 13, color: "#6f6656" }}>Aucune différence avec la base : rien à appliquer.</p>
              ) : (
                <>
                  <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid #e5ddd0", borderRadius: 10 }}>
                    {preview.changements.map((c) => (
                      <div key={`${c.id ?? "new"}-${c.ligne}`} style={{ padding: "8px 12px", borderBottom: "1px dashed #e5ddd0", fontSize: 12.5 }}>
                        <div style={{ fontWeight: 700 }}>{c.nouveau && <span style={{ color: "#3f6a8a", marginRight: 6 }}>NOUVEAU</span>}{c.nom} <span style={{ color: "#999", fontWeight: 400 }}>· ligne {c.ligne}</span></div>
                        {Object.entries(c.champs).map(([k, v]) => (
                          <div key={k} style={{ color: "#4a4030" }}>{LIBELLES[k] ?? k} : <span style={{ color: "#999", textDecoration: "line-through" }}>{fmt(v.avant)}</span> → <strong>{fmt(v.apres)}</strong></div>
                        ))}
                      </div>
                    ))}
                    {preview.a_modifier + preview.a_creer > preview.changements.length && <div style={{ padding: 10, fontSize: 12, color: "#6f6656" }}>… aperçu limité aux {preview.changements.length} premières lignes, tout sera appliqué.</div>}
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
                    <button style={btn()} disabled={!!busy} onClick={() => { setPreview(null); setFile(null); }}>Annuler</button>
                    <button style={btn(true)} disabled={!!busy} onClick={appliquer}>{busy === "commit" ? "Application…" : "Appliquer les modifications"}</button>
                  </div>
                </>
              )}
            </div>
          )}

          {result && (
            <div style={{ marginTop: 12, background: result.echecs.length ? "#fbf0dc" : "#e6f2e9", borderRadius: 10, padding: "10px 12px", fontSize: 13 }}>
              <strong>{result.modifies}</strong> produit{result.modifies > 1 ? "s" : ""} modifié{result.modifies > 1 ? "s" : ""}{result.crees ? <>, <strong>{result.crees}</strong> créé{result.crees > 1 ? "s" : ""}</> : null}.
              {result.echecs.length > 0 && <div style={{ marginTop: 6, color: "#7a2e26" }}>{result.echecs.length} ligne{result.echecs.length > 1 ? "s" : ""} refusée{result.echecs.length > 1 ? "s" : ""} : {result.echecs.slice(0, 5).map((e) => `L${e.ligne} ${e.nom} (${e.message})`).join(" · ")}</div>}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
