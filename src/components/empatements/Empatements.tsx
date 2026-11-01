"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { calculerPate, type EmpatementType, type FlourMixItem, type PateResult } from "@/lib/pateEngine";
import { formatG, lignesPesee, nomPhase } from "@/lib/pateAffichage";
import { openApiFile } from "@/lib/fetchApi";
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
  /* Module pâte, phase 1 (01/11/2026) */
  biga_percent: number; biga_hydration: number; biga_flour: string | null; water_start_pct: number; loss_margin_pct: number; mixer_max_balls: number;
};

const n2 = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const g = (x: number) => `${Math.round(x).toLocaleString("fr-FR")} g`;
const kg = (x: number) => x >= 1000 ? `${(x / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} kg` : g(x);
const cle = (id: string) => `empatements_patons_${id}`;

function lireProcedure(p: unknown): string[] {
  if (!p) return [];
  const s = String(p);
  try { const j = JSON.parse(s); if (Array.isArray(j)) return j.map(String); } catch { /* texte brut */ }
  return [s];
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
          biga_percent: n2(r.biga_percent) || 50, biga_hydration: n2(r.biga_hydration) || 45, biga_flour: r.biga_flour ? String(r.biga_flour) : null,
          water_start_pct: r.water_start_pct == null ? 80 : n2(r.water_start_pct), loss_margin_pct: n2(r.loss_margin_pct), mixer_max_balls: n2(r.mixer_max_balls),
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
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px" }}>
      <style>{`.emp-ligne:hover td{background:#f7f3ec}`}</style>
      <h1 style={h1(bureau)}>Empâtements</h1>
      <div style={{ color: MUTED, margin: "2px 0 14px", fontSize: 13 }}>Réglez le nombre de pâtons, la recette se recalcule au gramme.</div>
      {erreur && <div style={{ color: "#b3261e", padding: 12 }}>Chargement impossible : {erreur}</div>}
      {!recettes && !erreur && <div style={{ textAlign: "center", padding: 60, color: MUTED }}>Chargement…</div>}
      {recettes && recettes.length === 0 && <div style={CADRE}><EtatVide titre="Aucun empâtement" texte="Créez-en un depuis la Carte, onglet Préparations." /></div>}
      {/* Bureau et tablette : deux empâtements par ligne, les quatre tiennent sur l'écran sans défiler (29/10) */}
      <div style={{ display: "grid", gap: 16, gridTemplateColumns: bureau ? "repeat(2, minmax(0, 1fr))" : "1fr" }}>
        {recettes?.map((r) => <CarteEmpatement key={r.id} recette={r} bureau={bureau} onReglages={() => router.push(`/recettes/empatement/${r.id}`)} />)}
      </div>
    </div>
  );
}

export function CarteEmpatement({ recette: r, onReglages, bureau }: { recette: Recette; onReglages: () => void; bureau: boolean }) {
  const [patons, setPatons] = useState<number | "">(() => {
    try { const v = Number(localStorage.getItem(cle(r.id))); if (v > 0) return v; } catch { /* stockage indisponible */ }
    return r.balls_count;
  });
  const [poids, setPoids] = useState<number | "">(r.ball_weight);
  const [procedeOuvert, setProcedeOuvert] = useState(false);
  // Au delà de la capacité du pétrin : afficher les pesées par pétrissage
  const [parPetrin, setParPetrin] = useState(false);
  useEffect(() => { try { if (patons) localStorage.setItem(cle(r.id), String(patons)); } catch { /* ignoré */ } }, [patons, r.id]);

  const calculer = (nb: number) => calculerPate({
    type: r.type, nbPatons: nb, poidsPaton: Number(poids),
    recipe: {
      hydration_total: r.hydration_total, salt_percent: r.salt_percent, honey_percent: r.honey_percent, oil_percent: r.oil_percent,
      yeast_percent: r.yeast_percent, biga_yeast_percent: r.biga_yeast_percent, biga_percent: r.biga_percent, biga_hydration: r.biga_hydration,
      biga_flour: r.biga_flour, water_start_pct: r.water_start_pct, loss_margin_pct: r.loss_margin_pct, mixer_max_balls: r.mixer_max_balls,
    },
    flourMix: r.flour_mix.length ? r.flour_mix : undefined,
  });
  const resultat = useMemo(() => {
    if (!patons || !poids) return null;
    try { return calculer(Number(patons)); } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, patons, poids]);
  const lots = resultat?.summary.lots ?? [];
  const resultatsLots = useMemo(() => {
    if (!parPetrin || lots.length < 2) return null;
    try { return lots.map((nb) => calculer(nb)); } catch { return null; }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, poids, parPetrin, lots.join(",")]);
  const etiquettes = () => { if (patons && poids) void openApiFile(`/api/empatements/etiquettes?recette=${r.id}&patons=${patons}&poids=${poids}`); };
  const typeLabel = r.type === "biga" ? "Biga" : r.type === "focaccia" ? "Focaccia" : "Direct";
  const couleur = r.type === "biga" ? "#b8601f" : r.type === "focaccia" ? "#8a6a3a" : "#4a6741";
  const params = [
    `Hydratation ${r.hydration_total.toLocaleString("fr-FR")} %`, `Sel ${r.salt_percent.toLocaleString("fr-FR")} %`,
    ...(r.honey_percent > 0 ? [`Miel ${r.honey_percent.toLocaleString("fr-FR")} %`] : []),
    ...(r.oil_percent > 0 ? [`Huile ${r.oil_percent.toLocaleString("fr-FR")} %`] : []),
    ...(r.type === "biga" ? [`Biga ${r.biga_percent.toLocaleString("fr-FR")} %`, `Levure biga ${r.biga_yeast_percent.toLocaleString("fr-FR")} %`] : [`Levure ${r.yeast_percent.toLocaleString("fr-FR")} %`]),
  ];
  const pasPoids = r.ball_weight >= 1000 ? 50 : 2;

  return (
    <section style={{ ...CADRE, display: "grid", alignContent: "start" }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {bureau && <div style={{ gridColumn: "1 / -1" }}><Tuile compacte couleur={couleur} libelle="Pâtons" valeur={
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <BoutonRond onClick={() => setPatons(Math.max(1, (Number(patons) || 0) - 10))} taille={32} couleur={couleur} label="−10" aria="Moins dix" clair />
              <BoutonRond onClick={() => setPatons(Math.max(1, (Number(patons) || 0) - 1))} taille={32} couleur={couleur} label="−" aria="Moins un" />
              <input type="number" inputMode="numeric" min={1} value={patons} aria-label="Pâtons"
                onChange={(e) => setPatons(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))} onFocus={(e) => e.target.select()}
                style={{ width: 76, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 26, color: "#1a1a1a", border: "none", borderBottom: `1px solid ${BORD}`, background: "transparent", outline: "none", padding: 0, fontVariantNumeric: "tabular-nums", MozAppearance: "textfield" }} />
              <BoutonRond onClick={() => setPatons((Number(patons) || 0) + 1)} taille={32} couleur={couleur} label="+" aria="Plus un" />
              <BoutonRond onClick={() => setPatons((Number(patons) || 0) + 10)} taille={32} couleur={couleur} label="+10" aria="Plus dix" clair />
            </span>
          } /></div>}
          {/* Sur bureau le poids prend toute la ligne, comme le compteur : les boutons ne se chevauchent plus (29/10) */}
          <div style={bureau ? { gridColumn: "1 / -1" } : undefined}><Tuile compacte couleur={couleur} libelle="Poids d'un pâton" valeur={
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <BoutonRond onClick={() => setPoids(Math.max(1, (Number(poids) || r.ball_weight) - pasPoids))} taille={32} couleur={couleur} label="−" aria="Moins" clair />
              <span style={{ textAlign: "center", fontSize: Number(poids) >= 1000 ? 20 : 24, whiteSpace: "nowrap", minWidth: 76 }}>{poids ? `${Number(poids).toLocaleString("fr-FR")} g` : "—"}
                {resultat && resultat.summary.poidsCalcule_g !== resultat.summary.poidsPaton_g && <div style={{ fontSize: 11, fontWeight: 500, fontFamily: "inherit", color: MUTED, letterSpacing: 0 }}>calculé à {resultat.summary.poidsCalcule_g} g</div>}
              </span>
              <BoutonRond onClick={() => setPoids((Number(poids) || r.ball_weight) + pasPoids)} taille={32} couleur={couleur} label="+" aria="Plus" clair />
            </span>
          } /></div>
          <Tuile compacte couleur={couleur} libelle="Pâte totale" valeur={resultat ? kg(resultat.summary.total_ingredients_g) : "—"} />
          {bureau && <Tuile compacte couleur={couleur} libelle="Farine" valeur={resultat ? kg(resultat.flour_total_g) : "—"} />}
        </div>

      {resultat && (
        <div style={{ display: "grid", gap: 10 }}>
          {resultat.warnings.map((w) => <div key={w} style={{ fontSize: 13, color: ATTENTION, fontWeight: 600 }}>{w}</div>)}
          {lots.length > 1 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setParPetrin(false)} style={{ ...BTN, ...(parPetrin ? {} : { background: couleur, borderColor: couleur, color: "#fff" }) }}>En une fois</button>
              <button type="button" onClick={() => setParPetrin(true)} style={{ ...BTN, ...(parPetrin ? { background: couleur, borderColor: couleur, color: "#fff" } : {}) }}>Par pétrissage ({lots.join(" + ")})</button>
            </div>
          )}
          {resultatsLots ? resultatsLots.map((res, i) => (
            <div key={i} style={{ display: "grid", gap: 8 }}>
              <span style={INTERTITRE}>Pétrissage {i + 1} · {res.summary.nbPatons} pâtons · {kg(res.summary.total_ingredients_g)}</span>
              <Pesees resultat={res} couleur={couleur} />
            </div>
          )) : <Pesees resultat={resultat} couleur={couleur} />}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" onClick={etiquettes} style={{ ...BTN, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></svg>
              Étiquettes de la veille
            </button>
            <span style={{ fontSize: 12, color: MUTED }}>Une étiquette par contenant, à imprimer pour la pesée.</span>
          </div>
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

/** Les pesées, une table par phase : farines nommées, eau de départ et de bassinage, sel, miel, levure là où elle va */
function Pesees({ resultat, couleur }: { resultat: PateResult; couleur: string }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10 }}>
      {resultat.phases.map((ph) => {
        const pesees = lignesPesee(ph);
        return (
          <div key={ph.name} style={{ ...CADRE, minWidth: 0 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 6 }} /><col /><col style={{ width: 110 }} /></colgroup>
              <thead>
                <tr>
                  <th style={{ ...TH, padding: 0 }} />
                  <th style={TH}>{nomPhase(ph, resultat.phases.length)}</th>
                  <th style={{ ...TH, textAlign: "right" }}>Grammes</th>
                </tr>
              </thead>
              <tbody>
                {pesees.map((l, k) => {
                  const dernier = k === pesees.length - 1 ? { borderBottom: 0 } : {};
                  return (
                    <tr key={l.libelle} className="emp-ligne">
                      <td style={{ ...liseret(couleur), ...dernier }} />
                      <td style={{ ...TD, fontSize: 14, ...dernier, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.libelle}{l.note && <span style={{ color: MUTED, fontSize: 12 }}> · {l.note}</span>}</td>
                      <td style={{ ...TD, textAlign: "right", fontFamily: OSWALD, fontWeight: 700, fontSize: 22, lineHeight: 1.1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", ...dernier }}>{formatG(l.grammes, l.precis)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
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
        <BoutonRond onClick={() => regler(-grandPas)} taille={46} couleur={couleur} label={`−${grandPas}`} aria={`Moins ${grandPas}`} clair />
        <BoutonRond onClick={() => regler(-pas)} taille={46} couleur={couleur} label="−" aria="Moins un" />
        <input
          type="number" inputMode="numeric" min={1} value={valeur}
          onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, Math.floor(Number(e.target.value))))}
          onFocus={(e) => e.target.select()}
          aria-label={libelle}
          style={{ width: 96, textAlign: "center", fontFamily: OSWALD, fontWeight: 700, fontSize: 40, color: "#1a1a1a", border: "none", borderBottom: `1px solid ${BORD}`, background: "transparent", outline: "none", padding: "0 4px", fontVariantNumeric: "tabular-nums", MozAppearance: "textfield" }}
        />
        <BoutonRond onClick={() => regler(pas)} taille={46} couleur={couleur} label="+" aria="Plus un" />
        <BoutonRond onClick={() => regler(grandPas)} taille={46} couleur={couleur} label={`+${grandPas}`} aria={`Plus ${grandPas}`} clair />
      </div>
    </div>
  );
}

function BoutonRond({ onClick, taille, couleur, label, aria, clair }: { onClick: () => void; taille: number; couleur: string; label: string; aria: string; clair?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={aria} style={{
      width: taille, height: taille, borderRadius: 999, flexShrink: 0, cursor: "pointer", fontFamily: OSWALD, fontWeight: 700, appearance: "none", WebkitAppearance: "none", padding: 0,
      fontSize: clair ? 13 : Math.round(taille * 0.5), lineHeight: 1, display: "inline-flex", alignItems: "center", justifyContent: "center",
      border: `1.5px solid ${clair ? BORD : couleur}`, background: clair ? "#fff" : couleur, color: clair ? couleur : "#fff", touchAction: "manipulation",
    }}>{label}</button>
  );
}
