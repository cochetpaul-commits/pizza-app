"use client";

import { useEffect, useMemo, useState } from "react";
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

  const fusionner = async (g: Group) => {
    const keepId = keep[g.cle] ?? defaultKeep(g);
    const others = g.rows.filter(r => r.id !== keepId);
    const keepRow = g.rows.find(r => r.id === keepId)!;
    if (!confirm(`Fusionner ${others.length} produit(s) dans « ${keepRow.name} » ?\nLes prix, lignes de recettes et mouvements sont réaffectés, les doublons supprimés.`)) return;
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
    } catch (e) {
      alert(`Fusion interrompue : ${e instanceof Error ? e.message : "erreur"}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 9998 }} />
      <div role="dialog" aria-label="Doublons probables" style={{
        position: "fixed", left: "50%", top: "50%", transform: "translate(-50%,-50%)",
        width: "min(720px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column",
        background: "#fff", borderRadius: 18, boxShadow: "0 12px 48px rgba(0,0,0,0.22)", zIndex: 9999, overflow: "hidden",
      }}>
        <div style={{ padding: "16px 20px 10px", borderBottom: "1px solid #eee4d4", display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
              Doublons probables
            </div>
            <div style={{ fontSize: 12, color: "#8d8577" }}>
              {loading ? "Recherche…" : `${groups.length} groupe(s) restant(s)${merged ? ` · ${merged} fusionné(s)` : ""}`} — même nom à l&apos;accent ou à l&apos;espace près
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" style={{ border: "none", background: "rgba(0,0,0,0.06)", width: 30, height: 30, borderRadius: "50%", cursor: "pointer", fontSize: 16 }}>×</button>
        </div>
        <div style={{ padding: "10px 20px" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer par nom…" style={{ width: "100%", padding: "9px 12px", border: "1px solid #ddd6c8", borderRadius: 10, fontSize: 14, fontFamily: "inherit" }} />
        </div>
        <div style={{ overflowY: "auto", padding: "0 20px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {err && <div style={{ color: "#a4442e", fontSize: 13 }}>{err}</div>}
          {!loading && groups.length === 0 && !err && (
            <div style={{ textAlign: "center", color: "#8d8577", padding: 30, fontSize: 14 }}>Aucun doublon probable. 🎉</div>
          )}
          {groups.map(g => {
            const keepId = keep[g.cle] ?? defaultKeep(g);
            return (
              <div key={g.cle} style={{ border: "1px solid #eee4d4", borderRadius: 14, padding: "10px 12px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.rows.map(r => (
                    <label key={r.id} style={{
                      display: "grid", gridTemplateColumns: "20px 1fr", gap: 10, alignItems: "start", cursor: "pointer",
                      padding: "6px 8px", borderRadius: 10, background: r.id === keepId ? "#eef3ec" : "transparent",
                    }}>
                      <input type="radio" name={`keep-${g.cle}`} checked={r.id === keepId} onChange={() => setKeep(prev => ({ ...prev, [g.cle]: r.id }))} style={{ marginTop: 3 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: r.is_active ? "#1a1a1a" : "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {r.name}{!r.is_active && <span style={{ fontSize: 11, marginLeft: 6, color: "#a4442e" }}>(désactivé)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#8d8577" }}>
                          {r.category ?? "sans catégorie"} · {r.nb_offres} prix actif{r.nb_offres > 1 ? "s" : ""}{r.fournisseurs ? ` (${r.fournisseurs})` : ""} · {r.nb_recettes} recette{r.nb_recettes > 1 ? "s" : ""} · dernier prix : {fmtDate(r.derniere_offre)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
                  <button type="button" onClick={() => setIgnored(prev => new Set(prev).add(g.cle))} disabled={busy === g.cle}
                    style={{ padding: "8px 14px", borderRadius: 10, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
                    Ce ne sont pas des doublons
                  </button>
                  <button type="button" onClick={() => fusionner(g)} disabled={busy !== null}
                    style={{ padding: "8px 16px", borderRadius: 10, border: "none", background: "#4a6741", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: busy && busy !== g.cle ? 0.5 : 1 }}>
                    {busy === g.cle ? "Fusion…" : "Fusionner dans le produit coché"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
