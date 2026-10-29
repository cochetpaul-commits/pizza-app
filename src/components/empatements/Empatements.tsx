"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { calculerPate, type EmpatementType, type FlourMixItem, type Phase } from "@/lib/pateEngine";
import { Tuile } from "@/components/ui/Tuile";
import { EtatVide } from "@/components/ui/EtatVide";
import { ACCENT, ATTENTION, BORD, BTN, CADRE, INTERTITRE, MUTED, OSWALD, TD, TH, h1, liseret } from "@/components/ui/charte";
import { degradeCategorie, stylePastilleBarre } from "@/lib/styleCategories";

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
      <style>{`.emp-ligne:hover td{background:#f7f3ec}`}</style>
      <h1 style={h1(bureau)}>Empâtements</h1>
      <div style={{ color: MUTED, margin: "2px 0 14px", fontSize: 13 }}>Réglez le nombre de pâtons, la recette se recalcule au gramme.</div>
      {erreur && <div style={{ color: "#b3261e", padding: 12 }}>Chargement impossible : {erreur}</div>}
      {!recettes && !erreur && <div style={{ textAlign: "center", padding: 60, color: MUTED }}>Chargement…</div>}
      {recettes && recettes.length === 0 && <div style={CADRE}><EtatVide titre="Aucun empâtement" texte="Créez-en un depuis la Carte, onglet Préparations." /></div>}
      <div style={{ display: "grid", gap: 16 }}>
        {recettes?.map((r) => <CarteEmpatement key={r.id} recette={r} bureau={bureau} onReglages={() => router.push(`/recettes/empatement/${r.id}`)} />)}
      </div>
    </div>
  );
}

function CarteEmpatement({ recette: r, onReglages, bureau }: { recette: Recette; onReglages: () => void; bureau: boolean }) {
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
    <section style={{ ...CADRE, display: "grid" }}>
      {/* En-tête : liseré de couleur, nom en Oswald, type et paramètres en pastilles fines ; les réglages à droite */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 16px", background: degradeCategorie(couleur), color: "#fff" }}>
        <div style={{ minWidth: 0, flex: 1, display: "grid", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 20, lineHeight: 1.1, textTransform: "uppercase", letterSpacing: ".04em" }}>{r.name}</span>
            <span style={{ ...stylePastilleBarre(couleur), fontSize: 11 }}>{typeLabel}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {params.map((t) => <span key={t} style={{ fontSize: 11.5, padding: "2px 8px", borderRadius: 8, background: "rgba(255,255,255,0.16)", border: "1px solid rgba(255,255,255,0.3)" }}>{t}</span>)}
          </div>
        </div>
        <button type="button" onClick={onReglages} aria-label="Réglages de la recette" title="Réglages de la recette" style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.4)", color: "#fff" }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
          Réglages
        </button>
      </div>

      <div style={{ padding: 16, display: "grid", gap: 14 }}>
        {/* Le réglage du jour : les pâtons, en gros, avec ±1 et ±10 ; sur bureau, le compteur est la première des quatre tuiles */}
        {!bureau && <Compteur libelle="Pâtons" valeur={patons} onChange={setPatons} pas={1} grandPas={10} couleur={couleur} />}
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "1.4fr 1fr 1fr 1fr" : "1fr 1fr", gap: 10 }}>
          {bureau && <Tuile compacte couleur={couleur} libelle="Pâtons" valeur={
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <BoutonRond onClick={() => setPatons(Math.max(1, (Number(patons) || 0) - 10))} taille={26} couleur={couleur} label="−10" aria="Moins dix" clair />
              <BoutonRond onClick={() => setPatons(Math.max(1, (Number(patons) || 0) - 1))} taille={30} couleur={couleur} label="−" aria="Moins un" />
              <input type="number" inputMode="numeric" min={1} value={patons} aria-label="Pâtons"
                onChange={(e) => setPatons(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))} onFocus={(e) => e.target.select()}
                style={{ flex: 1, minWidth: 0, width: 56, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 24, color: "#1a1a1a", border: "none", borderBottom: `1px solid ${BORD}`, background: "transparent", outline: "none", padding: 0, fontVariantNumeric: "tabular-nums", MozAppearance: "textfield" }} />
              <BoutonRond onClick={() => setPatons((Number(patons) || 0) + 1)} taille={30} couleur={couleur} label="+" aria="Plus un" />
              <BoutonRond onClick={() => setPatons((Number(patons) || 0) + 10)} taille={26} couleur={couleur} label="+10" aria="Plus dix" clair />
            </span>
          } />}
          <Tuile compacte couleur={couleur} libelle="Poids d'un pâton" valeur={
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <BoutonRond onClick={() => setPoids(Math.max(1, (Number(poids) || r.ball_weight) - pasPoids))} taille={30} couleur={couleur} label="−" aria="Moins" clair />
              <span style={{ flex: 1, textAlign: "center", fontSize: Number(poids) >= 1000 ? 18 : 22, whiteSpace: "nowrap", minWidth: 0 }}>{poids ? `${Number(poids).toLocaleString("fr-FR")} g` : "—"}</span>
              <BoutonRond onClick={() => setPoids((Number(poids) || r.ball_weight) + pasPoids)} taille={30} couleur={couleur} label="+" aria="Plus" clair />
            </span>
          } />
          <Tuile compacte couleur={couleur} libelle="Pâte totale" valeur={resultat ? kg(resultat.summary.total_dough_g) : "—"} />
          {bureau && <Tuile compacte couleur={couleur} libelle="Farine" valeur={resultat ? kg(resultat.flour_total_g) : "—"} />}
        </div>

      {resultat && (
        <div style={{ display: "grid", gap: 10 }}>
          {/* Les farines se pré-mélangent : une seule pesée de farine par phase (28/10), le détail du mélange en note */}
          {mix.length > 1 && (
            <div style={{ fontSize: 13, color: MUTED }}>
              Mélange de farines du jour : {mix.map((f) => `${g(resultat.flour_total_g * f.percent / 100)} ${nomFarine(f.name)}`).join(" + ")}, soit {kg(resultat.flour_total_g)}.
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: resultat.phases.length > 1 ? "repeat(auto-fit, minmax(260px, 1fr))" : "1fr", gap: 10 }}>
            {resultat.phases.map((ph, i) => {
              const pesees: [string, number, boolean][] = [
                [mix.length > 1 ? "Farine (mélange)" : nomFarine(mix[0].name), ph.flour_g, false], ["Eau", ph.water_g, false],
                ...(ph.yeast_g > 0 ? [["Levure", ph.yeast_g, true] as [string, number, boolean]] : []),
                ...(ph.salt_g > 0 ? [["Sel", ph.salt_g, false] as [string, number, boolean]] : []),
                ...(ph.honey_g > 0 ? [["Miel", ph.honey_g, false] as [string, number, boolean]] : []),
                ...(ph.oil_g > 0 ? [["Huile", ph.oil_g, false] as [string, number, boolean]] : []),
              ];
              return (
                <div key={ph.name} style={{ ...CADRE, minWidth: 0 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
                    <colgroup><col style={{ width: 6 }} /><col /><col style={{ width: 110 }} /></colgroup>
                    <thead>
                      <tr>
                        <th style={{ ...TH, padding: 0 }} />
                        <th style={TH}>{resultat.phases.length > 1 ? nomPhase(ph, r.type, i) : "Pesée"}</th>
                        <th style={{ ...TH, textAlign: "right" }}>Grammes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pesees.map(([lib, gr, precis], k) => (
                        <tr key={lib} className="emp-ligne">
                          <td style={{ ...liseret(couleur), ...(k === pesees.length - 1 ? { borderBottom: 0 } : {}) }} />
                          <td style={{ ...TD, fontSize: 14, ...(k === pesees.length - 1 ? { borderBottom: 0 } : {}), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{lib}</td>
                          <td style={{ ...TD, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...(k === pesees.length - 1 ? { borderBottom: 0 } : {}) }}>
                            {precis && gr < 100 ? `${(Math.round(gr * 10) / 10).toLocaleString("fr-FR")} g` : g(gr)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
          {resultat.warnings.map((w) => <div key={w} style={{ fontSize: 13, color: ATTENTION }}>{w}</div>)}
        </div>
      )}

      {r.procedure.length > 0 && (
        <div>
          <button type="button" onClick={() => setProcedeOuvert((v) => !v)} aria-expanded={procedeOuvert}
            style={{ border: "none", background: "transparent", color: ACCENT, fontWeight: 600, fontSize: 13, cursor: "pointer", padding: 0, fontFamily: "inherit" }}>
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
      <span style={INTERTITRE}>{libelle}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", justifyContent: "center", flexWrap: "wrap" }}>
        <BoutonRond onClick={() => regler(-grandPas)} taille={40} couleur={couleur} label={`−${grandPas}`} aria={`Moins ${grandPas}`} clair />
        <BoutonRond onClick={() => regler(-pas)} taille={50} couleur={couleur} label="−" aria="Moins un" />
        <input
          type="number" inputMode="numeric" min={1} value={valeur}
          onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
          onFocus={(e) => e.target.select()}
          aria-label={libelle}
          style={{ width: 96, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 40, color: "#1a1a1a", border: "none", borderBottom: `1px solid ${BORD}`, background: "transparent", outline: "none", padding: "0 4px", fontVariantNumeric: "tabular-nums", MozAppearance: "textfield" }}
        />
        <BoutonRond onClick={() => regler(pas)} taille={50} couleur={couleur} label="+" aria="Plus un" />
        <BoutonRond onClick={() => regler(grandPas)} taille={40} couleur={couleur} label={`+${grandPas}`} aria={`Plus ${grandPas}`} clair />
      </div>
    </div>
  );
}

function BoutonRond({ onClick, taille, couleur, label, aria, clair }: { onClick: () => void; taille: number; couleur: string; label: string; aria: string; clair?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={aria} style={{
      width: taille, height: taille, borderRadius: 999, flexShrink: 0, cursor: "pointer", fontFamily: OSWALD, fontWeight: 700, appearance: "none", WebkitAppearance: "none", padding: 0,
      fontSize: clair ? Math.max(13, Math.round(taille * 0.36)) : Math.round(taille * 0.5), lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `1.5px solid ${clair ? BORD : couleur}`, background: clair ? "#fff" : couleur, color: clair ? couleur : "#fff", touchAction: "manipulation",
    }}>{label}</button>
  );
}
