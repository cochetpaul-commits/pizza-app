"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import { score as calculerScore, type Question, type QuestionRepondue, type resumeEquipe } from "@/lib/quizVins";
import type { LigneClassement } from "@/lib/quizCarte";
import { ACCENT, ATTENTION, BON, BORD, BTN, CADRE, INTERTITRE, MAUVAIS, MUTED, OSWALD, TD, TH, filtre, h1, liseret, pastille } from "@/components/ui/charte";

/**
 * Quiz (12/11/2026) : un menu à part. Le quiz de la semaine (10 questions, la carte et les vins mélangés, une fois par
 * personne et par semaine) compte pour le classement du mois ; l'entraînement est libre et ne compte pas.
 * Les questions sont fabriquées depuis les fiches ; chaque série est enregistrée au nom de la personne (code tablette
 * ou compte). Les responsables voient en bas qui s'est entraîné et ce qui est le plus raté.
 */
type Theme = "carte" | "vins" | "semaine";
type Etat = {
  moi: string; mois: string; lundi: string;
  semaine: { score: number; sur: number } | null;
  classement: LigneClassement[];
  equipe: ReturnType<typeof resumeEquipe> | null;
};
const FILTRES: Record<"carte" | "vins", { cle: string; nom: string }[]> = {
  carte: [{ cle: "tous", nom: "Toute la cuisine" }, { cle: "ANTIPASTI", nom: "Antipasti" }, { cle: "CUCINA", nom: "Cucina" }, { cle: "DOLCI", nom: "Dolci" }, { cle: "PIZZE", nom: "Pizze" }, { cle: "boissons", nom: "Boissons (prix)" }],
  vins: [{ cle: "tous", nom: "Toute la cave" }, { cle: "blanc", nom: "Blanc" }, { cle: "bulles", nom: "Bulles" }, { cle: "champagne", nom: "Champagne" }, { cle: "doux", nom: "Doux" }, { cle: "rose", nom: "Rosé" }, { cle: "rouge", nom: "Rouge" }],
};
const moisPrecedent = (mois: string) => { const [a, m] = mois.split("-").map(Number); return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`; };
const nomMois = (mois: string) => new Date(`${mois}-15T12:00:00Z`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });

export function Quiz({ themeInitial }: { themeInitial?: "carte" | "vins" }) {
  const bureau = useBureau();
  const [theme, setTheme] = useState<"carte" | "vins">(themeInitial ?? "carte");
  const [selection, setSelection] = useState("tous");
  const [enCours, setEnCours] = useState<Theme>("carte");
  const [phase, setPhase] = useState<"accueil" | "question" | "fin">("accueil");
  const [questions, setQuestions] = useState<QuestionRepondue[]>([]);
  const [i, setI] = useState(0);
  const [choix, setChoix] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [moisVu, setMoisVu] = useState<string | null>(null);

  const chargerEtat = useCallback(async (mois?: string | null) => {
    const r = await fetchApi(`/api/quiz?etat=1${mois ? `&mois=${mois}` : ""}`).catch(() => null);
    if (r?.ok) setEtat((await r.json()) as Etat);
  }, []);
  useEffect(() => { void chargerEtat(moisVu); }, [chargerEtat, moisVu]);

  const commencer = async (t: Theme) => {
    setOccupe(true); setErreur(null);
    try {
      const r = await fetchApi(`/api/quiz?theme=${t}${t === "semaine" ? "" : `&filtre=${encodeURIComponent(selection)}`}`);
      const j = await r.json();
      if (!r.ok) { setErreur(j.error ?? "Quiz indisponible"); void chargerEtat(moisVu); return; }
      setQuestions((j.questions as Question[]).map((q) => ({ ...q, reponse: null })));
      setEnCours(t); setI(0); setChoix(null); setEnregistre(null); setPhase("question");
    } catch { setErreur("Réseau indisponible"); } finally { setOccupe(false); }
  };
  const repondre = (k: number) => {
    if (choix != null) return;
    setChoix(k);
    setQuestions((qs) => qs.map((q, idx) => (idx === i ? { ...q, reponse: k } : q)));
  };
  const suivant = async () => {
    if (i + 1 < questions.length) { setI(i + 1); setChoix(null); return; }
    setPhase("fin");
    const r = await fetchApi("/api/quiz", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ theme: enCours, filtre: enCours === "semaine" ? null : selection, questions }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setEnregistre(r?.ok ? `${enCours === "semaine" ? "Quiz de la semaine enregistré" : "Série enregistrée"} au nom de ${j?.nom ?? "toi"}` : j?.error ?? "Série non enregistrée (réseau).");
    void chargerEtat(moisVu);
  };

  const q = questions[i];
  const total = calculerScore(questions);
  const GROS: React.CSSProperties = { ...CADRE, padding: "16px 18px", textAlign: "left", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", width: "100%", touchAction: "manipulation" };
  const PLEIN: React.CSSProperties = { ...BTN, background: ACCENT, borderColor: ACCENT, color: "#fff", fontWeight: 700, height: 48, fontSize: 16 };
  const moisCourant = etat && (moisVu ?? etat.mois);

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14 }}>
      <div>
        <h1 style={h1(bureau)}>Quiz</h1>
        <div style={{ color: MUTED, fontSize: 13 }}>La carte et les vins, en 10 questions tirées des fiches.</div>
      </div>
      {erreur && <div style={{ ...pastille(MAUVAIS), padding: "8px 12px", fontSize: 13, whiteSpace: "normal" }}>{erreur}</div>}

      {phase === "accueil" && (
        <>
          <div style={{ ...CADRE, padding: 18, display: "grid", gap: 10, boxShadow: `inset 6px 0 0 ${etat?.semaine ? BON : ACCENT}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={INTERTITRE}>Quiz de la semaine</span>
              {etat?.semaine ? <span style={pastille(BON)}>Fait</span> : <span style={pastille(ACCENT)}>À faire</span>}
            </div>
            {etat?.semaine ? (
              <>
                <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 40, lineHeight: 1 }}>{etat.semaine.score} <span style={{ fontSize: 20, color: MUTED }}>/ {etat.semaine.sur}</span></div>
                <div style={{ fontSize: 13, color: MUTED }}>Compté pour le classement du mois (au nom de {etat.moi}). Le prochain ouvre lundi.</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 14 }}>10 questions, la carte et les vins mélangés. <b>Une seule fois par semaine</b> : le score compte pour le classement du mois{etat ? ` (au nom de ${etat.moi})` : ""}.</div>
                <button type="button" onClick={() => void commencer("semaine")} disabled={occupe || !etat} style={{ ...PLEIN, opacity: occupe || !etat ? 0.6 : 1 }}>{occupe ? "Préparation…" : "Faire le quiz de la semaine"}</button>
              </>
            )}
          </div>

          <div style={{ ...CADRE, padding: 18, display: "grid", gap: 12 }}>
            <span style={INTERTITRE}>S&apos;entraîner · ne compte pas</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["carte", "vins"] as const).map((t) => <button key={t} type="button" onClick={() => { setTheme(t); setSelection("tous"); }} style={{ ...filtre(theme === t), height: 40, padding: "0 16px", fontSize: 14 }}>{t === "carte" ? "La carte" : "Les vins"}</button>)}
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTRES[theme].map((f) => <button key={f.cle} type="button" onClick={() => setSelection(f.cle)} style={filtre(selection === f.cle)}>{f.nom}</button>)}
            </div>
            <button type="button" onClick={() => void commencer(theme)} disabled={occupe} style={{ ...BTN, height: 44, fontSize: 15, fontWeight: 700, background: "#1a1a1a", color: "#f2ede4", borderColor: "#1a1a1a", opacity: occupe ? 0.6 : 1 }}>S&apos;entraîner · 10 questions</button>
            <div style={{ fontSize: 12.5, color: MUTED }}>{theme === "carte" ? "Prix, composition des plats, « lequel de ces ingrédients », l'intrus." : "Cépages, région, domaine, appellation, prix de la bouteille, accords avec la carte."} Après chaque réponse, la fiche du plat ou la phrase à dire à la table.</div>
          </div>
        </>
      )}

      {phase === "question" && q && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: MUTED }}>
            <span>{enCours === "semaine" ? "Quiz de la semaine · " : ""}Question <b style={{ color: "#1a1a1a" }}>{i + 1}</b> / {questions.length}</span>
            <span>{total} juste{total > 1 ? "s" : ""}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", overflow: "hidden" }}><div style={{ width: `${((i + (choix != null ? 1 : 0)) / questions.length) * 100}%`, height: "100%", background: ACCENT, transition: "width .25s" }} /></div>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 24 : 20, lineHeight: 1.2, textWrap: "balance", margin: "6px 0" }}>{q.question}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {q.options.map((o, k) => {
              const bon = k === q.bonne, pris = k === choix;
              const teinte = choix == null ? BORD : bon ? BON : pris ? MAUVAIS : BORD;
              return (
                <button key={k} type="button" onClick={() => repondre(k)} disabled={choix != null}
                  style={{ ...GROS, boxShadow: `inset 6px 0 0 ${teinte}`, opacity: choix != null && !bon && !pris ? 0.55 : 1 }}>
                  <span style={{ color: MUTED, marginRight: 10, fontFamily: OSWALD }}>{"ABCD"[k]}</span>{o}
                </button>
              );
            })}
          </div>
          {choix != null && (
            <div style={{ ...CADRE, padding: "12px 16px", boxShadow: `inset 6px 0 0 ${choix === q.bonne ? BON : MAUVAIS}`, display: "grid", gap: 4 }}>
              <b style={{ color: choix === q.bonne ? BON : MAUVAIS }}>{choix === q.bonne ? "Juste." : `Non : ${q.options[q.bonne]}.`}</b>
              <span style={{ fontSize: 14 }}>{q.explication}</span>
            </div>
          )}
          <button type="button" onClick={() => void suivant()} disabled={choix == null} style={{ ...BTN, height: 48, fontSize: 16, fontWeight: 700, background: choix == null ? "#fff" : "#1a1a1a", color: choix == null ? MUTED : "#f2ede4", borderColor: choix == null ? BORD : "#1a1a1a" }}>
            {i + 1 < questions.length ? "Question suivante" : "Voir mon score"}
          </button>
        </div>
      )}

      {phase === "fin" && (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ ...CADRE, padding: 20, textAlign: "center" }}>
            <div style={INTERTITRE}>{enCours === "semaine" ? "Quiz de la semaine" : "Entraînement"}</div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 56, lineHeight: 1, color: total >= questions.length * 0.8 ? BON : total >= questions.length * 0.5 ? ATTENTION : MAUVAIS }}>{total} <span style={{ fontSize: 24, color: MUTED }}>/ {questions.length}</span></div>
            <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{enregistre ?? "Enregistrement…"}</div>
          </div>
          {questions.some((x) => x.reponse !== x.bonne) && (
            <div style={CADRE}>
              <div style={{ padding: "12px 16px 6px" }}><span style={INTERTITRE}>À revoir</span></div>
              {questions.filter((x) => x.reponse !== x.bonne).map((x, k) => (
                <div key={k} style={{ padding: "10px 16px", borderTop: `1px solid ${BORD}`, display: "grid", gap: 2 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{x.question}</span>
                  <span style={{ fontSize: 13.5 }}><b style={{ color: BON }}>{x.options[x.bonne]}</b>{x.reponse != null ? <span style={{ color: MUTED }}> · tu avais dit {x.options[x.reponse]}</span> : null}</span>
                  <span style={{ fontSize: 13, color: MUTED }}>{x.explication}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {enCours !== "semaine" && <button type="button" onClick={() => void commencer(enCours)} style={{ ...PLEIN, height: 44, fontSize: 14 }}>Rejouer</button>}
            <button type="button" onClick={() => setPhase("accueil")} style={{ ...BTN, height: 44 }}>Retour au quiz</button>
          </div>
        </div>
      )}

      {etat && moisCourant && phase !== "question" && (
        <div style={{ display: "grid", gap: 10, marginTop: 6 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={INTERTITRE}>Classement · {nomMois(moisCourant)}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={() => setMoisVu(null)} style={filtre(moisVu == null)}>Ce mois</button>
              <button type="button" onClick={() => setMoisVu(moisPrecedent(jourMois()))} style={filtre(moisVu != null)}>Mois dernier</button>
            </div>
          </div>
          {etat.classement.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Aucun quiz de la semaine joué ce mois-là.</div> : (
            <div style={CADRE}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={{ ...TH, width: 6, padding: 0 }} /><th style={TH}>Rang</th><th style={TH}>Personne</th><th style={{ ...TH, textAlign: "right" }}>Semaines</th><th style={{ ...TH, textAlign: "right" }}>Points</th></tr></thead>
                <tbody>
                  {etat.classement.map((p, k) => (
                    <tr key={p.nom + k}>
                      <td style={liseret(k === 0 ? BON : BORD)} />
                      <td style={{ ...TD, fontFamily: OSWALD, fontWeight: 700, fontSize: 16, width: 50 }}>{k + 1}</td>
                      <td style={{ ...TD, fontWeight: 600 }}>{p.nom}{p.nom === etat.moi ? <span style={{ color: MUTED, fontWeight: 400 }}> · toi</span> : null}</td>
                      <td style={{ ...TD, textAlign: "right", color: MUTED }}>{p.semaines}</td>
                      <td style={{ ...TD, textAlign: "right", fontWeight: 700 }}>{p.points} <span style={{ color: MUTED, fontWeight: 400 }}>/ {p.sur}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ fontSize: 12.5, color: MUTED }}>Les points sont la somme des quiz de la semaine du mois. Une semaine sautée, ce sont des points en moins.</div>
        </div>
      )}

      {etat?.equipe && phase !== "question" && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <span style={INTERTITRE}>L&apos;équipe · 90 derniers jours, entraînements compris</span>
          {etat.equipe.personnes.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Personne n&apos;a encore joué.</div> : (
            <div style={{ ...CADRE, overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Personne</th><th style={{ ...TH, textAlign: "right" }}>Séries</th><th style={{ ...TH, textAlign: "right" }}>Dernier</th><th style={{ ...TH, textAlign: "right" }}>Moyenne</th><th style={{ ...TH, textAlign: "right" }}>Meilleur</th></tr></thead>
                <tbody>
                  {etat.equipe.personnes.map((p) => (
                    <tr key={p.nom}>
                      <td style={{ ...TD, fontWeight: 600 }}>{p.nom}<div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>{new Date(p.derniereDate).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}</div></td>
                      <td style={{ ...TD, textAlign: "right" }}>{p.sessions}</td>
                      <td style={{ ...TD, textAlign: "right", fontWeight: 700 }}>{p.dernier} / {p.dernierSur}</td>
                      <td style={{ ...TD, textAlign: "right" }}>{p.totalSur ? Math.round((p.total / p.totalSur) * 100) : 0} %</td>
                      <td style={{ ...TD, textAlign: "right" }}>{p.meilleur} %</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {etat.equipe.vinsRates.length > 0 && (
            <div style={CADRE}>
              <div style={{ padding: "12px 16px 6px" }}><span style={INTERTITRE}>Les plus ratés · à reprendre au briefing</span></div>
              {etat.equipe.vinsRates.map((v) => (
                <div key={v.vin} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 16px", borderTop: `1px solid ${BORD}`, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{v.vin}</span><span style={{ color: MUTED, whiteSpace: "nowrap" }}>{v.rates} raté{v.rates > 1 ? "s" : ""} sur {v.posees}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Le mois en cours à Paris (AAAA-MM) */
function jourMois(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date());
}
