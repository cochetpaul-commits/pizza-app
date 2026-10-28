"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { StepperInput } from "@/components/StepperInput";
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
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 0 40px" }}>
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

  return (
    <section style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 16, padding: 16, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 24, color: "#1a1a1a", textTransform: "uppercase", lineHeight: 1.1 }}>{r.name}</div>
          <div style={{ fontSize: 13, color: "#8a8378", marginTop: 2 }}>
            {typeLabel} · hydratation {r.hydration_total.toLocaleString("fr-FR")} % · sel {r.salt_percent.toLocaleString("fr-FR")} %
            {r.honey_percent > 0 ? ` · miel ${r.honey_percent.toLocaleString("fr-FR")} %` : ""}{r.oil_percent > 0 ? ` · huile ${r.oil_percent.toLocaleString("fr-FR")} %` : ""}
          </div>
        </div>
        <button type="button" onClick={onReglages} style={{ border: "1px solid #ddd6c8", background: "transparent", color: "#8a8378", borderRadius: 20, padding: "6px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Réglages de la recette
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, alignItems: "end" }}>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#8a8378" }}>
          Pâtons
          <StepperInput value={patons} onChange={setPatons} step={1} min={1} placeholder={String(r.balls_count)} />
        </label>
        <label style={{ display: "grid", gap: 6, fontSize: 13, color: "#8a8378" }}>
          Poids d&apos;un pâton (g)
          <StepperInput value={poids} onChange={setPoids} step={r.ball_weight >= 1000 ? 50 : 2} min={1} placeholder={String(r.ball_weight)} />
        </label>
        <div style={{ display: "grid", gap: 2, fontSize: 13, color: "#8a8378" }}>
          Pâte totale
          <div style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 26, color: "#1a1a1a", lineHeight: 1.1 }}>{resultat ? kg(resultat.summary.total_dough_g) : "—"}</div>
        </div>
      </div>

      {resultat && (
        <div style={{ display: "grid", gap: 10 }}>
          {resultat.phases.map((ph, i) => (
            <div key={ph.name} style={{ border: "1px solid #ddd6c8", borderRadius: 12, overflow: "hidden" }}>
              {resultat.phases.length > 1 && (
                <div style={{ background: "#f2ede4", padding: "8px 14px", fontFamily: TITRE, fontWeight: 700, fontSize: 15, color: "#D4775A", textTransform: "uppercase", letterSpacing: ".04em" }}>
                  {nomPhase(ph, r.type, i)}
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {mix.map((f) => <Pesee key={f.name} libelle={nomFarine(f.name)} grammes={ph.flour_g * f.percent / 100} />)}
                <Pesee libelle="Eau" grammes={ph.water_g} />
                {ph.yeast_g > 0 && <Pesee libelle="Levure" grammes={ph.yeast_g} precis />}
                {ph.salt_g > 0 && <Pesee libelle="Sel" grammes={ph.salt_g} />}
                {ph.honey_g > 0 && <Pesee libelle="Miel" grammes={ph.honey_g} />}
                {ph.oil_g > 0 && <Pesee libelle="Huile" grammes={ph.oil_g} />}
              </div>
            </div>
          ))}
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
    </section>
  );
}

function Pesee({ libelle, grammes, precis }: { libelle: string; grammes: number; precis?: boolean }) {
  const txt = precis && grammes < 100 ? `${(Math.round(grammes * 10) / 10).toLocaleString("fr-FR")} g` : g(grammes);
  return (
    <div style={{ padding: "10px 14px", borderTop: "1px solid #f2ede4", minWidth: 0 }}>
      <div style={{ fontSize: 12, color: "#8a8378", textTransform: "uppercase", letterSpacing: ".05em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={libelle}>{libelle}</div>
      <div style={{ fontFamily: TITRE, fontWeight: 700, fontSize: 28, color: "#1a1a1a", lineHeight: 1.1, fontVariantNumeric: "tabular-nums" }}>{txt}</div>
    </div>
  );
}
