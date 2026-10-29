"use client";

import { Cadre, Note } from "@/components/analyse/Blocs";
import { GraphBarres } from "@/components/analyse/GraphBarres";
import { Tuile } from "@/components/ui/Tuile";
import { CADRE, TD, TH, liseret, MUTED, BON, MAUVAIS } from "@/components/ui/charte";
import { useBureau } from "@/hooks/useBureau";
import type { ReponseObjectifs } from "@/app/api/objectifs/route";
import { plancherHebdoTtc, plancherMensuelHt, servicesType } from "@/lib/objectifs";
import { eur, libMois, num, pct, Pastille } from "./commun";

/** Onglet Rythme de croisière : le plancher, le CA par mois face au plancher, le service type */
export function Rythme({ d }: { d: ReponseObjectifs }) {
  const bureau = useBureau();
  const { reglages: r } = d;
  const plancherMois = plancherMensuelHt(r.plancher, r.ttcHt);
  const plancherService = r.plancher.couverts * r.plancher.tm;
  const mois = d.mois.filter((m) => m.ca_ht > 0 || m.clos);
  const dernierClos = [...mois].reverse().find((m) => m.clos && m.ca_ht > 0);
  const enCours = d.mois[d.mois.length - 1];
  const types = servicesType(d.services);
  const nbServices = types.length;
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 8 }}>
        <Tuile libelle="Plancher mensuel HT" valeur={eur(plancherMois)} couleur="#1a1a1a" icone="euro" sous={`${r.plancher.couverts} × ${r.plancher.tm} € TTC × ${r.plancher.services} services`} />
        <Tuile libelle="Couverts par semaine" valeur={num(r.plancher.couverts * r.plancher.services)} couleur="#1a1a1a" icone="couverts" sous={`${eur(plancherHebdoTtc(r.plancher))} TTC par semaine`} />
        <Tuile libelle={dernierClos ? `Couverts par service, ${libMois(dernierClos.mois)}` : "Couverts par service"} valeur={dernierClos && dernierClos.services ? num(dernierClos.couverts / dernierClos.services) : "—"}
          couleur={dernierClos && dernierClos.services && dernierClos.couverts / dernierClos.services >= r.plancher.couverts ? BON : MAUVAIS} icone="ticket"
          sous={dernierClos ? `${num(dernierClos.couverts)} couverts, ${dernierClos.services} services · ${dernierClos.couverts ? eur(dernierClos.ca_ttc / dernierClos.couverts, 1) : "—"} TTC` : "pas encore de mois clos"} />
        <Tuile libelle={`${libMois(enCours.mois)} au ${d.aujourdhui.slice(8, 10)}`} valeur={eur(enCours.ca_ht)} couleur={enCours.ca_ht >= plancherMois ? BON : "#1a1a1a"} icone="euro"
          sous={enCours.services ? `${num(enCours.couverts / enCours.services)} couverts / service · ${enCours.couverts ? eur(enCours.ca_ttc / enCours.couverts, 1) : "—"} TTC` : "pas encore de vente"} />
      </div>

      <Cadre titre="Chiffre d'affaires HT par mois" sous="Ventes Popina, hors annulations. Le trait est le plancher du rythme de croisière.">
        <GraphBarres etiquettes={mois.map((m) => libMois(m.mois))} format={(v) => eur(v)}
          series={[{ libelle: "CA HT réalisé", couleur: "#1a1a1a", valeurs: mois.map((m) => m.ca_ht) }, { libelle: "Plancher", couleur: MUTED, valeurs: mois.map(() => plancherMois), courbe: true }]} />
        <Note>Le mois en cours est partiel. Objectif : chaque mois au-dessus du plancher, et un été qui finance l&apos;hiver.</Note>
      </Cadre>

      <div style={{ display: "grid", gridTemplateColumns: bureau ? "3fr 2fr" : "1fr", gap: 14, alignItems: "start" }}>
        <Cadre titre="Un service type" sous={`Moyenne par service des huit dernières semaines pleines · ${nbServices} services par semaine`} sansMarge>
          <div style={{ ...CADRE, border: 0, borderRadius: 0, marginTop: 10 }}>
            <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
              <colgroup><col style={{ width: 6 }} /><col /><col style={{ width: 70 }} /><col style={{ width: bureau ? 80 : 0 }} /><col style={{ width: 70 }} /><col style={{ width: 110 }} /></colgroup>
              <thead><tr>
                <th style={{ ...TH, padding: 0 }} /><th style={TH}>Service</th><th style={{ ...TH, textAlign: "right" }}>Couverts</th>
                {bureau && <th style={{ ...TH, textAlign: "right" }}>CA HT</th>}<th style={{ ...TH, textAlign: "right" }}>TM TTC</th><th style={{ ...TH, textAlign: "right" }}>vs plancher</th>
              </tr></thead>
              <tbody>
                {types.map((t) => {
                  const ecart = t.ca_ttc - plancherService;
                  return (
                    <tr key={t.libelle}>
                      <td style={liseret(ecart >= 0 ? BON : MAUVAIS)} />
                      <td style={{ ...TD, whiteSpace: "nowrap", fontWeight: 600 }}>{t.libelle}</td>
                      <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(t.couverts)}</td>
                      {bureau && <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(t.ca_ht)}</td>}
                      <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(t.tmTtc, 1)}</td>
                      <td style={{ ...TD, textAlign: "right" }}><Pastille niveau={ecart >= 0 ? "bon" : "mauvais"}>{ecart >= 0 ? "+" : "−"}{num(Math.abs(ecart))} €</Pastille></td>
                    </tr>
                  );
                })}
                {types.length === 0 && <tr><td colSpan={6} style={{ ...TD, color: MUTED, textAlign: "center", padding: 20 }}>Pas de vente sur les huit dernières semaines.</td></tr>}
              </tbody>
            </table>
          </div>
        </Cadre>
        <Cadre titre="Comment le suivi se lit">
          <div style={{ display: "grid", gap: 10, fontSize: 13.5, lineHeight: 1.45 }}>
            <div><b>Jour.</b> Après chaque clôture : couverts et CA du service contre le plancher ({r.plancher.couverts} × {r.plancher.tm} € = {eur(plancherService)} TTC). Vert au-dessus, rouge en dessous deux services de suite.</div>
            <div><b>Semaine.</b> Le lundi : CA de la semaine contre le plancher hebdo ({eur(plancherHebdoTtc(r.plancher))} TTC), achats commandés contre le budget achats de la semaine ({pct(r.objectifs.achats_matieres, 0)} du CA HT).</div>
            <div><b>Mois.</b> Le 5 du mois suivant : chaque poste Pennylane contre son budget (onglet Budget), masse salariale courante contre le ratio.</div>
          </div>
        </Cadre>
      </div>
    </div>
  );
}
