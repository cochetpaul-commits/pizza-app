"use client";

import { COULEUR_EMPORTER, COULEUR_MIDI, COULEUR_SOIR, FAIBLE, MUTED, euros, nombre, texteVariation, variation } from "@/components/analyse/gabarit";
import { Cadre, TH, TD } from "@/components/analyse/Blocs";
import type { StatsVentes } from "@/components/analyse/useStatsVentes";
import { liseret } from "@/components/ui/charte";

/**
 * Midi · Soir · À emporter en un coup d'œil (30/10/2026, demande de Paul) : CA HT, services, couverts,
 * couverts moyens par service et ticket moyen, avec la variation face à la période comparée.
 */
type Bloc = { ca_ht: number; ca_ttc: number; services: number; couverts: number };
function parService(s: StatsVentes | null): { midi: Bloc; soir: Bloc; emporter: Bloc } {
  const vide = (): Bloc => ({ ca_ht: 0, ca_ttc: 0, services: 0, couverts: 0 });
  const midi = vide(), soir = vide(), emporter = vide();
  const jours = new Set<string>();
  for (const x of s?.services ?? []) {
    const b = x.svc === "midi" ? midi : x.svc === "soir" ? soir : null;
    if (b) { b.ca_ht += x.sp_ht; b.ca_ttc += x.sp_ttc; b.couverts += x.cov; if (x.sp_ht > 0 || x.cov > 0) b.services++; }
    emporter.ca_ht += x.emp_ht; emporter.ca_ttc += x.emp_ttc;
    if (x.emp_ht > 0) jours.add(x.date);
  }
  emporter.services = jours.size;
  emporter.couverts = s?.cov_emp ?? 0;
  return { midi, soir, emporter };
}

export function ResumeServices({ stats, prec, titre = "Midi, soir, à emporter", sous = "Le CA, les couverts et le ticket moyen de chaque service sur la période, face à la période comparée." }: { stats: StatsVentes; prec: StatsVentes | null; titre?: string; sous?: string }) {
  const a = parService(stats), p = parService(prec);
  type Colonne = { cle: "midi" | "soir" | "emporter"; libelle: string; couleur: string; unite: string };
  const toutes: Colonne[] = [
    { cle: "midi", libelle: "Midi", couleur: COULEUR_MIDI, unite: "couverts" },
    { cle: "soir", libelle: "Soir", couleur: COULEUR_SOIR, unite: "couverts" },
    { cle: "emporter", libelle: "À emporter", couleur: COULEUR_EMPORTER, unite: "commandes" },
  ];
  const colonnes = toutes.filter((c) => a[c.cle].ca_ht > 0 || p[c.cle].ca_ht > 0);
  if (colonnes.length === 0) return null;
  const tm = (b: Bloc) => (b.couverts > 0 ? b.ca_ttc / b.couverts : 0);
  const moy = (b: Bloc) => (b.services > 0 ? b.couverts / b.services : 0);
  const caService = (b: Bloc) => (b.services > 0 ? b.ca_ht / b.services : 0);
  const lignes: { libelle: string; valeur: (b: Bloc) => number; format: (v: number, c: Colonne) => string; inverse?: boolean }[] = [
    { libelle: "CA HT", valeur: (b) => b.ca_ht, format: (v) => euros(v) },
    { libelle: "Services", valeur: (b) => b.services, format: (v) => nombre(v) },
    { libelle: "Couverts", valeur: (b) => b.couverts, format: (v, c) => `${nombre(v)} ${c.unite}` },
    { libelle: "Couverts moyens par service", valeur: moy, format: (v) => nombre(v, 1) },
    { libelle: "CA HT moyen par service", valeur: caService, format: (v) => euros(v) },
    { libelle: "Ticket moyen TTC", valeur: tm, format: (v) => euros(v, 2) },
  ];
  const delta = (v: number, pv: number) => {
    if (!prec || !(pv > 0)) return null;
    const d = variation(v, pv);
    return d == null ? null : <span style={{ fontSize: 11.5, color: d >= 0 ? "#4a6741" : "#b4443a", fontWeight: 600, marginLeft: 6 }}>{texteVariation(d)}</span>;
  };
  return (
    <Cadre titre={titre} sous={sous} sansMarge>
      <div style={{ overflowX: "auto", marginTop: 10 }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead><tr><th style={{ ...TH, padding: 0, width: 6 }} /><th style={TH} /><>{colonnes.map((c) => <th key={c.cle} style={{ ...TH, textAlign: "right", color: c.couleur }}>{c.libelle}</th>)}</></tr></thead>
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.libelle}>
                <td style={liseret(i === 0 ? "#1a1a1a" : "#ece6db")} />
                <td style={{ ...TD, fontWeight: i === 0 ? 700 : 500, color: i === 0 ? "#1a1a1a" : MUTED }}>{l.libelle}</td>
                {colonnes.map((c) => {
                  const v = l.valeur(a[c.cle]), pv = l.valeur(p[c.cle]);
                  return <td key={c.cle} style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: i === 0 ? 700 : 500, color: v > 0 ? "#1a1a1a" : FAIBLE }}>{v > 0 ? l.format(v, c) : "—"}{delta(v, pv)}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cadre>
  );
}
