"use client";

import { useEffect, useMemo, useState } from "react";
import { useEtabAuto } from "@/lib/useEtabAuto";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { Cadre, Note, Chargement, TH, TD, TDN } from "@/components/analyse/Blocs";
import { Tuile } from "@/components/ui/Tuile";
import { EtatVide } from "@/components/ui/EtatVide";
import { BON, ATTENTION, MAUVAIS, INFO, MUTED, FAIBLE, BTN, CHAMP, h1, liseret, pastille, filtre } from "@/components/ui/charte";
import { euros, nombre } from "@/components/analyse/gabarit";

/**
 * Clients › Programme de fidélité (27/11/2026), Piccola Mia seulement. Lecture de la base fidélité
 * (fidelite.piccolamia.fr) : chiffres, programmes, membres. Les réglages se font encore là-bas.
 */
const SITE = "https://fidelite.piccolamia.fr";

type Stats = {
  membres: number; nouveaux: number; passages: number; ca_traiteur_cts: number; credite_cts: number; utilise_cts: number; en_circulation_cts: number; actifs: number;
  meilleurs: { id: string; prenom: string; nom: string; passages: number; achats_cts: number }[];
  origines: Record<string, number>;
};
type Programme = { id: string; titre: string; type: string; actif: boolean; archive: boolean; membres: number; passages: number; design?: { couleur_fond?: string } | null };
type Offre = { id: string; titre: string; actif: boolean; utilises: number; remises_cts: number; bienvenue?: boolean; validite_jours?: number | null; fin: string | null };
type Reglages = { programmes: Programme[]; coupons: Offre[] };
type Membre = { id: string; prenom: string; nom: string; email: string; telephone: string | null; created_at: string; consent_marketing: boolean; nb_passages: number; dernier_passage: string | null; solde_cts: number };

const TYPES: Record<string, string> = { cashback: "Cashback", tampons: "Tampons", reduction: "Réduction", hybride: "Passages" };
const ORIGINES: Record<string, string> = { qr: "QR code", lien: "Lien", nfc: "Tag NFC", site: "Site web", parrainage: "Parrainage", boutique: "Boutique", affiche: "Affiche entreprise" };
const PERIODES: [number, string][] = [[7, "7 jours"], [30, "30 jours"], [90, "90 jours"], [365, "12 mois"]];
const jour = (d: string | null) => (d ? new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");

async function lire<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const r = await fetchApi(`/api/fidelite/${fn}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(args) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error ?? "Erreur");
  return j.data as T;
}

export function Fidelite() {
  useEtabAuto();
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const estPiccola = !!etab?.slug?.includes("piccola");
  const [jours, setJours] = useState(30);
  const [vue, setVue] = useState<"ensemble" | "membres">("ensemble");
  const [stats, setStats] = useState<Stats | null>(null);
  const [reglages, setReglages] = useState<Reglages | null>(null);
  const [membres, setMembres] = useState<{ total: number; lignes: Membre[] } | null>(null);
  const [recherche, setRecherche] = useState("");
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (!estPiccola) return;
    let annule = false;
    lire<Stats>("admin_stats", { p_jours: jours }).then((s) => { if (!annule) { setStats(s); setErreur(null); } }).catch((e: Error) => { if (!annule) setErreur(e.message); });
    return () => { annule = true; };
  }, [estPiccola, jours]);

  useEffect(() => {
    if (!estPiccola) return;
    let annule = false;
    lire<Reglages>("admin_reglages_programme", { p_programme: null }).then((r) => { if (!annule) setReglages(r); }).catch(() => {});
    return () => { annule = true; };
  }, [estPiccola]);

  useEffect(() => {
    if (!estPiccola || vue !== "membres") return;
    let annule = false;
    const attente = setTimeout(() => {
      lire<{ total: number; lignes: Membre[] }>("admin_clients", { p_q: recherche.trim(), p_limit: 200, p_offset: 0 }).then((m) => { if (!annule) setMembres(m); }).catch((e: Error) => { if (!annule) setErreur(e.message); });
    }, 250);
    return () => { annule = true; clearTimeout(attente); };
  }, [estPiccola, vue, recherche]);

  const programmes = useMemo(() => (reglages?.programmes ?? []).filter((p) => !p.archive).sort((a, b) => a.titre.localeCompare(b.titre, "fr")), [reglages]);
  const offres = useMemo(() => (reglages?.coupons ?? []).filter((o) => o.actif).sort((a, b) => a.titre.localeCompare(b.titre, "fr")), [reglages]);
  const origines = useMemo(() => Object.entries(stats?.origines ?? {}).sort((a, b) => b[1] - a[1]), [stats]);
  const totalOrigines = origines.reduce((t, [, n]) => t + n, 0);
  const lien = (chemin: string, texte: string, principal?: boolean) => (
    <a href={`${SITE}${chemin}`} target="_blank" rel="noreferrer" style={{ ...BTN, textDecoration: "none", ...(principal ? { background: "#D4775A", borderColor: "#D4775A", color: "#fff" } : {}) }}>{texte}</a>
  );

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, alignContent: "start" }}>
      <style>{`.fid-ligne:hover td{background:#f7f3ec}`}</style>
      <header style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={h1(bureau)}>Programme de fidélité</h1>
          <div style={{ fontSize: 13, color: MUTED, marginTop: 4 }}>Les cartes de fidélité de Piccola Mia : membres, passages, cagnottes et offres.</div>
        </div>
        {estPiccola && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{lien("/caisse", "Ouvrir la caisse")}{lien("/admin/programme", "Régler les programmes", true)}</div>}
      </header>

      {!estPiccola && <Cadre><EtatVide icone="equipe" titre="Réservé à Piccola Mia" texte="Le programme de fidélité concerne Piccola Mia. Passe sur Piccola Mia dans la barre latérale." /></Cadre>}
      {estPiccola && erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: MAUVAIS, fontSize: 13 }}>{erreur}</div>}

      {estPiccola && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
          <button type="button" style={filtre(vue === "ensemble")} onClick={() => setVue("ensemble")}>Vue d&apos;ensemble</button>
          <button type="button" style={filtre(vue === "membres")} onClick={() => setVue("membres")}>Membres{stats ? ` · ${nombre(stats.membres)}` : ""}</button>
          {vue === "ensemble" && <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PERIODES.map(([n, l]) => <button key={n} type="button" style={filtre(jours === n)} onClick={() => setJours(n)}>{l}</button>)}
          </span>}
        </div>
      )}

      {estPiccola && vue === "ensemble" && !stats && !erreur && <Chargement texte="Lecture de la fidélité…" />}
      {estPiccola && vue === "ensemble" && stats && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: bureau ? 10 : 8 }}>
            <Tuile compacte={!bureau} icone="equipe" couleur="#1a1a1a" libelle="Membres" valeur={nombre(stats.membres)} sous={`${nombre(stats.nouveaux)} nouveau${stats.nouveaux > 1 ? "x" : ""} sur la période`} />
            <Tuile compacte={!bureau} icone="ticket" couleur={INFO} libelle="Passages" valeur={nombre(stats.passages)} sous={`${nombre(stats.actifs)} membre${stats.actifs > 1 ? "s" : ""} venu${stats.actifs > 1 ? "s" : ""}`} />
            <Tuile compacte={!bureau} icone="euro" couleur={BON} libelle="Achats des membres" valeur={euros(stats.ca_traiteur_cts / 100)} sous="montants saisis en caisse" />
            <Tuile compacte={!bureau} icone="attente" couleur={stats.en_circulation_cts > 0 ? ATTENTION : BON} libelle="Cagnottes en cours" valeur={euros(stats.en_circulation_cts / 100, 2)} sous={`${euros(stats.credite_cts / 100, 2)} crédités · ${euros(stats.utilise_cts / 100, 2)} utilisés`} />
          </div>

          <Cadre titre="Programmes" sous="Une carte par programme. Les réglages s'ouvrent sur le site de la fidélité." sansMarge>
            {programmes.length === 0 ? <EtatVide compact titre="Aucun programme" texte="Crée le premier programme depuis le site de la fidélité." action={lien("/admin/programme?nouveau=1", "Créer un programme", true)} /> : (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr><th style={{ ...TH, width: 6, padding: 0 }} /><th style={TH}>Programme</th>{bureau && <th style={TH}>Type</th>}<th style={{ ...TH, textAlign: "right" }}>Membres</th><th style={{ ...TH, textAlign: "right" }}>Passages</th><th style={TH}>État</th></tr></thead>
                <tbody>
                  {programmes.map((p) => (
                    <tr key={p.id} className="fid-ligne" style={{ cursor: "pointer" }} onClick={() => window.open(`${SITE}/admin/programme?p=${p.id}`, "_blank", "noopener")}>
                      <td style={liseret(p.design?.couleur_fond ?? FAIBLE)} />
                      <td style={{ ...TD, fontWeight: 600 }}>{p.titre}{!bureau && <div style={{ fontSize: 12, color: MUTED, fontWeight: 400 }}>{TYPES[p.type] ?? p.type}</div>}</td>
                      {bureau && <td style={{ ...TD, color: MUTED }}>{TYPES[p.type] ?? p.type}</td>}
                      <td style={TDN}>{nombre(p.membres)}</td>
                      <td style={TDN}>{nombre(p.passages)}</td>
                      <td style={TD}><span style={pastille(p.actif ? BON : MAUVAIS)}>{p.actif ? "Actif" : "En pause"}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Cadre>

          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "1fr", gap: 14, alignItems: "start" }}>
            <Cadre titre="Offres en cours" sous="Programme principal">
              {offres.length === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Aucune offre active.</div> : offres.map((o, i) => (
                <div key={o.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderTop: i ? "1px solid #f0ebe2" : "none", fontSize: 13 }}>
                  <span style={{ minWidth: 0 }}><b>{o.titre}</b>{o.bienvenue && <span style={{ ...pastille(INFO), marginLeft: 8 }}>Bienvenue</span>}
                    <div style={{ color: MUTED, fontSize: 12, marginTop: 2 }}>{o.bienvenue && o.validite_jours ? `${o.validite_jours} jours après l'inscription` : o.fin ? `jusqu'au ${jour(o.fin)}` : "sans date de fin"}</div></span>
                  <span style={{ textAlign: "right", whiteSpace: "nowrap", color: MUTED }}>{nombre(o.utilises)} utilisée{o.utilises > 1 ? "s" : ""}{o.remises_cts ? <div style={{ fontSize: 12 }}>{euros(o.remises_cts / 100, 2)} de remises</div> : null}</span>
                </div>
              ))}
            </Cadre>
            <Cadre titre="D'où viennent les inscrits" sous="Sur la période choisie">
              {totalOrigines === 0 ? <div style={{ fontSize: 13, color: MUTED }}>Aucune inscription sur la période.</div> : origines.map(([k, n]) => (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "120px 1fr 36px", gap: 10, alignItems: "center", padding: "6px 0", fontSize: 13 }}>
                  <span>{ORIGINES[k] ?? k}</span>
                  <span style={{ height: 8, borderRadius: 4, background: "#f0ebe2", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${Math.round((n / totalOrigines) * 100)}%`, background: "#1a1a1a", borderRadius: 4 }} /></span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</span>
                </div>
              ))}
            </Cadre>
          </div>

          {stats.meilleurs.length > 0 && (
            <Cadre titre="Meilleurs clients" sous="Par nombre de passages sur la période" sansMarge>
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 12 }}>
                <thead><tr><th style={TH}>Client</th><th style={{ ...TH, textAlign: "right" }}>Passages</th><th style={{ ...TH, textAlign: "right" }}>Achats</th></tr></thead>
                <tbody>{stats.meilleurs.slice(0, 10).map((m) => (
                  <tr key={m.id}><td style={{ ...TD, fontWeight: 600 }}>{m.prenom} {m.nom}</td><td style={TDN}>{nombre(m.passages)}</td><td style={TDN}>{euros(m.achats_cts / 100, 2)}</td></tr>
                ))}</tbody>
              </table>
            </Cadre>
          )}
          <Note>Lecture seule pour l&apos;instant : la caisse, les programmes, les offres, les affiches et les notifications se règlent sur fidelite.piccolamia.fr, avec le même compte de gérance.</Note>
        </>
      )}

      {estPiccola && vue === "membres" && (
        <Cadre sansMarge>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid #ddd6c8", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <input value={recherche} onChange={(e) => setRecherche(e.target.value)} placeholder="Nom, email ou téléphone" style={{ ...CHAMP, borderRadius: 20, flex: "1 1 220px", minWidth: 0 }} />
            <span style={{ fontSize: 12.5, color: MUTED }}>{membres ? `${nombre(membres.total)} membre${membres.total > 1 ? "s" : ""}` : ""}</span>
          </div>
          {!membres ? <Chargement texte="Lecture des membres…" /> : membres.lignes.length === 0 ? <EtatVide compact icone="recherche" titre="Aucun membre" texte={recherche ? "Aucun membre ne correspond à cette recherche." : "Les inscrits apparaîtront ici."} /> : bureau ? (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th style={TH}>Membre</th><th style={TH}>Contact</th><th style={TH}>Inscrit le</th><th style={{ ...TH, textAlign: "right" }}>Passages</th><th style={TH}>Dernier passage</th><th style={{ ...TH, textAlign: "right" }}>Cagnotte</th></tr></thead>
              <tbody>{membres.lignes.map((m) => (
                <tr key={m.id} className="fid-ligne" style={{ cursor: "pointer" }} onClick={() => window.open(`${SITE}/admin/clients/${m.id}`, "_blank", "noopener")}>
                  <td style={{ ...TD, fontWeight: 600 }}>{m.prenom} {m.nom}{m.consent_marketing && <span style={{ ...pastille(BON), marginLeft: 8 }}>Newsletter</span>}</td>
                  <td style={{ ...TD, color: MUTED }}>{m.email}{m.telephone ? ` · ${m.telephone}` : ""}</td>
                  <td style={TD}>{jour(m.created_at)}</td>
                  <td style={TDN}>{nombre(m.nb_passages)}</td>
                  <td style={{ ...TD, color: m.dernier_passage ? "#1a1a1a" : FAIBLE }}>{jour(m.dernier_passage)}</td>
                  <td style={TDN}>{euros(m.solde_cts / 100, 2)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : (
            <div>{membres.lignes.map((m) => (
              <a key={m.id} href={`${SITE}/admin/clients/${m.id}`} target="_blank" rel="noreferrer" style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "10px 14px", borderBottom: "1px solid #f0ebe2", fontSize: 13, color: "#1a1a1a", textDecoration: "none" }}>
                <span style={{ minWidth: 0 }}><b>{m.prenom} {m.nom}</b>
                  <div style={{ color: MUTED, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre(m.nb_passages)} passage{m.nb_passages > 1 ? "s" : ""} · dernier {jour(m.dernier_passage)}</div></span>
                <span style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", fontWeight: 600 }}>{euros(m.solde_cts / 100, 2)}</span>
              </a>
            ))}</div>
          )}
        </Cadre>
      )}
    </div>
  );
}
