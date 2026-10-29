"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { CAT_COLORS, CAT_LABELS, type Category } from "@/types/ingredients";
import { couleurTexte } from "@/lib/styleCategories";
import { EtatVide } from "@/components/ui/EtatVide";
import { BON, BORD, BTN, CADRE, CHAMP, FAIBLE, MAUVAIS, MUTED, TD, TH, alpha, h1, liseret, pastille } from "@/components/ui/charte";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

/**
 * « Doublons probables » : produits dont le nom est identique une fois
 * normalisé (accents, casse, espaces). Pour chaque groupe on choisit le
 * produit à garder ; les autres sont fusionnés dedans via /api/ingredients/merge
 * (offres, lignes de recettes, mouvements… réaffectés, puis suppression).
 */

type Row = {
  cle: string; id: string; name: string; category: string | null; is_active: boolean;
  nb_offres: number; derniere_offre: string | null; nb_recettes: number; fournisseurs: string | null;
};
type Group = { cle: string; rows: Row[] };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR") : "jamais");

export function DuplicatesModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [merged, setMerged] = useState(0);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("ingredients_doublons");
      if (error) setErr(error.message);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  const groups = useMemo((): Group[] => {
    const map = new Map<string, Row[]>();
    for (const r of rows) { const arr = map.get(r.cle) ?? []; arr.push(r); map.set(r.cle, arr); }
    const low = q.trim().toLowerCase();
    return [...map.entries()]
      .map(([cle, rs]) => ({ cle, rows: rs }))
      .filter(g => !done.has(g.cle) && !ignored.has(g.cle))
      .filter(g => !low || g.rows.some(r => r.name.toLowerCase().includes(low)))
      .sort((a, b) => a.rows[0].name.localeCompare(b.rows[0].name, "fr"));
  }, [rows, q, done, ignored]);

  // Choix par défaut : actif, puis le plus d'offres, puis le plus de recettes, puis l'offre la plus récente
  const defaultKeep = (g: Group) => {
    const sorted = [...g.rows].sort((a, b) =>
      Number(b.is_active) - Number(a.is_active) || b.nb_offres - a.nb_offres || b.nb_recettes - a.nb_recettes
      || (b.derniere_offre ?? "").localeCompare(a.derniere_offre ?? ""));
    return sorted[0].id;
  };

  const fusionner = async (g: Group, sansConfirmation = false) => {
    const keepId = keep[g.cle] ?? defaultKeep(g);
    const others = g.rows.filter(r => r.id !== keepId);
    const keepRow = g.rows.find(r => r.id === keepId)!;
    if (!sansConfirmation && !confirm(`Fusionner ${others.length} produit(s) dans « ${keepRow.name} » ?\nLes prix, lignes de recettes et mouvements sont réaffectés, les doublons supprimés.`)) return false;
    setBusy(g.cle);
    try {
      for (const o of others) {
        const res = await fetchApi("/api/ingredients/merge", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keepId, deleteId: o.id }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.ok === false) throw new Error(json.error ?? `Erreur ${res.status}`);
      }
      setDone(prev => new Set(prev).add(g.cle));
      setMerged(m => m + others.length);
      onDone();
      return true;
    } catch (e) {
      alert(`Fusion interrompue : ${e instanceof Error ? e.message : "erreur"}`);
      return false;
    } finally {
      setBusy(null);
    }
  };
  /** Tout fusionner d'un coup (29/10/2026) : chaque groupe dans le produit coché, dans l'ordre affiché ; arrêt au premier échec */
  const [tout, setTout] = useState<{ fait: number; total: number } | null>(null);
  const fusionnerTout = async () => {
    const liste = groups;
    const nb = liste.reduce((t, g) => t + g.rows.length - 1, 0);
    if (!confirm(`Fusionner ${liste.length} groupe(s), soit ${nb} doublon(s), chacun dans le produit coché ?\nLes prix, lignes de recettes et mouvements sont réaffectés, les doublons supprimés.`)) return;
    setTout({ fait: 0, total: liste.length });
    for (let i = 0; i < liste.length; i++) {
      const ok = await fusionner(liste[i], true);
      if (!ok) break;
      setTout({ fait: i + 1, total: liste.length });
    }
    setTout(null);
  };

  const nbDoublons = groups.reduce((t, g) => t + g.rows.length - 1, 0);
  return (
    <>
      <style>{`.dbl-ligne:hover td{background:#f7f3ec}`}</style>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9998 }} />
      <div role="dialog" aria-label="Doublons probables" style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: "min(960px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: "#f2ede4", borderRadius: 16, boxShadow: "0 12px 48px rgba(0,0,0,0.22)", zIndex: 9999, overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ ...h1(false), fontSize: 22 }}>Doublons probables</div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>
              {loading ? "Recherche…" : `${groups.length} groupe${groups.length > 1 ? "s" : ""} · ${nbDoublons} doublon${nbDoublons > 1 ? "s" : ""}${merged ? ` · ${merged} fusionné${merged > 1 ? "s" : ""}` : ""}`} · même nom à l&apos;accent ou à l&apos;espace près
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ ...BTN, width: 32, height: 32, padding: 0, borderRadius: 999, fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: "0 20px 10px", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer par nom…" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 200px", minWidth: 0 }} />
          {groups.length > 1 && (
            <button type="button" onClick={() => void fusionnerTout()} disabled={busy !== null || tout !== null}
              style={{ ...BTN, background: BON, borderColor: BON, color: "#fff", fontWeight: 700, opacity: busy !== null || tout !== null ? 0.6 : 1 }}>
              {tout ? `Fusion ${tout.fait} / ${tout.total}…` : `Tout fusionner (${groups.length})`}
            </button>
          )}
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 20px" }}>
          {err && <div style={{ color: MAUVAIS, fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <div style={CADRE}>
            {!loading && groups.length === 0 && !err && <EtatVide icone="produit" titre="Aucun doublon probable" texte="Tous les noms de produits sont distincts." />}
            {groups.length > 0 && (
              <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                <colgroup><col style={{ width: 6 }} /><col style={{ width: 40 }} /><col /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col style={{ width: 90 }} /><col style={{ width: 110 }} /></colgroup>
                <thead><tr>
                  <th style={{ ...TH, padding: 0 }} /><th style={{ ...TH, padding: 0 }} /><th style={TH}>Produit</th><th style={TH}>Catégorie</th><th style={TH}>Prix actif</th><th style={{ ...TH, textAlign: "right" }}>Recettes</th><th style={{ ...TH, textAlign: "right" }}>Dernier prix</th>
                </tr></thead>
                <tbody>
                  {groups.map((g) => {
                    const keepId = keep[g.cle] ?? defaultKeep(g);
                    const couleur = CAT_COLORS[(g.rows[0].category ?? "") as Category] ?? FAIBLE;
                    return (
                      <Fragment key={g.cle}>
                        {g.rows.map((r) => {
                          const garde = r.id === keepId;
                          return (
                            <tr key={r.id} className="dbl-ligne" onClick={() => setKeep(prev => ({ ...prev, [g.cle]: r.id }))} style={{ cursor: "pointer", background: garde ? "#f4f6f1" : undefined }}>
                              <td style={liseret(couleur)} />
                              <td style={{ ...TD, padding: "9px 0 9px 12px" }}><input type="radio" name={`keep-${g.cle}`} checked={garde} onChange={() => setKeep(prev => ({ ...prev, [g.cle]: r.id }))} style={{ accentColor: BON, width: 16, height: 16, cursor: "pointer" }} /></td>
                              <td style={{ ...TD, minWidth: 0 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                  <span style={{ fontWeight: garde ? 700 : 600, color: r.is_active ? "#1a1a1a" : MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
                                  {garde && <span style={pastille(BON)}>à garder</span>}
                                  {!r.is_active && <span style={pastille(MUTED, "rgba(0,0,0,0.06)")}>Désactivé</span>}
                                </div>
                              </td>
                              <td style={TD}>{r.category ? <span style={pastille(couleurTexte(couleur), alpha(couleur, 0.14))}>{CAT_LABELS[r.category as Category] ?? r.category}</span> : <span style={{ color: FAIBLE }}>—</span>}</td>
                              <td style={{ ...TD, color: r.nb_offres ? "#1a1a1a" : FAIBLE, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.nb_offres ? `${r.nb_offres}${r.fournisseurs ? ` · ${r.fournisseurs}` : ""}` : "aucun"}</td>
                              <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.nb_recettes ? "#1a1a1a" : FAIBLE }}>{r.nb_recettes}</td>
                              <td style={{ ...TD, textAlign: "right", color: MUTED, whiteSpace: "nowrap" }}>{fmtDate(r.derniere_offre)}</td>
                            </tr>
                          );
                        })}
                        <tr>
                          <td style={{ ...liseret("transparent"), borderBottom: `1px solid ${BORD}` }} />
                          <td colSpan={6} style={{ ...TD, borderBottom: `1px solid ${BORD}`, padding: "8px 14px 12px", background: "#faf7f1" }}>
                            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
                              <button type="button" onClick={() => setIgnored(prev => new Set(prev).add(g.cle))} disabled={busy === g.cle} style={{ ...BTN, color: MUTED }}>Ce ne sont pas des doublons</button>
                              <button type="button" onClick={() => void fusionner(g)} disabled={busy !== null || tout !== null} style={{ ...BTN, background: BON, borderColor: BON, color: "#fff", fontWeight: 700, opacity: busy && busy !== g.cle ? 0.5 : 1 }}>
                                {busy === g.cle ? "Fusion…" : "Fusionner dans le produit coché"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
