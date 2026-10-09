"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { SidebarContent } from "./Sidebar";

/**
 * Menu latéral du téléphone (10/10/2026) : le burger de la barre du haut ouvre, par la gauche,
 * le même menu que la barre latérale du bureau (établissement, pages, session). Il remplace
 * la barre d'onglets du bas et ses boutons flottants. Se ferme au choix d'une page, au clic
 * à côté, à Échap, et quand la pastille d'entreprise de la barre du haut demande l'ouverture.
 */
export function MenuLateral() {
  const pathname = usePathname();
  // Ouvert « pour » une page : un changement de page le referme sans effet de synchronisation
  const [ouvertPour, setOuvertPour] = useState<string | null>(null);
  const ouvert = ouvertPour === pathname;
  const fermer = () => setOuvertPour(null);

  useEffect(() => {
    const ouvrir = () => setOuvertPour(window.location.pathname);
    const touche = (e: KeyboardEvent) => { if (e.key === "Escape") setOuvertPour(null); };
    window.addEventListener("open-menu-lateral", ouvrir);
    window.addEventListener("keydown", touche);
    return () => { window.removeEventListener("open-menu-lateral", ouvrir); window.removeEventListener("keydown", touche); };
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = avant; };
  }, [ouvert]);

  return (
    <>
      <button type="button" onClick={() => setOuvertPour(pathname)} aria-label="Ouvrir le menu" aria-expanded={ouvert}
        style={{ width: 38, height: 38, borderRadius: 10, border: "1px solid rgba(0,0,0,0.08)", background: "#fff", color: "#1a1a1a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, padding: 0 }}>
        <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>
      </button>
      {ouvert && (
        <>
          <style>{`@keyframes menuLateralEntre { from { transform: translateX(-100%); } to { transform: none; } }`}</style>
          <div onClick={fermer} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(26,26,26,0.45)" }} />
          <aside role="dialog" aria-modal="true" aria-label="Menu" style={{
            position: "fixed", top: 0, bottom: 0, left: 0, width: "min(300px, 86vw)", zIndex: 401,
            background: "#f7f3ec", boxShadow: "12px 0 40px rgba(0,0,0,0.22)", overflowY: "auto",
            paddingTop: "env(safe-area-inset-top, 0px)", paddingBottom: "env(safe-area-inset-bottom, 0px)",
            animation: "menuLateralEntre .25s cubic-bezier(.2,.8,.2,1)",
          }}>
            <button type="button" onClick={fermer} aria-label="Fermer le menu"
              style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 10px)", right: 10, width: 32, height: 32, borderRadius: 16, border: "none", background: "rgba(0,0,0,0.06)", color: "#1a1a1a", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}>×</button>
            <SidebarContent onNaviguer={fermer} />
          </aside>
        </>
      )}
    </>
  );
}
