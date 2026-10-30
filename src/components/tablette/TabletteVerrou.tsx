"use client";

import { useEffect, useRef, useState } from "react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import { identifierEmploye } from "@/lib/tablette/store";
import { OSWALD } from "@/components/ui/charte";

/** Écran de verrouillage de la tablette : pavé numérique, 4 chiffres, comme l'ouverture d'un compte Popina. */
export function TabletteVerrou() {
  const { current: etab } = useEtablissement();
  const [code, setCode] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const couleur = etab?.couleur ?? "#D4775A";

  // Le 4e chiffre déclenche la vérification tout seul (pas de bouton Entrée). Une seule requête à la fois,
  // suivie par une référence : l'état « occupé » ne doit pas relancer l'effet (il annulait la réponse en route).
  const enCours = useRef(false);
  useEffect(() => {
    if (code.length !== 4 || enCours.current) return;
    enCours.current = true;
    setOccupe(true);
    (async () => {
      try {
        const r = await fetchApi("/api/tablette/identifier", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErreur(j?.error ?? "Code inconnu"); setCode(""); return; }
        identifierEmploye(j.employe);
      } catch { setErreur("Connexion impossible"); setCode(""); }
      finally { enCours.current = false; setOccupe(false); }
    })();
  }, [code]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) { setErreur(null); setCode((c) => (c.length < 4 ? c + e.key : c)); }
      else if (e.key === "Backspace") setCode((c) => c.slice(0, -1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const touche = (t: string) => {
    setErreur(null);
    if (t === "←") setCode((c) => c.slice(0, -1));
    else setCode((c) => (c.length < 4 ? c + t : c));
  };
  const TOUCHES = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "←"];

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#f2ede4", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "inherit" }}>
      <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: ".04em", color: "#1a1a1a" }}>{etab?.nom ?? "iFratelli"}</div>
      <div style={{ fontSize: 14, color: "#6f6a61", marginTop: 4 }}>Qui est devant la tablette ? Entre ton code.</div>
      <div style={{ display: "flex", gap: 14, margin: "28px 0 10px" }} aria-label={`${code.length} chiffre${code.length > 1 ? "s" : ""} saisi${code.length > 1 ? "s" : ""}`}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${erreur ? "#b4443a" : couleur}`, background: i < code.length ? (erreur ? "#b4443a" : couleur) : "transparent", transition: "background .12s" }} />)}
      </div>
      <div style={{ height: 20, fontSize: 13, color: "#b4443a", fontWeight: 600 }}>{erreur ?? (occupe ? "…" : "")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 76px)", gap: 12, marginTop: 12 }}>
        {TOUCHES.map((t, i) => t === "" ? <span key={i} /> : (
          <button key={i} type="button" onClick={() => touche(t)} disabled={occupe} aria-label={t === "←" ? "Effacer" : t} style={{ width: 76, height: 76, borderRadius: "50%", border: "1px solid #ddd6c8", background: "#fff", fontFamily: OSWALD, fontSize: t === "←" ? 22 : 28, fontWeight: 700, color: "#1a1a1a", cursor: "pointer", boxShadow: "0 1px 2px rgba(0,0,0,0.05)" }}>{t}</button>
        ))}
      </div>
      <div style={{ marginTop: 28, fontSize: 12, color: "#a39d92" }}>Pas de code ? Demande à un manager : il se règle dans ta fiche employé.</div>
    </div>
  );
}
