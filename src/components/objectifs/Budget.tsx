"use client";

import { Cadre, Note } from "@/components/analyse/Blocs";
import { CADRE, TD, TH, liseret, MUTED, FAIBLE } from "@/components/ui/charte";
import { useBureau } from "@/hooks/useBureau";
import type { ReponseObjectifs } from "@/app/api/objectifs/route";
import { POSTES_BUDGET, montantPoste, statutBudget } from "@/lib/objectifs";
import { COULEUR_NIVEAU, eur, libMois, pct, Barre, Pastille } from "./commun";

/** Onglet Budget par poste : chaque poste Pennylane face à son objectif, mois par mois et en cumul */
export function Budget({ d }: { d: ReponseObjectifs }) {
  const bureau = useBureau();
  const { reglages: r } = d;
  const mois = d.mois.slice(-(bureau ? 6 : 3));
  const clos = d.mois.filter((m) => m.clos && m.ca_ht > 0 && m.paie_connue);
  const caCumul = clos.reduce((t, m) => t + m.ca_ht, 0);
  const incomplet = (m: ReponseObjectifs["mois"][number], lag?: boolean) => !m.clos || (!!lag && !m.paie_connue);
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <Cadre titre={`Postes contre budget, ${libMois(mois[0].mois)} à ${libMois(mois[mois.length - 1].mois)}`} sous="Réalisé : factures Pennylane du mois, divisées par le CA HT Popina du même mois. La masse salariale est rattachée au mois travaillé." sansMarge>
        <div style={{ ...CADRE, border: 0, borderRadius: 0, marginTop: 10, overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead><tr>
              <th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH}>Poste</th><th style={{ ...TH, textAlign: "right" }}>Référence</th><th style={{ ...TH, textAlign: "right" }}>Objectif</th>
              {mois.map((m) => <th key={m.mois} style={{ ...TH, textAlign: "right" }}>{libMois(m.mois)}</th>)}
            </tr></thead>
            <tbody>
              <tr>
                <td style={liseret("transparent")} /><td style={{ ...TD, color: MUTED }}>CA HT Popina</td><td style={TD} /><td style={TD} />
                {mois.map((m) => <td key={m.mois} style={{ ...TD, textAlign: "right", color: MUTED, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{eur(m.ca_ht)}{!m.clos && <span style={{ color: FAIBLE }}> (au {d.aujourdhui.slice(8, 10)})</span>}</td>)}
              </tr>
              {POSTES_BUDGET.map((p) => {
                const obj = r.objectifs[p.cle], ref = r.references[p.cle];
                const statuts = mois.map((m) => statutBudget(p, montantPoste(p, m.postes), m.ca_ht, incomplet(m, p.lag), obj));
                const dernier = [...statuts].reverse().find((s) => s.niveau !== "na");
                return (
                  <tr key={p.cle}>
                    <td style={liseret(dernier ? COULEUR_NIVEAU[dernier.niveau] : "transparent")} />
                    <td style={{ ...TD, fontWeight: 600, minWidth: 140 }}>{bureau ? p.libelle : p.court}</td>
                    <td style={{ ...TD, textAlign: "right", color: MUTED, whiteSpace: "nowrap" }}>{p.type === "pct" ? pct(ref) : `${eur(ref)} / mois`}</td>
                    <td style={{ ...TD, textAlign: "right", fontWeight: 700, whiteSpace: "nowrap" }}>{p.type === "pct" ? pct(obj) : eur(obj)}</td>
                    {mois.map((m, i) => {
                      const s = statuts[i], montant = montantPoste(p, m.postes);
                      return (
                        <td key={m.mois} style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>
                          <Pastille niveau={s.niveau}>{s.texte}</Pastille>
                          {s.niveau !== "na" && p.type === "pct" && <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{eur(montant)}</div>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "10px 16px 14px", fontSize: 12, color: MUTED }}>
          <Pastille niveau="bon">dans le budget</Pastille><Pastille niveau="attention">jusqu&apos;à +10 %</Pastille><Pastille niveau="mauvais">au-delà</Pastille><Pastille niveau="na">en cours</Pastille>
        </div>
      </Cadre>

      <Cadre titre={clos.length ? `Cumul ${libMois(clos[0].mois)} à ${libMois(clos[clos.length - 1].mois)}` : "Cumul"} sous="Barre : réalisé en % du CA HT (ou en € par mois). Trait : objectif. Mois clos dont la paie est connue.">
        {clos.length === 0 ? <div style={{ color: MUTED, fontSize: 13 }}>Pas encore de mois clos avec paie connue.</div> : (
          <div style={{ display: "grid", gap: 10 }}>
            {POSTES_BUDGET.map((p) => {
              const obj = r.objectifs[p.cle];
              const tot = clos.reduce((t, m) => t + montantPoste(p, m.postes), 0);
              const v = p.type === "pct" ? (tot / caCumul) * 100 : tot / clos.length;
              const echelle = p.type === "pct" ? Math.max(40, obj * 1.3, v * 1.1) : Math.max(obj, v) * 1.3;
              const niveau = v <= obj * 1.001 ? "bon" : v <= obj * 1.1 ? "attention" : "mauvais";
              return <Barre key={p.cle} libelle={p.court} valeur={v} objectif={obj} echelle={echelle} niveau={niveau} texte={p.type === "pct" ? `${pct(v)} · obj. ${pct(obj, 0)}` : `${eur(v)} · obj. ${eur(obj)}`} />;
            })}
          </div>
        )}
        <Note>Les objectifs se règlent dans l&apos;onglet Réglages ; la référence est la liasse du dernier exercice.</Note>
      </Cadre>
    </div>
  );
}
