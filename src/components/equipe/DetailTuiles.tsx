"use client";

import type { ReactNode } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { BORD, MUTED, FAIBLE, INTERTITRE, OSWALD, TH, TD, BON, MAUVAIS } from "@/components/ui/charte";

/**
 * Détail des tuiles de « Mon tableau » (04/11/2026, demande de Paul) : un clic sur une tuile ouvre ce volet.
 * Salle : mes chiffres par service, par jour, par catégorie, et le détail de chaque attache.
 * Équipe : les chiffres du restaurant jour par jour.
 */

const eur = (n: number, d = 0) => n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d }) + " €";
const nb = (n: number) => Math.round(n).toLocaleString("fr-FR");
const pct = (n: number) => `${Math.round(n)} %`;
const jour = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });

export type Chiffres = { ca: number; tickets: number; couverts: number };
export type DetailSalle = {
  jours: ({ date: string } & Chiffres)[];
  services: Record<string, Chiffres>;
  categories: { categorie: string; ca: number; qty: number }[];
  attaches: Record<string, { tables: number; total: number; produits: { n: string; qty: number }[] }>;
};
export type MesureSalle = "ca" | "tickets" | "couverts" | "ticket" | "panier";
type Stats = { ca: number; tickets: number; couverts: number; ticketMoyen: number; caParCouvert: number; attaches: Record<string, number> };

const MESURES: { k: MesureSalle; l: string; v: (c: Chiffres) => string }[] = [
  { k: "ca", l: "Ventes TTC", v: (c) => eur(c.ca) },
  { k: "tickets", l: "Tickets", v: (c) => nb(c.tickets) },
  { k: "couverts", l: "Couverts", v: (c) => nb(c.couverts) },
  { k: "ticket", l: "Ticket moyen", v: (c) => (c.tickets ? eur(c.ca / c.tickets, 2) : "—") },
  { k: "panier", l: "Panier / couvert", v: (c) => (c.couverts ? eur(c.ca / c.couverts, 2) : "—") },
];
const valeur = (k: MesureSalle, c: Chiffres) => (k === "ca" ? c.ca : k === "tickets" ? c.tickets : k === "couverts" ? c.couverts : k === "ticket" ? (c.tickets ? c.ca / c.tickets : 0) : c.couverts ? c.ca / c.couverts : 0);

const EXPLICATION: Record<MesureSalle, string> = {
  ca: "Le total TTC des tickets dont tu as saisi le plus de lignes (hors annulations). Un ticket partagé compte pour la personne qui l'a le plus servi.",
  tickets: "Le nombre de tickets (tables ou commandes) qui te sont attribués.",
  couverts: "Le nombre de couverts saisis sur tes tickets.",
  ticket: "Tes ventes TTC divisées par ton nombre de tickets : ce que rapporte une table en moyenne.",
  panier: "Tes ventes TTC divisées par tes couverts : ce que dépense un client en moyenne.",
};

function Bloc({ titre, children }: { titre: string; children: ReactNode }) {
  return <div style={{ marginTop: 18 }}><div style={{ ...INTERTITRE, marginBottom: 6 }}>{titre}</div>{children}</div>;
}

function Tableau({ entetes, lignes, fort }: { entetes: string[]; lignes: ReactNode[][]; fort?: number }) {
  return (
    <div style={{ border: `1px solid ${BORD}`, borderRadius: 12, overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
        <thead><tr>{entetes.map((h, i) => <th key={h} style={{ ...TH, textAlign: i === 0 ? "left" : "right" }}>{h}</th>)}</tr></thead>
        <tbody>{lignes.map((l, r) => <tr key={r}>{l.map((c, i) => <td key={i} style={{ ...TD, textAlign: i === 0 ? "left" : "right", whiteSpace: "nowrap", fontWeight: i === fort ? 700 : i === 0 ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const Comparaison = ({ moi, equipe, fmt, inverse = false }: { moi: number; equipe: number | null; fmt: (n: number) => string; inverse?: boolean }) => (
  <div style={{ display: "flex", gap: 18, alignItems: "baseline", flexWrap: "wrap" }}>
    <div><div style={{ fontSize: 11.5, color: MUTED }}>Toi</div><div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 34, lineHeight: 1.05 }}>{fmt(moi)}</div></div>
    {equipe != null && (
      <div><div style={{ fontSize: 11.5, color: MUTED }}>Moyenne de l&apos;équipe</div><div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 24, color: (inverse ? moi <= equipe : moi >= equipe) ? BON : MAUVAIS }}>{fmt(equipe)}</div></div>
    )}
  </div>
);

export function VoletSalle({ mesure, attache, detail, me, team, teamSize, libelleAttache, onFermer }: {
  mesure: MesureSalle | null; attache: string | null; detail: DetailSalle; me: Stats; team: Stats | null; teamSize: number;
  libelleAttache: (k: string) => string; onFermer: () => void;
}) {
  if (attache) {
    const a = detail.attaches[attache];
    const mien = me.attaches[attache] ?? 0, eq = team ? team.attaches[attache] ?? 0 : null;
    return (
      <VoletDroit titre={`Attache · ${libelleAttache(attache)}`} sousTitre="La part de tes tables qui en ont pris au moins un" onFermer={onFermer} largeur={560}>
        <Comparaison moi={mien} equipe={eq} fmt={pct} />
        <p style={{ fontSize: 13.5, marginTop: 10 }}><b>{nb(a?.tables ?? 0)}</b> tables sur <b>{nb(a?.total ?? 0)}</b> ont pris {libelleAttache(attache).toLowerCase()}.
          {eq != null && a && a.total > 0 && mien < eq ? <> À la moyenne de l&apos;équipe, ce serait environ <b>{nb((eq / 100) * a.total)}</b> tables, soit {nb((eq / 100) * a.total - a.tables)} de plus.</> : null}
        </p>
        {a && a.produits.length > 0 && (
          <Bloc titre="Ce que tes tables ont pris">
            <Tableau entetes={["Produit", "Quantité"]} lignes={a.produits.map((p) => [p.n, nb(p.qty)])} />
          </Bloc>
        )}
        <p style={{ fontSize: 12, color: FAIBLE, marginTop: 14 }}>Une table compte une fois, même avec plusieurs produits de la catégorie. Moyenne de l&apos;équipe : {teamSize} personne{teamSize > 1 ? "s" : ""} avec au moins 5 tickets sur la période.</p>
      </VoletDroit>
    );
  }
  const m = mesure ?? "ca";
  const def = MESURES.find((x) => x.k === m)!;
  const fort = MESURES.findIndex((x) => x.k === m) + 1;
  const moi = m === "ca" ? me.ca : m === "tickets" ? me.tickets : m === "couverts" ? me.couverts : m === "ticket" ? me.ticketMoyen : me.caParCouvert;
  const eq = team ? (m === "ca" ? team.ca : m === "tickets" ? team.tickets : m === "couverts" ? team.couverts : m === "ticket" ? team.ticketMoyen : team.caParCouvert) : null;
  const fmt = m === "ca" ? (n: number) => eur(n) : m === "ticket" || m === "panier" ? (n: number) => eur(n, 2) : nb;
  const svc = (["midi", "soir", "autre"] as const).filter((k) => detail.services[k]);
  const max = Math.max(1, ...detail.jours.map((j) => valeur(m, j)));
  const totalCa = detail.categories.reduce((t, c) => t + c.ca, 0);
  return (
    <VoletDroit titre={def.l === "Ventes TTC" ? "Mes ventes" : def.l} sousTitre={EXPLICATION[m]} onFermer={onFermer} largeur={640}>
      <Comparaison moi={moi} equipe={eq} fmt={fmt} />
      {svc.length > 0 && (
        <Bloc titre="Par service">
          <Tableau entetes={["Service", ...MESURES.map((x) => x.l)]} fort={fort}
            lignes={svc.map((k) => [k === "midi" ? "Midi" : k === "soir" ? "Soir" : "Sans service", ...MESURES.map((x) => x.v(detail.services[k]))])} />
        </Bloc>
      )}
      <Bloc titre="Jour par jour">
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead><tr><th style={{ ...TH, textAlign: "left" }}>Jour</th><th style={{ ...TH, textAlign: "left", width: "40%" }}>{def.l}</th><th style={{ ...TH, textAlign: "right" }}>Tickets</th><th style={{ ...TH, textAlign: "right" }}>Couverts</th></tr></thead>
            <tbody>
              {detail.jours.map((j) => (
                <tr key={j.date}>
                  <td style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{jour(j.date)}</td>
                  <td style={TD}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden" }}><div style={{ width: `${(valeur(m, j) / max) * 100}%`, height: "100%", background: "#D4775A" }} /></div>
                      <b style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", minWidth: 62, textAlign: "right" }}>{def.v(j)}</b>
                    </div>
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>{nb(j.tickets)}</td>
                  <td style={{ ...TD, textAlign: "right" }}>{nb(j.couverts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>
      {m === "ca" && detail.categories.length > 0 && (
        <Bloc titre="Par catégorie">
          <Tableau entetes={["Catégorie", "Ventes TTC", "Quantité", "Part"]} fort={1}
            lignes={detail.categories.map((c) => [c.categorie.charAt(0) + c.categorie.slice(1).toLowerCase(), eur(c.ca), nb(c.qty), totalCa ? pct((c.ca / totalCa) * 100) : "—"])} />
        </Bloc>
      )}
      <p style={{ fontSize: 12, color: FAIBLE, marginTop: 14 }}>Moyenne de l&apos;équipe : moyenne simple des {teamSize} personne{teamSize > 1 ? "s" : ""} qui ont au moins 5 tickets sur la période.</p>
    </VoletDroit>
  );
}

/* ── Tuiles de l'équipe (le restaurant) ── */
export type JourEquipe = { date: string; covMidi: number; covSoir: number; ht: number; emp: number; placesMidi: number; placesSoir: number };
export type MesureEquipe = "ca" | "midi" | "soir" | "emporter" | "remplissage";
const TITRES: Record<MesureEquipe, [string, string]> = {
  ca: ["Chiffre d'affaires", "Le CA hors taxes de chaque jour, sur place et à emporter."],
  midi: ["Couverts du midi", "Les couverts servis sur place au service du midi, jour par jour."],
  soir: ["Couverts du soir", "Les couverts servis sur place au service du soir, jour par jour."],
  emporter: ["À emporter", "Le CA hors taxes des ventes à emporter, jour par jour."],
  remplissage: ["Remplissage", "Les couverts divisés par les places disponibles (salle, plus le jardin les jours où il a servi). Au delà de 100 %, des tables ont tourné."],
};
export function VoletEquipe({ mesure, jours, onFermer }: { mesure: MesureEquipe; jours: JourEquipe[]; onFermer: () => void }) {
  const [titre, sous] = TITRES[mesure];
  const v = (j: JourEquipe) => mesure === "ca" ? j.ht : mesure === "midi" ? j.covMidi : mesure === "soir" ? j.covSoir : mesure === "emporter" ? j.emp
    : (j.placesMidi + j.placesSoir) > 0 ? ((j.covMidi + j.covSoir) / (j.placesMidi + j.placesSoir)) * 100 : 0;
  const fmt = (n: number) => (mesure === "ca" || mesure === "emporter" ? eur(n) : mesure === "remplissage" ? pct(n) : nb(n));
  const max = Math.max(1, ...jours.map(v));
  const total = jours.reduce((t, j) => t + v(j), 0);
  return (
    <VoletDroit titre={titre} sousTitre={sous} onFermer={onFermer} largeur={600}>
      {mesure !== "remplissage" && <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 30 }}>{fmt(total)} <span style={{ fontSize: 14, color: MUTED, fontFamily: "inherit", fontWeight: 500 }}>sur {jours.length} jour{jours.length > 1 ? "s" : ""}{jours.length > 1 ? ` · ${fmt(total / jours.length)} par jour` : ""}</span></div>}
      <Bloc titre="Jour par jour">
        <div style={{ border: `1px solid ${BORD}`, borderRadius: 12, overflow: "hidden" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 13 }}>
            <thead><tr><th style={{ ...TH, textAlign: "left" }}>Jour</th><th style={{ ...TH, textAlign: "left", width: "38%" }}>{titre}</th><th style={{ ...TH, textAlign: "right" }}>Midi</th><th style={{ ...TH, textAlign: "right" }}>Soir</th><th style={{ ...TH, textAlign: "right" }}>CA HT</th></tr></thead>
            <tbody>
              {jours.map((j) => (
                <tr key={j.date}>
                  <td style={{ ...TD, fontWeight: 600, whiteSpace: "nowrap" }}>{jour(j.date)}</td>
                  <td style={TD}><div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: "#f0ebe3", overflow: "hidden" }}><div style={{ width: `${Math.min(100, (v(j) / max) * 100)}%`, height: "100%", background: "#D4775A" }} /></div>
                    <b style={{ minWidth: 56, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(v(j))}</b></div></td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{nb(j.covMidi)}{mesure === "remplissage" && j.placesMidi ? <span style={{ color: FAIBLE }}> / {j.placesMidi}</span> : null}</td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{nb(j.covSoir)}{mesure === "remplissage" && j.placesSoir ? <span style={{ color: FAIBLE }}> / {j.placesSoir}</span> : null}</td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{eur(j.ht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>
      <p style={{ fontSize: 12, color: FAIBLE, marginTop: 12 }}>Midi et soir : couverts sur place. Seuls les jours avec des ventes sont listés.</p>
    </VoletDroit>
  );
}
