"use client";

import { useEffect } from "react";
import { useTablette, verrouillerTablette } from "@/lib/tablette/store";

/**
 * Qui est connecté sur la tablette + « Changer d'employé ». Monté dans les barres du haut.
 * Porte aussi le verrouillage automatique : sans activité pendant le délai réglé, l'employé est déconnecté.
 */
export function EmployeTabletteBouton({ compact }: { compact?: boolean }) {
  const t = useTablette();
  const actif = t.actif && !!t.employe;
  const delai = t.delai;
  useEffect(() => {
    if (!actif || delai <= 0) return;
    let derniere = Date.now();
    const toucher = () => { derniere = Date.now(); };
    const evts: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart", "scroll"];
    evts.forEach((e) => window.addEventListener(e, toucher, { passive: true }));
    const timer = window.setInterval(() => { if (Date.now() - derniere > delai * 1000) verrouillerTablette(); }, 2000);
    return () => { evts.forEach((e) => window.removeEventListener(e, toucher)); window.clearInterval(timer); };
  }, [actif, delai]);
  if (!actif || !t.employe) return null;
  const e = t.employe;
  return (
    <button type="button" onClick={verrouillerTablette} title="Changer d'employé" style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 12px", borderRadius: 20, border: "1px solid #ddd6c8", background: "#fff", fontFamily: "inherit", fontSize: 13, fontWeight: 600, color: "#1a1a1a", cursor: "pointer", whiteSpace: "nowrap" }}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#4a6741" }} />
      {e.prenom} {e.nom.slice(0, 1)}.{compact ? "" : <span style={{ color: "#6f6a61", fontWeight: 500 }}> · Changer d&apos;employé</span>}
    </button>
  );
}
