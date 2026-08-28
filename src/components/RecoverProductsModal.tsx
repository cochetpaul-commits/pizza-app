"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";

/**
 * « Récupérer un produit supprimé » : liste ce qui apparaît sur les factures
 * mais manque dans la Base produits (supprimé par erreur), et les produits
 * désactivés. Cocher → recréation avec le dernier prix facturé / réactivation.
 */

type Disparu = { sku: string | null; name: string; supplier_id: string; supplier_name: string; derniere: string | null; occurrences: number; dernier_prix: number | null; unite: string | null };
type Inactif = { id: string; name: string; supplier: string | null; category: string | null };

const fmtPrix = (p: number | null, u: string | null) => (p == null ? "—" : `${Number(p).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €${u ? `/${u}` : ""}`);

export function RecoverProductsModal({ etabId, onClose, onDone }: { etabId?: string | null; onClose: () => void; onDone: () => void }) {
  const [disparus, setDisparus] = useState<Disparu[]>([]);
  const [inactifs, setInactifs] = useState<Inactif[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selInactifs, setSelInactifs] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetchApi(`/api/ingredients/recuperer${etabId ? `?etablissement_id=${etabId}` : ""}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });
        const json = await res.json();
        if (json.error) setErr(json.error);
        setDisparus(json.disparus ?? []);
        setInactifs(json.inactifs ?? []);
      } catch {
        setErr("Chargement impossible");
      }
      setLoading(false);
    })();
  }, [etabId]);

  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibles = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return disparus;
    return disparus.filter(d => norm(d.name).includes(nq) || norm(d.supplier_name).includes(nq));
  }, [disparus, q]);
  const visiblesInactifs = useMemo(() => {
    const nq = norm(q.trim());
    if (!nq) return inactifs;
    return inactifs.filter(i => norm(i.name).includes(nq) || norm(i.supplier ?? "").includes(nq));
  }, [inactifs, q]);

  const keyOf = (d: Disparu) => `${d.supplier_id}|${d.name}`;
  const toggle = (k: string, set: Set<string>, setter: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(k)) next.delete(k); else next.add(k);
    setter(next);
  };

  const recuperer = async () => {
    if (sel.size === 0 && selInactifs.size === 0) return;
    setSaving(true);
    try {
      const items = disparus.filter(d => sel.has(keyOf(d))).map(d => ({ sku: d.sku, name: d.name, supplier_id: d.supplier_id }));
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetchApi("/api/ingredients/recuperer", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token ?? ""}` },
        body: JSON.stringify({ items, reactiver: [...selInactifs] }),
      });
      const json = await res.json();
      if (!json.ok) { alert(`Erreur : ${json.error ?? "inconnue"}`); setSaving(false); return; }
      const msg = [
        json.crees > 0 ? `${json.crees} produit${json.crees > 1 ? "s" : ""} recréé${json.crees > 1 ? "s" : ""} (statut « À contrôler »)` : null,
        json.reactives > 0 ? `${json.reactives} réactivé${json.reactives > 1 ? "s" : ""}` : null,
      ].filter(Boolean).join(" · ");
      alert(msg || "Rien à faire.");
      onDone();
      onClose();
    } catch {
      alert("Erreur réseau");
      setSaving(false);
    }
  };

  const ROW: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #f0ebe3", fontSize: 13 };

  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.35)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "min(680px, 100%)", maxHeight: "86dvh", display: "flex", flexDirection: "column", boxShadow: "0 18px 50px rgba(0,0,0,0.25)" }}>
        <div style={{ padding: "16px 18px 10px", borderBottom: "1px solid #ece4d4" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>🛟 Récupérer un produit supprimé</span>
            <button type="button" onClick={onClose} style={{ border: "none", background: "rgba(0,0,0,0.06)", width: 28, height: 28, borderRadius: "50%", cursor: "pointer", color: "#666", fontWeight: 700 }}>✕</button>
          </div>
          <p style={{ fontSize: 12, color: "#8a8378", margin: "6px 0 10px" }}>
            Produits vus sur tes factures mais absents de la Base produits, et produits désactivés. Coche puis « Récupérer » : recréation avec le dernier prix facturé, statut « À contrôler ».
          </p>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer par nom ou fournisseur…"
            style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" }} />
        </div>

        <div style={{ overflowY: "auto", padding: "6px 18px", flex: 1 }}>
          {loading && <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 24 }}>Chargement…</p>}
          {err && <p style={{ color: "#DC2626", fontSize: 13 }}>{err}</p>}

          {!loading && visiblesInactifs.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#b45309", textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 2px" }}>Désactivés — réactivables tels quels</div>
              {visiblesInactifs.map(i => (
                <label key={i.id} style={{ ...ROW, cursor: "pointer" }}>
                  <input type="checkbox" checked={selInactifs.has(i.id)} onChange={() => toggle(i.id, selInactifs, setSelInactifs)} />
                  <span style={{ flex: 1, fontWeight: 600, color: "#1a1a1a" }}>{i.name}</span>
                  <span style={{ fontSize: 11, color: "#999" }}>{i.supplier ?? ""}</span>
                </label>
              ))}
            </>
          )}

          {!loading && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#2D6A4F", textTransform: "uppercase", letterSpacing: 0.5, margin: "14px 0 2px" }}>
                Sur les factures mais plus dans la base ({visibles.length})
              </div>
              {visibles.length === 0 && <p style={{ color: "#999", fontSize: 12.5, padding: "8px 0" }}>Rien à récupérer 👌</p>}
              {visibles.map(d => (
                <label key={keyOf(d)} style={{ ...ROW, cursor: "pointer" }}>
                  <input type="checkbox" checked={sel.has(keyOf(d))} onChange={() => toggle(keyOf(d), sel, setSel)} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{d.name}</span>
                    <span style={{ display: "block", fontSize: 11, color: "#999" }}>
                      {d.supplier_name} · vu {d.occurrences}× {d.derniere ? `· dernière le ${new Date(d.derniere + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}` : ""}
                    </span>
                  </span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{fmtPrix(d.dernier_prix, d.unite)}</span>
                </label>
              ))}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid #ece4d4", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 12, color: "#8a8378" }}>{sel.size + selInactifs.size} sélectionné{sel.size + selInactifs.size > 1 ? "s" : ""}</span>
          <button type="button" onClick={recuperer} disabled={saving || (sel.size === 0 && selInactifs.size === 0)}
            style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "#2D6A4F", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving || (sel.size === 0 && selInactifs.size === 0) ? 0.5 : 1 }}>
            {saving ? "Récupération…" : "Récupérer la sélection"}
          </button>
        </div>
      </div>
    </div>
  );
}
