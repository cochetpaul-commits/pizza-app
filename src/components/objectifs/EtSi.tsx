"use client";

import { useMemo, useState } from "react";
import { Cadre, Note } from "@/components/analyse/Blocs";
import { Tuile } from "@/components/ui/Tuile";
import { ACCENT, BON, BORD, BTN, CADRE, MAUVAIS, MUTED, OSWALD, TD, TH, liseret } from "@/components/ui/charte";
import { useBureau } from "@/hooks/useBureau";
import type { ReponseObjectifs } from "@/app/api/objectifs/route";
import { calculerSimulation, entreesParDefaut, heuresEquipe, masseSalariale, personneAjoutee, servicesType, type EntreesSimulateur, type Personne } from "@/lib/objectifs";
import { Champ, eur, num, pct } from "./commun";

/**
 * Onglet Et si… : l'activité (couverts, ticket moyen, services), l'équipe personne par personne
 * (contrats RH, à retirer ou à compléter), les charges, puis CA, EBE, seuil et capacité d'investissement.
 * Remonté (clé) à chaque rechargement des données : l'état initial suffit.
 */
export function EtSi({ d, onMemoriser }: { d: ReponseObjectifs; onMemoriser: (s: Partial<EntreesSimulateur>) => Promise<void> }) {
  const bureau = useBureau();
  const { reglages: r } = d;
  const reel = useMemo(() => entreesParDefaut(servicesType(d.services), d.mois.filter((m) => m.clos && m.ca_ht > 0 && m.paie_connue).slice(-3), r), [d, r]);
  const [v, setV] = useState<EntreesSimulateur>({ ...reel, ...(r.simulateur ?? {}) });
  const [equipe, setEquipe] = useState<Personne[]>(d.equipe);
  const [nAjout, setNAjout] = useState(0);
  /** Sans accès aux salaires (manager) : masse salariale chargée saisie d'un bloc, d'après le dernier mois connu */
  const dernierePaie = [...d.mois].reverse().find((m) => m.paie_connue)?.postes.masse_salariale ?? 0;
  const [msManuelle, setMsManuelle] = useState(Math.round(dernierePaie));
  const equipeCalcul = useMemo<Personne[]>(() => d.salaires ? equipe : [{ id: "ms", nom: "Équipe", poste: "", contrat: "", heures: 0, brut: msManuelle / (1 + v.chg / 100), actif: true, ajout: false, extra: false }], [d.salaires, equipe, msManuelle, v.chg]);
  const res = calculerSimulation(v, equipeCalcul, r);
  const plus = calculerSimulation({ ...v, cm: v.cm + 10, cs: v.cs + 10 }, equipeCalcul, r);
  const ms = masseSalariale(equipeCalcul, v.chg);
  const heures = heuresEquipe(equipeCalcul);
  const actifs = equipe.filter((e) => e.actif).length;
  const [etat, setEtat] = useState<string | null>(null);
  const set = (k: keyof EntreesSimulateur) => (x: number) => setV((s) => ({ ...s, [k]: x }));
  const ajouter = (type: "35" | "39" | "extra") => { const n = nAjout + 1; setNAjout(n); setEquipe((e) => [...e, personneAjoutee(type, n, v.brutH)]); };
  const memoriser = async () => { setEtat("Enregistrement…"); await onMemoriser(v); setEtat("Hypothèses mémorisées"); setTimeout(() => setEtat(null), 1800); };
  const colonnes = bureau ? "repeat(3, 1fr)" : "1fr 1fr";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
        <Tuile libelle="CA HT par mois" valeur={eur(res.caHt)} couleur="#1a1a1a" icone="euro" sous={`${num(res.couverts)} couverts`} />
        <Tuile libelle="EBE par mois" valeur={eur(res.ebe)} couleur={res.ebe >= 0 ? BON : MAUVAIS} icone="foodcost" sous={`${pct(res.caHt ? (res.ebe / res.caHt) * 100 : 0)} du CA (liasse : ${pct(7.3)})`} />
        <Tuile libelle="Capacité d'investissement par an" valeur={eur(res.invest * 12)} couleur={res.invest >= 0 ? BON : MAUVAIS} icone="recu" sous="après emprunts et impôt" />
        <Tuile libelle="Seuil de rentabilité HT par mois" valeur={eur(res.seuil)} couleur="#1a1a1a" icone="alerte" sous="charges fixes ÷ marge sur coûts variables" />
      </div>
      <div style={{ ...CADRE, padding: "10px 16px", display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", boxShadow: `inset 6px 0 0 ${plus.invest >= res.invest ? BON : MAUVAIS}` }}>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22 }}>{eur((plus.invest - res.invest) * 12)}</span>
        <span style={{ fontSize: 13.5, color: MUTED }}>d&apos;investissement en plus par an avec 10 couverts de plus par service, à équipe égale.</span>
      </div>

      <Cadre titre="Activité" sous="Point de départ : la moyenne par service des huit dernières semaines pleines.">
        <div style={{ display: "grid", gridTemplateColumns: colonnes, gap: 12 }}>
          <Champ libelle="Couverts midi, par service" valeur={v.cm} onChange={set("cm")} />
          <Champ libelle="Ticket moyen midi, TTC" valeur={v.tm} onChange={set("tm")} suffixe="€" />
          <Champ libelle="Services midi par semaine" valeur={v.nm} onChange={set("nm")} />
          <Champ libelle="Couverts soir, par service" valeur={v.cs} onChange={set("cs")} />
          <Champ libelle="Ticket moyen soir, TTC" valeur={v.ts} onChange={set("ts")} suffixe="€" />
          <Champ libelle="Services soir par semaine" valeur={v.ns} onChange={set("ns")} />
        </div>
      </Cadre>

      <Cadre titre="Équipe" sous={d.salaires ? "La masse salariale actuelle, personne par personne, d'après les contrats RH. Les gérants sont dans « Direction »." : "La masse salariale chargée du dernier mois connu. Le détail par personne est réservé aux admins."} sansMarge>
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "minmax(220px, 1fr) 2fr" : "1fr", gap: 12, padding: "12px 16px" }}>
          <div style={{ background: "#f7f3ec", borderRadius: 12, padding: "14px 16px", display: "grid", gap: 4, alignContent: "start" }}>
            <span style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: MUTED, fontWeight: 700 }}>Masse salariale chargée / mois</span>
            <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 30, lineHeight: 1.05, fontVariantNumeric: "tabular-nums" }}>{eur(ms)}</span>
            <span style={{ fontSize: 12.5, color: MUTED }}>{pct(res.caHt ? (ms / res.caHt) * 100 : 0)} du CA HT{d.salaires && <> · {actifs} personne{actifs > 1 ? "s" : ""} · {num(heures)} h de contrat par semaine{heures > 0 && <> · {eur(ms / ((heures * 52) / 12), 2)} de l&apos;heure chargé</>}</>}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: colonnes, gap: 12, alignContent: "start" }}>
            {!d.salaires && <Champ libelle="Masse salariale chargée par mois" valeur={msManuelle} onChange={setMsManuelle} pas={100} suffixe="€" source="Pennylane, dernier mois dont la paie est connue" />}
            <Champ libelle="Charges patronales" valeur={v.chg} onChange={set("chg")} pas={0.5} suffixe="%" source="URSSAF, retraite, prévoyance, mutuelle : taux constaté sur les bulletins" />
            <Champ libelle="Brut horaire d'une embauche" valeur={v.brutH} onChange={set("brutH")} pas={0.1} suffixe="€" source="SMIC hôtellerie 11,88 €" />
          </div>
        </div>
        {d.salaires && (
          <>
            <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead><tr>
                <th style={{ ...TH, padding: 0, width: 6 }} /><th style={{ ...TH, width: 44 }} /><th style={TH}>Personne</th>{bureau && <th style={TH}>Poste</th>}<th style={TH}>Contrat</th>
                <th style={{ ...TH, textAlign: "right" }}>Brut / mois</th><th style={{ ...TH, textAlign: "right" }}>Chargé / mois</th><th style={{ ...TH, width: 32 }} />
              </tr></thead>
              <tbody>
                {equipe.map((e) => {
                  const off = !e.actif;
                  const cel = { ...TD, opacity: off ? 0.45 : 1, textDecoration: off ? "line-through" : "none" } as const;
                  return (
                    <tr key={e.id}>
                      <td style={liseret(e.actif ? "#1a1a1a" : "transparent")} />
                      <td style={TD}>
                        <button type="button" role="switch" aria-checked={e.actif} aria-label={`${e.actif ? "Retirer" : "Remettre"} ${e.nom}`} onClick={() => setEquipe((l) => l.map((x) => (x.id === e.id ? { ...x, actif: !x.actif } : x)))}
                          style={{ width: 34, height: 20, borderRadius: 10, border: "none", background: e.actif ? "#1a1a1a" : BORD, position: "relative", cursor: "pointer", padding: 0 }}>
                          <span style={{ position: "absolute", top: 2, left: e.actif ? 16 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                        </button>
                      </td>
                      <td style={cel}><b>{e.nom}</b>{e.note && <div style={{ fontSize: 11.5, color: MUTED }}>{e.note}</div>}{!bureau && <div style={{ fontSize: 11.5, color: MUTED }}>{e.poste}</div>}</td>
                      {bureau && <td style={cel}>{e.poste}</td>}
                      <td style={{ ...cel, whiteSpace: "nowrap" }}>{e.contrat}</td>
                      <td style={{ ...cel, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{eur(e.brut)}</td>
                      <td style={{ ...cel, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 700 }}>{eur(e.brut * (1 + v.chg / 100))}</td>
                      <td style={TD}>{e.ajout && <button type="button" aria-label="Supprimer" onClick={() => setEquipe((l) => l.filter((x) => x.id !== e.id))} style={{ border: "none", background: "transparent", color: MAUVAIS, cursor: "pointer", fontSize: 14 }}>✕</button>}</td>
                    </tr>
                  );
                })}
                <tr>
                  <td style={{ ...liseret("transparent"), borderBottom: 0 }} /><td style={{ ...TD, borderBottom: 0 }} />
                  <td colSpan={bureau ? 3 : 2} style={{ ...TD, borderBottom: 0, fontWeight: 700 }}>Équipe active</td>
                  <td style={{ ...TD, borderBottom: 0, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{eur(equipe.filter((e) => e.actif).reduce((t, e) => t + e.brut, 0))}</td>
                  <td style={{ ...TD, borderBottom: 0, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{eur(ms)}</td><td style={{ ...TD, borderBottom: 0 }} />
                </tr>
              </tbody>
            </table>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "10px 16px 14px", borderTop: `1px solid ${BORD}` }}>
              <span style={{ fontSize: 13, color: MUTED, marginRight: 4 }}>Ajouter :</span>
              <button type="button" onClick={() => ajouter("35")} style={BTN}>CDI 35 h · {eur((35 * 52) / 12 * v.brutH)} brut</button>
              <button type="button" onClick={() => ajouter("39")} style={BTN}>CDI 39 h · {eur(((35 + 4 * 1.1) * 52) / 12 * v.brutH)} brut</button>
              <button type="button" onClick={() => ajouter("extra")} style={BTN}>Extra 10 h / semaine</button>
            </div>
          </>
        )}
      </Cadre>

      <Cadre titre="Charges" sous="D'après les trois derniers mois clos (Pennylane) et la liasse.">
        <div style={{ display: "grid", gridTemplateColumns: colonnes, gap: 12 }}>
          <Champ libelle="Achats matières" valeur={v.ach} onChange={set("ach")} pas={0.5} suffixe="% CA" source="cuisine, boissons, café" />
          <Champ libelle="Autres charges variables" valeur={v.variables} onChange={set("variables")} pas={0.5} suffixe="% CA" source="commissions CB, hygiène, entretien, petites fournitures" />
          <Champ libelle="Direction (holding)" valeur={v.dir} onChange={set("dir")} pas={100} suffixe="€ / mois" source="facturation de la holding" />
          <Champ libelle="Loyer" valeur={v.loyer} onChange={set("loyer")} pas={50} suffixe="€ / mois" />
          <Champ libelle="Autres charges fixes" valeur={v.fixes} onChange={set("fixes")} pas={100} suffixe="€ / mois" source="énergie, assurances, abonnements" />
        </div>
      </Cadre>

      <Cadre titre="Lecture, par mois" sansMarge>
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 10 }}>
          <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Par mois</th><th style={{ ...TH, textAlign: "right" }}>€</th><th style={{ ...TH, textAlign: "right" }}>% du CA</th></tr></thead>
          <tbody>
            {res.lignes.map(([n, x, total]) => (
              <tr key={n} style={total ? { background: "#faf7f1" } : undefined}>
                <td style={liseret(total ? (x >= 0 ? "#1a1a1a" : MAUVAIS) : "transparent")} />
                <td style={{ ...TD, fontWeight: total ? 700 : 400 }}>{n}</td>
                <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: total ? 700 : 400, color: x < 0 && total ? MAUVAIS : "#1a1a1a" }}>{eur(x)}</td>
                <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", color: MUTED }}>{res.caHt ? pct((x / res.caHt) * 100) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "12px 16px 14px" }}>
          <button type="button" onClick={() => void memoriser()} style={{ ...BTN, background: ACCENT, borderColor: ACCENT, color: "#fff" }}>Mémoriser ces hypothèses</button>
          <button type="button" onClick={() => { setV(reel); setEquipe(d.equipe); }} style={BTN}>Revenir au réel</button>
          {etat && <span style={{ fontSize: 12.5, color: MUTED }}>{etat}</span>}
        </div>
        <Note><span style={{ padding: "0 16px 12px", display: "block" }}>TVA : rapport TTC / HT de {r.ttcHt.toLocaleString("fr-FR")}. Emprunts {eur(r.emprunts)} par mois, impôt sur les sociétés {pct(r.tauxIs, 0)} de l&apos;EBE. Les équipements neufs ne sont pas dedans : réglables dans l&apos;onglet Réglages.</span></Note>
      </Cadre>
    </div>
  );
}
