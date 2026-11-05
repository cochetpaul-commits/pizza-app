"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useProfile } from "@/lib/ProfileContext";
import { useBureau } from "@/hooks/useBureau";
import { libelleCouleur, score as calculerScore, type Question, type QuestionRepondue, type resumeEquipe } from "@/lib/quizVins";
import { BON, BORD, BTN, CADRE, INTERTITRE, MAUVAIS, MUTED, OSWALD, TD, TH, filtre, h1, pastille } from "@/components/ui/charte";

/**
 * Quiz vins (05/11/2026) : 10 questions fabriquées depuis les fiches de la Cave, 4 réponses, la bonne réponse et le
 * pitch après chaque question, le score à la fin. La série est enregistrée au nom de la personne (code tablette ou
 * compte). Les responsables voient en bas qui s'est entraîné et les vins les plus ratés.
 */
const COULEURS = ["tous", "rouge", "blanc", "champagne", "bulles", "rose", "doux"] as const;
type Resume = ReturnType<typeof resumeEquipe>;
const NB = 10;

export function QuizVins() {
  const bureau = useBureau();
  const { role } = useProfile();
  const responsable = role === "group_admin" || role === "manager";
  const [couleur, setCouleur] = useState<(typeof COULEURS)[number]>("tous");
  const [phase, setPhase] = useState<"accueil" | "question" | "fin">("accueil");
  const [questions, setQuestions] = useState<QuestionRepondue[]>([]);
  const [i, setI] = useState(0);
  const [choix, setChoix] = useState<number | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [enregistre, setEnregistre] = useState<string | null>(null);
  const [equipe, setEquipe] = useState<Resume | null>(null);

  const chargerEquipe = useCallback(async () => {
    if (!responsable) return;
    const r = await fetchApi("/api/quiz/vins?equipe=1").catch(() => null);
    if (r?.ok) setEquipe((await r.json()) as Resume);
  }, [responsable]);
  useEffect(() => { void chargerEquipe(); }, [chargerEquipe]);

  const commencer = async () => {
    setOccupe(true); setErreur(null);
    try {
      const r = await fetchApi(`/api/quiz/vins?n=${NB}&couleur=${couleur}`);
      const j = await r.json();
      if (!r.ok) { setErreur(j.error ?? "Quiz indisponible"); return; }
      setQuestions((j.questions as Question[]).map((q) => ({ ...q, reponse: null })));
      setI(0); setChoix(null); setEnregistre(null); setPhase("question");
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
    const r = await fetchApi("/api/quiz/vins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ filtre: couleur, questions }) }).catch(() => null);
    const j = r ? await r.json().catch(() => null) : null;
    setEnregistre(r?.ok ? `Série enregistrée au nom de ${j?.nom ?? "toi"}` : "Série non enregistrée (réseau).");
    void chargerEquipe();
  };

  const q = questions[i];
  const total = calculerScore(questions);
  const GROS: React.CSSProperties = { ...CADRE, padding: "16px 18px", textAlign: "left", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", width: "100%", touchAction: "manipulation" };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={h1(bureau)}>Quiz vins</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>{NB} questions tirées des fiches de la Cave. Pour s&apos;entraîner avant le service.</div>
        </div>
        <Link href="/cave" style={{ ...BTN, textDecoration: "none" }}>← La cave</Link>
      </div>
      {erreur && <div style={{ ...pastille(MAUVAIS), padding: "8px 12px", fontSize: 13 }}>{erreur}</div>}

      {phase === "accueil" && (
        <div style={{ ...CADRE, padding: 18, display: "grid", gap: 14 }}>
          <span style={INTERTITRE}>Sur quels vins ?</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {COULEURS.map((c) => <button key={c} type="button" onClick={() => setCouleur(c)} style={filtre(couleur === c)}>{c === "tous" ? "Toute la carte" : libelleCouleur(c).charAt(0).toUpperCase() + libelleCouleur(c).slice(1)}</button>)}
          </div>
          <button type="button" onClick={() => void commencer()} disabled={occupe} style={{ ...BTN, background: "#D4775A", borderColor: "#D4775A", color: "#fff", fontWeight: 700, height: 48, fontSize: 16, opacity: occupe ? 0.6 : 1 }}>{occupe ? "Préparation…" : `Commencer · ${NB} questions`}</button>
          <div style={{ fontSize: 12.5, color: MUTED }}>Cépages, région, domaine, appellation, prix de la bouteille, accords avec la carte, et « quel vin a cette bouche ». Après chaque réponse, la phrase à dire à la table.</div>
        </div>
      )}

      {phase === "question" && q && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, color: MUTED }}>
            <span>Question <b style={{ color: "#1a1a1a" }}>{i + 1}</b> / {questions.length}</span>
            <span>{total} juste{total > 1 ? "s" : ""}</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: "#f0ebe3", overflow: "hidden" }}><div style={{ width: `${((i + (choix != null ? 1 : 0)) / questions.length) * 100}%`, height: "100%", background: "#D4775A", transition: "width .25s" }} /></div>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 24 : 20, lineHeight: 1.2, textWrap: "balance", margin: "6px 0" }}>{q.question}</div>
          <div style={{ display: "grid", gap: 8 }}>
            {q.options.map((o, k) => {
              const bon = k === q.bonne, pris = k === choix;
              const teinte = choix == null ? BORD : bon ? BON : pris ? MAUVAIS : BORD;
              return (
                <button key={k} type="button" onClick={() => repondre(k)} disabled={choix != null}
                  style={{ ...GROS, boxShadow: `inset 6px 0 0 ${teinte}`, background: choix != null && bon ? `${BON}14` : choix != null && pris ? `${MAUVAIS}12` : "#fff", opacity: choix != null && !bon && !pris ? 0.55 : 1 }}>
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
            <div style={INTERTITRE}>Score</div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 56, lineHeight: 1, color: total >= questions.length * 0.8 ? BON : total >= questions.length * 0.5 ? "#b7791f" : MAUVAIS }}>{total} <span style={{ fontSize: 24, color: MUTED }}>/ {questions.length}</span></div>
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
            <button type="button" onClick={() => void commencer()} style={{ ...BTN, background: "#D4775A", borderColor: "#D4775A", color: "#fff", fontWeight: 700, height: 44 }}>Rejouer</button>
            <button type="button" onClick={() => setPhase("accueil")} style={{ ...BTN, height: 44 }}>Changer de sélection</button>
          </div>
        </div>
      )}

      {responsable && equipe && phase !== "question" && (
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <span style={INTERTITRE}>L&apos;équipe · 90 derniers jours</span>
          {equipe.personnes.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Personne ne s&apos;est encore entraîné.</div> : (
            <div style={CADRE}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead><tr><th style={TH}>Personne</th><th style={{ ...TH, textAlign: "right" }}>Séries</th><th style={{ ...TH, textAlign: "right" }}>Dernier</th><th style={{ ...TH, textAlign: "right" }}>Moyenne</th><th style={{ ...TH, textAlign: "right" }}>Meilleur</th></tr></thead>
                <tbody>
                  {equipe.personnes.map((p) => (
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
          {equipe.vinsRates.length > 0 && (
            <div style={CADRE}>
              <div style={{ padding: "12px 16px 6px" }}><span style={INTERTITRE}>Vins les plus ratés · à reprendre au briefing</span></div>
              {equipe.vinsRates.map((v) => (
                <div key={v.vin} style={{ display: "flex", justifyContent: "space-between", padding: "8px 16px", borderTop: `1px solid ${BORD}`, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{v.vin}</span><span style={{ color: MUTED }}>{v.rates} raté{v.rates > 1 ? "s" : ""} sur {v.posees}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
