"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { useStatsVentes } from "@/components/analyse/useStatsVentes";
import { capacitesParJour, type Capacites } from "@/components/analyse/parJour";
import { COULEUR_EMPORTER, COULEUR_MIDI, COULEUR_SOIR, derniersJours, euros, moisEnCours, nombre, pct } from "@/components/analyse/gabarit";
import { Tuile } from "@/components/ui/Tuile";
import { BON, ATTENTION, INFO, MUTED, FAIBLE, BORD, CADRE, INTERTITRE, TD, liseret, pastille, filtre as styleFiltre } from "@/components/ui/charte";
import { cachedSupplierColor, loadSupplierColors } from "@/lib/supplierColors";

/**
 * Tableau de l'équipe (30/10/2026) : ce que la tablette montre le matin. Les chiffres de la veille, de la semaine ou
 * du mois en version simple (CA, couverts et ticket moyen midi / soir, à emporter, remplissage), la météo du jour,
 * et ce qu'il y a à faire : commandes à réceptionner ou à valider. Piccola Mia (journal Kezia) : CA, tickets, panier.
 */
type Periode = "hier" | "7j" | "mois";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const hier = () => { const d = new Date(); d.setDate(d.getDate() - 1); return { from: iso(d), to: iso(d) }; };
type Commande = { id: string; status: string; created_at: string; email_sent_at: string | null; total_ht: number | null; suppliers: { name: string } | null };
type Meteo = { service: string; emoji: string | null; description: string | null; temp: number | null };

export function TableauEquipe() {
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const etabId = etab?.id ?? "";
  const estPiccola = !!etab?.slug?.includes("piccola");
  const [periode, setPeriode] = useState<Periode>("hier");
  const range = useMemo(() => (periode === "hier" ? hier() : periode === "7j" ? derniersJours(7) : moisEnCours()), [periode]);
  const { stats, prec, chargement } = useStatsVentes(range, false, true);
  const [capacites, setCapacites] = useState<Capacites & { pour: string }>({ pour: "", salle: null, jardin: null });
  const [commandes, setCommandes] = useState<{ pour: string; liste: Commande[] }>({ pour: "", liste: [] });
  const [meteo, setMeteo] = useState<{ pour: string; services: Meteo[] }>({ pour: "", services: [] });

  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    const aujourdhui = iso(new Date());
    (async () => {
      await loadSupplierColors(supabase);
      const [obj, cmd, met] = await Promise.all([
        fetchApi(`/api/pilotage/objectifs?etablissement_id=${etabId}&equipe=1`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        supabase.from("commande_sessions").select("id, status, created_at, email_sent_at, total_ht, suppliers(name)").eq("etablissement_id", etabId).in("status", ["en_attente", "validee"]).order("created_at", { ascending: false }).limit(20),
        fetchApi(`/api/meteo?from=${aujourdhui}&to=${aujourdhui}`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (annule) return;
      const o = obj?.objectifs ?? {};
      setCapacites({ pour: etabId, salle: o.capacite_salle?.valeur ?? o.capacite_midi?.valeur ?? null, jardin: o.capacite_jardin?.valeur ?? null });
      setCommandes({ pour: etabId, liste: ((cmd.data ?? []) as unknown as Commande[]) });
      setMeteo({ pour: etabId, services: ((met?.meteo ?? []) as Meteo[]) });
    })();
    return () => { annule = true; };
  }, [etabId]);

  const cap = useMemo<Capacites>(() => (capacites.pour === etabId ? { salle: capacites.salle, jardin: capacites.jardin } : { salle: null, jardin: null }), [capacites, etabId]);
  const service = (svc: "midi" | "soir") => {
    const s = (stats?.services ?? []).filter((x) => x.svc === svc);
    const cov = s.reduce((t, x) => t + x.cov, 0), ttc = s.reduce((t, x) => t + x.sp_ttc, 0), ht = s.reduce((t, x) => t + x.sp_ht, 0);
    return { cov, ht, tm: cov > 0 ? ttc / cov : 0 };
  };
  const midi = service("midi"), soir = service("soir");
  const places = useMemo(() => { let m = 0, s = 0; for (const j of capacitesParJour(stats, cap).values()) { m += j.midi; s += j.soir; } return { midi: m, soir: s }; }, [stats, cap]);
  const remplissage = (cov: number, dispo: number) => (dispo > 0 ? (cov / dispo) * 100 : null);
  const rMidi = remplissage(midi.cov, places.midi), rSoir = remplissage(soir.cov, places.soir), rGlobal = remplissage(midi.cov + soir.cov, places.midi + places.soir);
  const couleurTaux = (r: number | null) => (r == null ? undefined : r >= 80 ? BON : r >= 50 ? ATTENTION : MUTED);
  const liste = commandes.pour === etabId ? commandes.liste : [];
  const aRecevoir = liste.filter((c) => c.status === "validee"), aValider = liste.filter((c) => c.status === "en_attente");
  const meteoJour = meteo.pour === etabId ? meteo.services : [];
  const libellePeriode = periode === "hier" ? "hier" : periode === "7j" ? "7 derniers jours" : "ce mois";
  const vide = !chargement && (!stats || stats.ca_ht === 0);

  return (
    <div style={{ display: "grid", gap: 12, marginBottom: 18 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        <span style={INTERTITRE}>L&apos;équipe · {etab?.nom ?? ""}</span>
        <span style={{ display: "inline-flex", gap: 6, marginLeft: "auto" }}>
          {([["hier", "Hier"], ["7j", "7 jours"], ["mois", "Ce mois"]] as const).map(([k, l]) => <button key={k} type="button" onClick={() => setPeriode(k)} style={styleFiltre(periode === k)}>{l}</button>)}
        </span>
      </div>

      {meteoJour.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "center", fontSize: 13, color: MUTED }}>
          <span style={{ fontWeight: 700, color: "#1a1a1a" }}>Aujourd&apos;hui</span>
          {meteoJour.map((m) => <span key={m.service}><span style={{ fontWeight: 600, color: m.service === "midi" ? COULEUR_MIDI : COULEUR_SOIR }}>{m.service === "midi" ? "Midi" : "Soir"}</span> {m.emoji ?? ""} {m.temp != null ? `${Math.round(m.temp)} °` : ""} {m.description ?? ""}</span>)}
        </div>
      )}

      {vide && <div style={{ ...CADRE, padding: 16, fontSize: 13, color: FAIBLE, textAlign: "center" }}>Pas encore de vente {libellePeriode === "hier" ? "hier" : `sur ${libellePeriode}`}.</div>}
      {stats && stats.ca_ht > 0 && (estPiccola ? (
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: 8, opacity: chargement ? 0.6 : 1 }}>
          <Tuile compacte={!bureau} icone="euro" libelle={`CA HT · ${libellePeriode}`} valeur={euros(stats.ca_ht)} sous={`${euros(stats.ca_ttc)} TTC${prec?.ca_ht ? ` · avant ${euros(prec.ca_ht)}` : ""}`} />
          <Tuile compacte={!bureau} icone="ticket" libelle="Tickets" valeur={nombre(stats.tickets)} sous={prec?.tickets ? `avant ${nombre(prec.tickets)}` : ""} />
          <Tuile compacte={!bureau} icone="couverts" libelle="Panier moyen" valeur={stats.tickets ? euros(stats.ca_ttc / stats.tickets, 1) : "—"} sous="TTC par ticket" />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(5, 1fr)" : "repeat(2, 1fr)", gap: 8, opacity: chargement ? 0.6 : 1 }}>
          <Tuile compacte={!bureau} icone="euro" libelle={`CA HT · ${libellePeriode}`} valeur={euros(stats.ca_ht)} sous={`${euros(stats.ca_ttc)} TTC${prec?.ca_ht ? ` · avant ${euros(prec.ca_ht)}` : ""}`} />
          <Tuile compacte={!bureau} icone="couverts" couleur={COULEUR_MIDI} libelle="Couverts midi" valeur={nombre(midi.cov)} sous={`${midi.tm ? euros(midi.tm, 1) : "—"} TTC par couvert · ${euros(midi.ht)} HT`} />
          <Tuile compacte={!bureau} icone="couverts" couleur={COULEUR_SOIR} libelle="Couverts soir" valeur={nombre(soir.cov)} sous={`${soir.tm ? euros(soir.tm, 1) : "—"} TTC par couvert · ${euros(soir.ht)} HT`} />
          <Tuile compacte={!bureau} icone="camion" couleur={COULEUR_EMPORTER} libelle="À emporter" valeur={euros(stats.place_emp_ht)} sous={stats.ca_ht ? `${pct((stats.place_emp_ht / stats.ca_ht) * 100)} du CA` : ""} />
          <Tuile compacte={!bureau} icone="ticket" couleur={couleurTaux(rGlobal)} libelle="Remplissage" valeur={rGlobal != null ? pct(rGlobal) : "—"} sous={rGlobal != null ? `midi ${rMidi != null ? pct(rMidi) : "—"} · soir ${rSoir != null ? pct(rSoir) : "—"}` : "capacité non réglée"} />
        </div>
      ))}

      {(aRecevoir.length > 0 || aValider.length > 0) && (
        <div style={CADRE}>
          <div style={{ padding: "12px 16px 6px", display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={INTERTITRE}>À faire</span>
            <Link href="/commandes" style={{ marginLeft: "auto", fontSize: 12.5, color: "#D4775A", fontWeight: 600, textDecoration: "none" }}>Commandes →</Link>
          </div>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <tbody>
              {[...aRecevoir, ...aValider].map((c) => {
                const nom = c.suppliers?.name ?? "Fournisseur";
                const recevoir = c.status === "validee";
                return (
                  <tr key={c.id}>
                    <td style={liseret(cachedSupplierColor(nom))} />
                    <td style={{ ...TD, fontWeight: 600 }}>{nom}<div style={{ fontSize: 11.5, color: MUTED, fontWeight: 400 }}>commande du {new Date(c.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}{c.total_ht ? ` · ${euros(c.total_ht)} HT` : ""}</div></td>
                    <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}><span style={pastille(recevoir ? INFO : ATTENTION)}>{recevoir ? "À réceptionner" : "À valider"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ padding: "6px 16px 12px", fontSize: 11.5, color: FAIBLE, borderTop: `1px solid ${BORD}` }}>À réceptionner : la livraison est attendue, contrôle-la à l&apos;arrivée. À valider : un responsable doit envoyer la commande.</div>
        </div>
      )}
    </div>
  );
}
