"use client";

import { useState } from "react";
import { OSWALD } from "@/components/TuileProduit";
import { desactiverProduits } from "@/lib/produitsActifs";

/**
 * Après la clôture d'un inventaire (10/10/2026) : les produits actifs qui n'ont pas été comptés
 * sont proposés à la désactivation. Ainsi le prochain inventaire repart des produits réellement
 * suivis, et on ajoute ceux qui manquent, au lieu de retirer à chaque fois.
 */
export function ModalNonComptes({ produits, onFermer, onFait }: {
  produits: { id: string; nom: string }[];
  onFermer: () => void;
  onFait: (nb: number) => void;
}) {
  const [coches, setCoches] = useState<Set<string>>(() => new Set(produits.map((p) => p.id)));
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const tous = coches.size === produits.length;

  async function desactiver() {
    if (coches.size === 0) return;
    setEnCours(true); setErreur(null);
    const err = await desactiverProduits([...coches]);
    setEnCours(false);
    if (err) { setErreur(err); return; }
    onFait(coches.size);
  }

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
        <div style={{ padding: "18px 20px 12px", borderBottom: "1px solid #ddd6c8" }}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20, textTransform: "uppercase", letterSpacing: ".02em", color: "#1a1a1a" }}>Inventaire clôturé</div>
          <div style={{ fontSize: 13, color: "#6f6a61", marginTop: 4 }}>
            {produits.length} produit{produits.length > 1 ? "s" : ""} actif{produits.length > 1 ? "s" : ""} n&apos;{produits.length > 1 ? "ont" : "a"} pas été compté{produits.length > 1 ? "s" : ""}.
            Les mettre inactifs les retire des listes, des commandes et du prochain inventaire ; ils se réactivent en un clic dans la Base produits.
          </div>
        </div>
        <div style={{ padding: "6px 20px 0", display: "flex", alignItems: "center", gap: 8 }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: "#6f6a61", cursor: "pointer" }}>
            <input type="checkbox" checked={tous} onChange={() => setCoches(tous ? new Set() : new Set(produits.map((p) => p.id)))} style={{ accentColor: "#D4775A" }} />
            {tous ? "Tout décocher" : "Tout cocher"}
          </label>
          <span style={{ marginLeft: "auto", fontSize: 12.5, color: "#6f6a61" }}>{coches.size} sélectionné{coches.size > 1 ? "s" : ""}</span>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 20px 10px" }}>
          {produits.map((p) => (
            <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f0ebe2", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={coches.has(p.id)} onChange={() => setCoches((s) => { const n = new Set(s); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); return n; })} style={{ accentColor: "#D4775A", width: 15, height: 15 }} />
              <span style={{ fontWeight: coches.has(p.id) ? 600 : 400, color: coches.has(p.id) ? "#1a1a1a" : "#6f6a61" }}>{p.nom}</span>
            </label>
          ))}
        </div>
        {erreur && <div style={{ margin: "0 20px 8px", padding: "8px 12px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: "#b4443a", fontSize: 12.5 }}>{erreur}</div>}
        <div style={{ padding: "12px 20px", borderTop: "1px solid #ddd6c8", display: "flex", gap: 8, justifyContent: "flex-end", paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}>
          <button type="button" onClick={onFermer} style={{ height: 38, padding: "0 14px", borderRadius: 10, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a" }}>Garder actifs</button>
          <button type="button" onClick={() => void desactiver()} disabled={enCours || coches.size === 0} style={{ height: 38, padding: "0 16px", borderRadius: 10, border: "none", background: "#1a1a1a", color: "#f2ede4", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: enCours || coches.size === 0 ? 0.6 : 1 }}>
            {enCours ? "Mise à jour…" : `Mettre inactifs (${coches.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
