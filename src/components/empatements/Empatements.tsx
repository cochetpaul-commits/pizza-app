"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { calculerPate, type EmpatementType, type FlourMixItem, type Phase } from "@/lib/pateEngine";

/**
 * Empâtements (28/10/2026) : la page du quotidien pour les pâtons et la focaccia. On règle le nombre
 * de pâtons (et le poids, 264 g en général), la recette se recalcule au gramme. Les pourcentages se
 * modifient dans la fiche (« Réglages de la recette »), pas ici.
 */
type Recette = {
  id: string; name: string; type: EmpatementType; balls_count: number; ball_weight: number;
  hydration_total: number; salt_percent: number; honey_percent: number; oil_percent: number;
  yeast_percent: number; biga_yeast_percent: number; flour_mix: FlourMixItem[]; procedure: string[];
};

const TITRE = "var(--font-oswald), 'Oswald', sans-serif";
const n2 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const g = (x: number) => `${Math.round(x).toLocaleString("fr-FR")} g`;
const kg = (x: number) => x >= 1000 ? `${(x / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : g(x);
const cle = (id: string) => `empatements_patons_${id}`;
/** « FARINE TIPO 0 'SOFFIO 25 KG » → « Tipo 0 Soffio » : le nom du sac tronquait sur mobile */
const nomFarine = (s: string) => {
  const court = s.replace(/["'«»]/g, "").replace(/\b\d+\s*kg\b/i, "").replace(/^farine\s+/i, "").replace(/\s+/g, " ").trim();
  return (court || s).toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase());
};

function lireProcedure(p: unknown): string[] {
  if (!p) return [];
  const s = String(p);
  try { const j = JSON.parse(s); if (Array.isArray(j)) return j.map(String); } catch { /* texte brut */ }
  return [s];
}

function nomPhase(ph: Phase, type: EmpatementType, i: number) {
  if (type !== "biga") return "Pesée";
  return i === 0 ? "Biga" : "Pâte finale";
}

export function Empatements() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const bureau = useBureau();
  const [recettes, setRecettes] = useState<Recette[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    (async () => {
      const { data, error } = await supabase.from("recipes").select("*").order("name");
      if (annule) return;
      if (error) { setErreur(error.message); return; }
      const liste: Recette[] = (data ?? []).map((r: Record<string, unknown>) => {
        const t = String(r.type ?? "direct");
        let mix: FlourMixItem[] = [];
        try { mix = (typeof r.flour_mix === "string" ? JSON.parse(r.flour_mix) : r.flour_mix) as FlourMixItem[]; } catch { mix = []; }
        return {
          id: String(r.id), name: String(r.name ?? "").trim(), type: (t === "biga" || t === "focaccia" ? t : "direct") as EmpatementType,
          balls_count: n2(r.balls_count) || 12, ball_weight: n2(r.ball_weight) || 264,
          hydration_total: n2(r.hydration_total) || 65, salt_percent: n2(r.salt_percent), honey_percent: n2(r.honey_percent),
          oil_percent: n2(r.oil_percent), yeast_percent: n2(r.yeast_percent), biga_yeast_percent: n2(r.biga_yeast_percent),
          flour_mix: Array.isArray(mix) ? mix : [], procedure: lireProcedure(r.procedure),
        };
      });
      // Les pâtes de l'établissement courant d'abord (ex. « Focaccia Piccola Mia » chez Piccola)
      const piccola = !!etab?.slug?.includes("piccola");
      liste.sort((a, b) => Number(b.name.toLowerCase().includes("piccola") === piccola) - Number(a.name.toLowerCase().includes("piccola") === piccola) || a.name.localeCompare(b.name, "fr"));
      setRecettes(liste);
    })();
    return () => { annule = true; };
  }, [etab?.slug]);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px" }}>
      <h1 style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 30, color: "#1a1a1a", margin: "8px 0 2px", textTransform: "uppercase", letterSpacing: ".01em" }}>Empâtements</h1>
      <p style={{ color: "#8a8378", margin: "0 0 16px", fontSize: 14 }}>Réglez le nombre de pâtons, la recette se recalcule au gramme.</p>
      {erreur && <div style={{ color: "#b3261e", padding: 12 }}>Chargement impossible : {erreur}</div>}
      {!recettes && !erreur && <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement…</div>}
      {recettes && recettes.length === 0 && <div style={{ color: "#8a8378", padding: 12 }}>Aucun empâtement. Créez-en un depuis la Carte, onglet Préparations.</div>}
      <div style={{ display: "grid", gap: 16 }}>
        {recettes?.map((r) => <CarteEmpatement key={r.id} recette={r} onReglages={() => router.push(`/recettes/empatement/${r.id}`)} />)}
      </div>
    </div>
  );
}

function CarteEmpatement({ recette: r, onReglages }: { recette: Recette; onReglages: () => void }) {
  const [patons, setPatons] = useState<number | "">(() => {
    try { const v = Number(localStorage.getItem(cle(r.id))); if (v > 0) return v; } catch { /* stockage indisponible */ }
    return r.balls_count;
  });
  const [poids, setPoids] = useState<number | "">(r.ball_weight);
  const [procedeOuvert, setProcedeOuvert] = useState(false);
  useEffect(() => { try { if (patons) localStorage.setItem(cle(r.id), String(patons)); } catch { /* ignoré */ } }, [patons, r.id]);

  const resultat = useMemo(() => {
    if (!patons || !poids) return null;
    try {
      return calculerPate({
        type: r.type, nbPatons: Number(patons), poidsPaton: Number(poids),
        recipe: { hydration_total: r.hydration_total, salt_percent: r.salt_percent, honey_percent: r.honey_percent, oil_percent: r.oil_percent, yeast_percent: r.yeast_percent, biga_yeast_percent: r.biga_yeast_percent },
        flourMix: r.flour_mix.length ? r.flour_mix : undefined,
      });
    } catch { return null; }
  }, [r, patons, poids]);

  const mix = r.flour_mix.length ? r.flour_mix : [{ name: "Farine", percent: 100 }];
  const typeLabel = r.type === "biga" ? "Biga" : r.type === "focaccia" ? "Focaccia" : "Direct";
  const couleur = r.type === "biga" ? "#b8601f" : r.type === "focaccia" ? "#8a6a3a" : "#4a6741";
  const params = [
    `Hydratation ${r.hydration_total.toLocaleString("fr-FR")} %`, `Sel ${r.salt_percent.toLocaleString("fr-FR")} %`,
    ...(r.honey_percent > 0 ? [`Miel ${r.honey_percent.toLocaleString("fr-FR")} %`] : []),
    ...(r.oil_percent > 0 ? [`Huile ${r.oil_percent.toLocaleString("fr-FR")} %`] : []),
    ...(r.type === "biga" ? [`Levure biga ${r.biga_yeast_percent.toLocaleString("fr-FR")} %`] : [`Levure ${r.yeast_percent.toLocaleString("fr-FR")} %`]),
  ];
  const pasPoids = r.ball_weight >= 1000 ? 50 : 2;

  return (
    <section style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 16, overflow: "hidden", display: "grid" }}>
      {/* Bandeau : nom, type, paramètres ; les réglages en haut à droite */}
      <div style={{ background: couleur, color: "#fff", padding: "14px 16px 16px", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.8 }}>Empâtement · {typeLabel}</div>
            <div style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 30, lineHeight: 1.05, textTransform: "uppercase", letterSpacing: ".01em", marginTop: 2 }}>{r.name}</div>
          </div>
          <button type="button" onClick={onReglages} aria-label="Réglages de la recette" title="Réglages de la recette" style={{
            flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.14)",
            color: "#fff", borderRadius: 20, padding: "6px 12px", fontSize: 13, cursor: "pointer", fontFamily: "inherit",
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
            Réglages
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {params.map((t) => <span key={t} style={{ fontSize: 12, padding: "3px 9px", borderRadius: 8, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.25)" }}>{t}</span>)}
        </div>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        {/* Le réglage du jour : les pâtons, en gros, avec ±1 et ±10 */}
        <Compteur libelle="Pâtons" valeur={patons} onChange={setPatons} pas={1} grandPas={10} couleur={couleur} />
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "#f7f3ec", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#8a8378", textTransform: "uppercase", letterSpacing: ".05em" }}>Poids d&apos;un pâton</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <BoutonRond onClick={() => setPoids(Math.max(1, (Number(poids) || r.ball_weight) - pasPoids))} taille={34} couleur={couleur} label="−" aria="Moins" />
              <span style={{ fontFamily: TITRE, fontWeight: 700, fontSize: Number(poids) >= 1000 ? 20 : 24, color: "#1a1a1a", flex: 1, textAlign: "center", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 0 }}>{poids ? `${Number(poids).toLocaleString("fr-FR")} g` : "—"}</span>
              <BoutonRond onClick={() => setPoids((Number(poids) || r.ball_weight) + pasPoids)} taille={34} couleur={couleur} label="+" aria="Plus" />
            </div>
          </div>
          <div style={{ background: "#f7f3ec", borderRadius: 12, padding: "10px 12px", display: "grid", gap: 6, alignContent: "start" }}>
            <span style={{ fontSize: 12, color: "#8a8378", textTransform: "uppercase", letterSpacing: ".05em" }}>Pâte totale</span>
            <span style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 24, color: "#1a1a1a", lineHeight: "34px" }}>{resultat ? kg(resultat.summary.total_dough_g) : "—"}</span>
          </div>
        </div>

      {resultat && (
        <div style={{ display: "grid", gap: 10 }}>
          {/* Les farines se pré-mélangent : une seule pesée de farine par phase (28/10), le détail du mélange en note */}
          {mix.length > 1 && (
            <div style={{ fontSize: 13, color: "#8a8378" }}>
              Mélange de farines du jour : {mix.map((f) => `${g(resultat.flour_total_g * f.percent / 100)} ${nomFarine(f.name)}`).join(" + ")}, soit {kg(resultat.flour_total_g)}.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: resultat.phases.length > 1 ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr", gap: 10 }}>
            {resultat.phases.map((ph, i) => (
              <div key={ph.name} style={{ border: "1px solid #ddd6c8", borderRadius: 12, overflow: "hidden", minWidth: 0 }}>
                {resultat.phases.length > 1 && (
                  <div style={{ background: "#f2ede4", padding: "8px 14px", fontFamily: TITRE, fontWeight: 700, fontSize: 15, color: "#D4775A", textTransform: "uppercase", letterSpacing: ".04em" }}>
                    {nomPhase(ph, r.type, i)}
                  </div>
                )}
                <Pesee libelle={mix.length > 1 ? "Farine (mélange)" : nomFarine(mix[0].name)} grammes={ph.flour_g} />
                <Pesee libelle="Eau" grammes={ph.water_g} />
                {ph.yeast_g > 0 && <Pesee libelle="Levure" grammes={ph.yeast_g} precis />}
                {ph.salt_g > 0 && <Pesee libelle="Sel" grammes={ph.salt_g} />}
                {ph.honey_g > 0 && <Pesee libelle="Miel" grammes={ph.honey_g} />}
                {ph.oil_g > 0 && <Pesee libelle="Huile" grammes={ph.oil_g} />}
              </div>
            ))}
          </div>
          {resultat.warnings.map((w) => <div key={w} style={{ fontSize: 13, color: "#b7791f" }}>{w}</div>)}
        </div>
      )}

      {r.procedure.length > 0 && (
        <div>
          <button type="button" onClick={() => setProcedeOuvert((v) => !v)} aria-expanded={procedeOuvert}
            style={{ border: "none", background: "transparent", color: "#D4775A", fontWeight: 600, fontSize: 14, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
            {procedeOuvert ? "Masquer le procédé" : "Voir le procédé"}
          </button>
          {procedeOuvert && (
            <div style={{ marginTop: 8, fontSize: 14, color: "#1a1a1a", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
              {r.procedure.join("\n")}
            </div>
          )}
        </div>
      )}
      </div>
    </section>
  );
}

/** Gros compteur : ±1 et ±10 en boutons ronds, le chiffre saisissable au centre */
function Compteur({ libelle, valeur, onChange, pas, grandPas, couleur }: { libelle: string; valeur: number | ""; onChange: (v: number | "") => void; pas: number; grandPas: number; couleur: string }) {
  const v = Number(valeur) || 0;
  const regler = (d: number) => onChange(Math.max(1, v + d));
  return (
    <div style={{ display: "grid", gap: 6, justifyItems: "center" }}>
      <span style={{ fontSize: 12, color: "#8a8378", textTransform: "uppercase", letterSpacing: ".08em" }}>{libelle}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
        <BoutonRond onClick={() => regler(-grandPas)} taille={44} couleur={couleur} label={`−${grandPas}`} aria={`Moins ${grandPas}`} clair />
        <BoutonRond onClick={() => regler(-pas)} taille={54} couleur={couleur} label="−" aria="Moins un" />
        <input
          type="number" inputMode="numeric" min={1} value={valeur}
          onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
          onFocus={(e) => e.target.select()}
          aria-label={libelle}
          style={{ width: 96, textAlign: "center", fontFamily: TITRE, fontWeight: 700, fontSize: 40, color: "#1a1a1a", border: "none", borderBottom: "2px solid #ddd6c8", background: "transparent", outline: "none", padding: "0 4px", fontVariantNumeric: "tabular-nums", MozAppearance: "textfield" }}
        />
        <BoutonRond onClick={() => regler(pas)} taille={54} couleur={couleur} label="+" aria="Plus un" />
        <BoutonRond onClick={() => regler(grandPas)} taille={44} couleur={couleur} label={`+${grandPas}`} aria={`Plus ${grandPas}`} clair />
      </div>
    </div>
  );
}

function BoutonRond({ onClick, taille, couleur, label, aria, clair }: { onClick: () => void; taille: number; couleur: string; label: string; aria: string; clair?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={aria} style={{
      width: taille, height: taille, borderRadius: 999, flexShrink: 0, cursor: "pointer", fontFamily: TITRE, fontWeight: 700, appearance: "none", WebkitAppearance: "none", padding: 0,
      fontSize: clair ? 14 : Math.round(taille * 0.5), lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `2px solid ${couleur}`, background: clair ? "transparent" : couleur, color: clair ? couleur : "#fff", touchAction: "manipulation",
    }}>{label}</button>
  );
}

function Pesee({ libelle, grammes, precis }: { libelle: string; grammes: number; precis?: boolean }) {
  const txt = precis && grammes < 100 ? `${(Math.round(grammes * 10) / 10).toLocaleString("fr-FR")} g` : g(grammes);
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, padding: "9px 14px", borderTop: "1px solid #f2ede4" }}>
      <span style={{ fontSize: 15, color: "#1a1a1a", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{libelle}</span>
      <span style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 28, color: "#1a1a1a", lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{txt}</span>
    </div>
  );
}
