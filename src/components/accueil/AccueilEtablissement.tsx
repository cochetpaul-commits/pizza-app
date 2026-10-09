"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { T } from "@/lib/tokens";
import { DateRangePicker, type DateRange } from "@/components/ui/DateRangePicker";
import { Tuile, type TuileIcone } from "@/components/ui/Tuile";
import { IconBook, IconPackage, IconTruck, IconUsers } from "@/components/layout/Icons";

/**
 * Accueil « point du jour » d'un établissement (étape 2 de la refonte, 08/10/2026) :
 * date et bonjour, une phrase écrite à partir des chiffres, quatre indicateurs avec l'écart sur
 * l'an dernier, trois cartes d'attention, le CA de la semaine contre la semaine précédente,
 * midi / soir d'hier et la météo, l'équipe du jour, les meilleures ventes, les raccourcis.
 * Le matin, « aujourd'hui » vaut zéro : la période par défaut est hier.
 */

const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const DM_SANS = "var(--font-dm-sans), 'DM Sans', sans-serif";

type Mode = "hier" | "semaine" | "mois" | "dates";
type VenteJour = { jour: string; service: string; ca_ttc: number | string; tickets: number | string; couverts: number | string };
type Compteurs = {
  produits_actifs: number; produits_sans_prix: number; fiches: number; employes: number;
  commandes_brouillon: number; commandes_envoyees: number; factures_mois: number; factures_mois_ht: number | string;
};
type Shift = { employe: string; debut: string; fin: string; poste: string };
type Meteo = { date: string; service: string; emoji: string; desc: string; temp: number };
type Produit = { description: string; categorie: string; qty: number | string; ca_ttc: number | string };
type Commande = { fournisseur: string; status: string; created_at: string };
type Evenement = { id: string; name: string; date: string | null; covers: number | null; type: string | null };

const CARD: React.CSSProperties = {
  background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", padding: "14px 16px", minWidth: 0,
};

/* ── Dates (heure de Paris) ── */
const parisDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
function shift(date: string, days: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** Lundi de la semaine de `date` */
function lundi(date: string): string {
  const d = new Date(date + "T12:00:00Z");
  const j = (d.getUTCDay() + 6) % 7;
  return shift(date, -j);
}
const a1 = (date: string) => `${parseInt(date.slice(0, 4)) - 1}${date.slice(4)}`;
const jourLong = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const jourCourt = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
const nomJour = (date: string) => new Date(date + "T12:00:00").toLocaleDateString("fr-FR", { weekday: "long" });
const fmtEur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;
const fmtDec = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const num = (x: number | string | null | undefined) => Number(x) || 0;

/* ── Agrégats ── */
type Total = { ca: number; couverts: number; tickets: number; midi: Total0; soir: Total0 };
type Total0 = { ca: number; couverts: number };
function totaliser(rows: VenteJour[], from: string, to: string): Total {
  const t: Total = { ca: 0, couverts: 0, tickets: 0, midi: { ca: 0, couverts: 0 }, soir: { ca: 0, couverts: 0 } };
  for (const r of rows) {
    if (r.jour < from || r.jour > to) continue;
    const ca = num(r.ca_ttc), c = num(r.couverts);
    t.ca += ca; t.couverts += c; t.tickets += num(r.tickets);
    if (r.service === "midi") { t.midi.ca += ca; t.midi.couverts += c; }
    if (r.service === "soir") { t.soir.ca += ca; t.soir.couverts += c; }
  }
  return t;
}
const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : null);

export function AccueilEtablissement({ slug, couleur, evenements = false }: { slug: "bello" | "piccola"; couleur: string; evenements?: boolean }) {
  const { etablissements, setCurrent, setGroupView } = useEtablissement();
  const { can, displayName } = useProfile();
  const canSeePilotage = can("performances.view");
  const etab = useMemo(() => etablissements.find((e) => e.slug?.includes(slug)), [etablissements, slug]);

  const today = useMemo(() => parisDate(new Date()), []);
  const hier = useMemo(() => shift(today, -1), [today]);
  const semaineDebut = useMemo(() => lundi(today), [today]);
  const moisDebut = useMemo(() => today.slice(0, 8) + "01", [today]);

  const [mode, setMode] = useState<Mode>("hier");
  const [dates, setDates] = useState<DateRange>({ from: moisDebut, to: today });
  const periode = useMemo<DateRange>(() => {
    if (mode === "hier") return { from: hier, to: hier };
    if (mode === "semaine") return { from: semaineDebut, to: today };
    if (mode === "mois") return { from: moisDebut, to: today };
    return dates;
  }, [mode, hier, semaineDebut, moisDebut, today, dates]);
  // Même jour de semaine l'an dernier pour hier et la semaine ; même date pour le mois et les dates libres
  const periodeA1 = useMemo<DateRange>(() => (
    mode === "hier" || mode === "semaine"
      ? { from: shift(periode.from, -364), to: shift(periode.to, -364) }
      : { from: a1(periode.from), to: a1(periode.to) }
  ), [mode, periode]);

  const [ventes, setVentes] = useState<VenteJour[]>([]);        // deux semaines : semaine précédente + courante
  const [ventesPeriode, setVentesPeriode] = useState<VenteJour[]>([]);
  const [ventesA1, setVentesA1] = useState<VenteJour[]>([]);
  const [compteurs, setCompteurs] = useState<Compteurs | null>(null);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [meteo, setMeteo] = useState<Meteo[]>([]);
  const [top, setTop] = useState<Produit[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [events, setEvents] = useState<Evenement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (etab) { setCurrent(etab); setGroupView(false); }
  }, [etab, setCurrent, setGroupView]);

  // Données de la période (indicateurs)
  const chargerPeriode = useCallback(async () => {
    if (!etab || !canSeePilotage) { setLoading(false); return; }
    setLoading(true);
    const [cur, prev] = await Promise.all([
      supabase.rpc("accueil_ventes_jour", { p_etab: etab.id, p_from: periode.from, p_to: periode.to }),
      supabase.rpc("accueil_ventes_jour", { p_etab: etab.id, p_from: periodeA1.from, p_to: periodeA1.to }),
    ]);
    setVentesPeriode((cur.data ?? []) as VenteJour[]);
    setVentesA1((prev.data ?? []) as VenteJour[]);
    setLoading(false);
  }, [etab, canSeePilotage, periode, periodeA1]);
  useEffect(() => { chargerPeriode(); }, [chargerPeriode]);

  // Données du jour (une fois)
  useEffect(() => {
    if (!etab) return;
    let annule = false;
    (async () => {
      const [deuxSemaines, cpt, shiftsRes, meteoRes, produits, cmd, evts] = await Promise.all([
        canSeePilotage ? supabase.rpc("accueil_ventes_jour", { p_etab: etab.id, p_from: shift(semaineDebut, -7), p_to: today }) : Promise.resolve({ data: [] }),
        supabase.rpc("accueil_compteurs", { p_etab: etab.id, p_debut_mois: moisDebut }),
        supabase.from("shifts").select("employe_id, poste_id, heure_debut, heure_fin").eq("etablissement_id", etab.id).eq("date", today).order("heure_debut"),
        fetchApi(`/api/meteo?from=${today}&to=${shift(today, 2)}`).then((r) => r.json()).catch(() => null),
        canSeePilotage ? supabase.rpc("ventes_par_produit", { p_etab: etab.id, p_from: semaineDebut, p_to: today }) : Promise.resolve({ data: [] }),
        supabase.from("commande_sessions").select("status, created_at, suppliers(name)").eq("etablissement_id", etab.id)
          .in("status", ["brouillon", "en_attente", "validee", "envoyee"]).order("created_at", { ascending: false }).limit(12),
        evenements ? supabase.from("events").select("id, name, date, covers, type").gte("date", today).order("date").limit(6) : Promise.resolve({ data: [] }),
      ]);
      if (annule) return;
      setVentes((deuxSemaines.data ?? []) as VenteJour[]);
      const c = Array.isArray(cpt.data) ? cpt.data[0] : cpt.data;
      setCompteurs((c ?? null) as Compteurs | null);

      // Équipe du jour : noms et postes en deux requêtes courtes (pas de jointure à deviner)
      const rows = (shiftsRes.data ?? []) as { employe_id: string | null; poste_id: string | null; heure_debut: string; heure_fin: string }[];
      const empIds = [...new Set(rows.map((r) => r.employe_id).filter(Boolean))] as string[];
      const posteIds = [...new Set(rows.map((r) => r.poste_id).filter(Boolean))] as string[];
      const [emps, postes] = await Promise.all([
        empIds.length ? supabase.from("employes").select("id, prenom, nom").in("id", empIds) : Promise.resolve({ data: [] }),
        posteIds.length ? supabase.from("postes").select("id, nom").in("id", posteIds) : Promise.resolve({ data: [] }),
      ]);
      if (annule) return;
      const nomEmp = new Map(((emps.data ?? []) as { id: string; prenom: string; nom: string }[]).map((e) => [e.id, `${e.prenom ?? ""} ${e.nom ?? ""}`.trim()]));
      const nomPoste = new Map(((postes.data ?? []) as { id: string; nom: string }[]).map((p) => [p.id, p.nom]));
      setShifts(rows.map((r) => ({
        employe: (r.employe_id && nomEmp.get(r.employe_id)) || "?",
        debut: String(r.heure_debut ?? "").slice(0, 5), fin: String(r.heure_fin ?? "").slice(0, 5),
        poste: (r.poste_id && nomPoste.get(r.poste_id)) || "",
      })));

      setMeteo(((meteoRes?.meteo ?? []) as { date_service: string; service: string; emoji: string; description: string; temp: number }[])
        .map((m) => ({ date: m.date_service, service: m.service, emoji: m.emoji, desc: m.description, temp: m.temp })));
      setTop(((produits.data ?? []) as Produit[]).filter((p) => p.categorie !== "MESSAGES").sort((x, y) => num(y.ca_ttc) - num(x.ca_ttc)).slice(0, 6));
      setCommandes(((cmd.data ?? []) as { status: string; created_at: string; suppliers: { name: string } | { name: string }[] | null }[]).map((s) => ({
        fournisseur: (Array.isArray(s.suppliers) ? s.suppliers[0]?.name : s.suppliers?.name) ?? "?", status: s.status, created_at: s.created_at,
      })));
      setEvents((evts.data ?? []) as Evenement[]);
    })();
    return () => { annule = true; };
  }, [etab, canSeePilotage, semaineDebut, moisDebut, today, evenements]);

  /* ── Dérivés ── */
  const total = useMemo(() => totaliser(ventesPeriode, periode.from, periode.to), [ventesPeriode, periode]);
  const totalA1 = useMemo(() => totaliser(ventesA1, periodeA1.from, periodeA1.to), [ventesA1, periodeA1]);
  const ticket = total.couverts > 0 ? total.ca / total.couverts : 0;
  const ticketA1 = totalA1.couverts > 0 ? totalA1.ca / totalA1.couverts : 0;
  const hierTotal = useMemo(() => totaliser(ventes, hier, hier), [ventes, hier]);
  // Jours de fermeture de l'établissement (réglages) retirés du graphique : Bello Mio ne travaille pas le week-end
  const fermes = useMemo(() => new Set(etab?.jours_fermeture ?? []), [etab?.jours_fermeture]);
  const semaine = useMemo(() => {
    const jours = Array.from({ length: 7 }, (_, i) => shift(semaineDebut, i))
      .filter((j) => !fermes.has(new Date(`${j}T12:00:00`).getDay()));
    return jours.map((j) => ({
      date: j,
      ca: totaliser(ventes, j, j).ca,
      caPrec: totaliser(ventes, shift(j, -7), shift(j, -7)).ca,
      futur: j > today,
    }));
  }, [ventes, semaineDebut, today, fermes]);
  const brouillons = commandes.filter((c) => c.status === "brouillon" || c.status === "en_attente");
  const aReceptionner = commandes.filter((c) => c.status === "validee" || c.status === "envoyee");
  const meteoJour = (date: string, service: string) => meteo.find((m) => m.date === date && m.service === service);
  const prenom = (displayName ?? "").trim().split(/\s+/)[0] || "";

  /* ── La phrase du jour ── */
  const phrase = useMemo(() => {
    const parts: string[] = [];
    if (canSeePilotage && hierTotal.ca > 0) {
      const ref = totaliser(ventesA1, shift(hier, -364), shift(hier, -364));
      let s = `Hier, ${nomJour(hier)} : ${fmtEur(hierTotal.ca)} pour ${hierTotal.couverts} couverts`;
      const d = mode === "hier" ? delta(hierTotal.ca, ref.ca) : null;
      if (d != null) s += `, ${Math.abs(Math.round(d))} % ${d >= 0 ? "au-dessus" : "sous"} du même ${nomJour(hier)} de l'an dernier`;
      if (hierTotal.midi.couverts > 0 && hierTotal.soir.couverts > 0) {
        s += hierTotal.soir.ca >= hierTotal.midi.ca
          ? `, le soir a porté la journée (${hierTotal.soir.couverts} couverts)`
          : `, le midi a porté la journée (${hierTotal.midi.couverts} couverts)`;
      }
      parts.push(s + ".");
    }
    const m1 = meteoJour(today, "midi"), m2 = meteoJour(today, "soir");
    if (m1 || m2) {
      const bouts = [m1 ? `${m1.desc} à midi (${Math.round(m1.temp)}°)` : "", m2 ? `${m2.desc} ce soir` : ""].filter(Boolean);
      parts.push(`Aujourd'hui, ${bouts.join(" et ")}.`);
    }
    const actions: string[] = [];
    if (brouillons.length) actions.push(`${brouillons.length} commande${brouillons.length > 1 ? "s" : ""} attend${brouillons.length > 1 ? "ent" : ""} une validation`);
    actions.push(shifts.length ? `${shifts.length} personne${shifts.length > 1 ? "s" : ""} au planning aujourd'hui` : "aucun shift n'est planifié aujourd'hui");
    parts.push(actions.join(", et ") + ".");
    return parts.join(" ");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSeePilotage, hierTotal, ventesA1, hier, mode, meteo, today, brouillons.length, shifts.length]);

  const titrePeriode = mode === "hier" ? `hier` : mode === "semaine" ? "cette semaine" : mode === "mois" ? "ce mois" : "sur la période";
  const nomEtab = etab?.nom ?? (slug === "piccola" ? "Piccola Mia" : "Bello Mio");

  return (
    <div className="accueil-page" style={{ maxWidth: 1400, margin: "0 auto", padding: "22px 32px 60px", fontFamily: DM_SANS, display: "grid", gap: 16 }}>

      {/* En-tête */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: couleur }}>{jourLong(today)}</div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 30, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, margin: "2px 0 0", lineHeight: 1.05, color: T.dark }}>
            Bonjour{prenom ? `, ${prenom}` : ""}
          </h1>
          <div style={{ color: T.muted, fontSize: 13 }}>{nomEtab} · vue d&apos;ensemble</div>
        </div>
        {canSeePilotage && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3, background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10, padding: 3, fontSize: 12, fontWeight: 600 }}>
              {([["hier", "Hier"], ["semaine", "Semaine"], ["mois", "Mois"], ["dates", "Dates"]] as [Mode, string][]).map(([m, l]) => (
                <button key={m} type="button" onClick={() => setMode(m)} style={{
                  padding: "5px 11px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600, fontSize: 12,
                  background: mode === m ? couleur : "transparent", color: mode === m ? "#fff" : T.muted,
                }}>{l}</button>
              ))}
            </div>
            {mode === "dates" && <DateRangePicker value={dates} onChange={setDates} format="short" />}
          </div>
        )}
      </div>

      {/* Le point du jour */}
      <div style={{ ...CARD, borderLeft: `4px solid ${couleur}`, display: "grid", gridTemplateColumns: "44px 1fr", gap: 14, alignItems: "start" }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${couleur}1f`, display: "grid", placeItems: "center", fontSize: 20 }}>☀</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: couleur }}>Le point du jour</div>
          <p style={{ margin: "4px 0 0", fontSize: 15, lineHeight: 1.5, maxWidth: "80ch", color: T.dark }}>
            {loading && !phrase ? "Lecture des ventes…" : phrase || "Bienvenue. Les chiffres apparaîtront ici dès la première synchronisation des ventes."}
          </p>
        </div>
      </div>

      {/* Indicateurs */}
      {canSeePilotage && (
        <div className="accueil-kpis" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Kpi couleur={couleur} icone="euro" label={`CA TTC ${titrePeriode}`} value={fmtEur(total.ca)} delta={delta(total.ca, totalA1.ca)} sub={totalA1.ca > 0 ? `${fmtEur(totalA1.ca)} l'an dernier (${jourCourt(periodeA1.from)}${periodeA1.from !== periodeA1.to ? ` → ${jourCourt(periodeA1.to)}` : ""})` : "pas de comparaison l'an dernier"} loading={loading} href={`/ventes?from=${periode.from}&to=${periode.to}`} />
          <Kpi couleur="#b7791f" icone="couverts" label="Couverts" value={String(total.couverts)} delta={delta(total.couverts, totalA1.couverts)} sub={`${total.midi.couverts} midi · ${total.soir.couverts} soir`} loading={loading} />
          <Kpi couleur="#5F4B8B" icone="ticket" label="Ticket moyen" value={fmtDec(ticket)} delta={delta(ticket, ticketA1)} sub={ticketA1 > 0 ? `par couvert · ${fmtDec(ticketA1)} l'an dernier` : "par couvert"} loading={loading} />
          <Kpi couleur="#4a6741" icone="facture" label="Achats HT du mois" value={fmtEur(num(compteurs?.factures_mois_ht))} badge={compteurs ? `${compteurs.factures_mois} facture${compteurs.factures_mois > 1 ? "s" : ""}` : undefined} sub="importées depuis le 1er" loading={!compteurs} href="/achats" />
        </div>
      )}

      {/* Cartes d'attention */}
      <div className="accueil-trois" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        <Attention n={brouillons.length} ton={brouillons.length ? "warn" : "good"} titre={brouillons.length ? "Commandes à valider" : "Aucune commande en attente"} href="/commandes"
          sous={[brouillons.slice(0, 3).map((c) => c.fournisseur).join(", "), aReceptionner.length ? `${aReceptionner.length} envoyée${aReceptionner.length > 1 ? "s" : ""} à réceptionner` : ""].filter(Boolean).join(" · ") || "Rien à valider, rien à réceptionner."} />
        <Attention n={compteurs?.factures_mois ?? 0} ton="good" titre="Factures importées ce mois" href="/achats"
          sous={compteurs ? `${fmtEur(num(compteurs.factures_mois_ht))} HT depuis le 1er` : "…"} />
        <Attention n={compteurs?.produits_sans_prix ?? 0} ton={compteurs && compteurs.produits_sans_prix > 0 ? "bad" : "good"} titre="Produits sans prix d'achat" href="/ingredients"
          sous="Fiches actives sans offre fournisseur : les fiches techniques les comptent à zéro." />
      </div>

      {/* Semaine + midi/soir + météo */}
      {canSeePilotage && (
        <div className="accueil-deux" style={{ display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 12 }}>
          <div style={CARD}>
            <Titre droite={<Link href="/ventes" style={lien}>Ventes →</Link>}>Chiffre d&apos;affaires de la semaine</Titre>
            <GraphSemaine jours={semaine} couleur={couleur} />
          </div>
          <div style={CARD}>
            <Titre droite={<span style={badge("neutre")}>{jourCourt(hier)}</span>}>Midi / soir, hier</Titre>
            {hierTotal.ca > 0 ? (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ display: "flex", height: 14, borderRadius: 7, overflow: "hidden", gap: 2, background: "#f7f3ec" }}>
                  <span style={{ width: `${(hierTotal.midi.ca / hierTotal.ca) * 100}%`, background: T.dore }} />
                  <span style={{ width: `${(hierTotal.soir.ca / hierTotal.ca) * 100}%`, background: couleur }} />
                </div>
                <Repart label={`Midi · ${hierTotal.midi.couverts} couverts`} couleur={T.dore} valeur={fmtEur(hierTotal.midi.ca)} />
                <Repart label={`Soir · ${hierTotal.soir.couverts} couverts`} couleur={couleur} valeur={fmtEur(hierTotal.soir.ca)} />
              </div>
            ) : <div style={{ color: T.muted, fontSize: 13, padding: "6px 0" }}>Pas de vente enregistrée hier.</div>}
            <div style={{ marginTop: 16 }}><Titre>Météo</Titre></div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[0, 1, 2].map((i) => {
                const d = shift(today, i);
                const m1 = meteoJour(d, "midi"), m2 = meteoJour(d, "soir");
                return (
                  <div key={d} style={{ background: "#f7f3ec", borderRadius: 10, padding: "8px 10px", fontSize: 12, color: T.muted }}>
                    <b style={{ display: "block", color: T.dark, fontSize: 13 }}>{i === 0 ? "Aujourd'hui" : nomJour(d).replace(/^./, (c) => c.toUpperCase())}</b>
                    <span style={{ display: "block", fontSize: 18, margin: "2px 0" }}>{m1?.emoji ?? m2?.emoji ?? "–"}</span>
                    {m1 ? `${Math.round(m1.temp)}° ${m1.desc} midi` : ""}{m1 && m2 ? " · " : ""}{m2 ? `${m2.desc} soir` : ""}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Équipe + meilleures ventes (+ événements) */}
      <div className="accueil-deux" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={CARD}>
          <Titre droite={<Link href="/rh/equipe" style={lien}>Équipe →</Link>}>Équipe du jour</Titre>
          {shifts.length === 0 ? (
            <div style={{ padding: "18px 10px", textAlign: "center", color: T.muted, fontSize: 13 }}>
              <b style={{ display: "block", color: T.dark, marginBottom: 4 }}>Aucun shift planifié pour aujourd&apos;hui</b>
              Le planning de la semaine du {jourCourt(semaineDebut)} n&apos;est pas rempli.
            </div>
          ) : shifts.map((s, i) => (
            <div key={i} style={ligne}>
              <span style={{ width: 30, height: 30, borderRadius: "50%", background: `${couleur}22`, color: couleur, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                {s.employe.split(/\s+/).map((p) => p[0]).join("").slice(0, 2).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{s.employe}</span>
              {s.poste && <span style={{ color: T.muted, fontSize: 12 }}>{s.poste}</span>}
              <span style={badge("neutre")}>{s.debut}–{s.fin}</span>
            </div>
          ))}
        </div>
        {evenements ? (
          <div style={CARD}>
            <Titre droite={<Link href="/evenements" style={lien}>Événements →</Link>}>Prochains événements</Titre>
            {events.length === 0 ? <div style={{ color: T.muted, fontSize: 13, padding: "6px 0" }}>Aucun événement à venir.</div> : events.map((ev) => (
              <Link key={ev.id} href={`/evenements/${ev.id}`} style={{ ...ligne, textDecoration: "none", color: T.dark }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{ev.name}</span>
                {ev.covers ? <span style={{ color: T.muted, fontSize: 12 }}>{ev.covers} couverts</span> : null}
                <span style={badge("neutre")}>{ev.date ? jourCourt(ev.date) : "à dater"}</span>
              </Link>
            ))}
          </div>
        ) : canSeePilotage && (
          <div style={CARD}>
            <Titre droite={<span style={badge("neutre")}>{jourCourt(semaineDebut)} → {jourCourt(today)}</span>}>Meilleures ventes de la semaine</Titre>
            {top.length === 0 ? <div style={{ color: T.muted, fontSize: 13, padding: "6px 0" }}>Pas encore de vente cette semaine.</div> : top.map((p, i) => (
              <div key={i} style={ligne}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 600 }}>{p.description}</span>
                <span style={{ color: T.muted, fontSize: 12 }}>{Math.round(num(p.qty))} vendus</span>
                <span style={{ fontFamily: OSWALD, fontSize: 15, fontVariantNumeric: "tabular-nums" }}>{fmtEur(num(p.ca_ttc))}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Raccourcis */}
      <div>
        <Titre>Mon restaurant</Titre>
        <div className="accueil-raccourcis" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <Raccourci icone={<IconTruck size={18} />} href="/commandes" titre="Commandes" sous={compteurs ? `${compteurs.commandes_brouillon + compteurs.commandes_envoyees} en cours` : "…"} couleur={couleur} />
          <Raccourci icone={<IconPackage size={18} />} href="/ingredients" titre="Base produits" sous={compteurs ? `${compteurs.produits_actifs.toLocaleString("fr-FR")} produits actifs` : "…"} couleur={couleur} />
          <Raccourci icone={<IconBook size={18} />} href="/carte?vue=fiches" titre="Fiches techniques" sous={compteurs ? `${compteurs.fiches} fiches` : "…"} couleur={couleur} />
          <Raccourci icone={<IconUsers size={18} />} href="/rh/equipe" titre="Équipe" sous={compteurs ? `${compteurs.employes} employés` : "…"} couleur={couleur} />
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .accueil-page { padding: 16px 14px 100px !important; }
          .accueil-kpis { grid-template-columns: repeat(2, 1fr) !important; }
          .accueil-trois, .accueil-deux { grid-template-columns: 1fr !important; }
          .accueil-raccourcis { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

/* ── Sous-composants ── */
const lien: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#D4775A", textDecoration: "none" };
const ligne: React.CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderTop: "1px solid #eee6d9", fontSize: 13 };
function badge(ton: "neutre" | "good" | "warn" | "bad"): React.CSSProperties {
  const c = ton === "good" ? ["#4a6741", "rgba(74,103,65,0.12)"] : ton === "warn" ? ["#b7791f", "rgba(183,121,31,0.12)"] : ton === "bad" ? ["#b4443a", "rgba(180,68,58,0.12)"] : ["#6f6a61", "rgba(0,0,0,0.05)"];
  return { fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, color: c[0], background: c[1], whiteSpace: "nowrap" };
}

function Titre({ children, droite }: { children: React.ReactNode; droite?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
      <b style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: T.muted }}>{children}</b>
      {droite}
    </div>
  );
}

function Kpi({ label, value, delta: d, sub, badge: b, loading, href, couleur, icone }: { label: string; value: string; delta?: number | null; sub?: string; badge?: string; loading: boolean; href?: string; couleur: string; icone: TuileIcone }) {
  const ton = d == null ? null : Math.abs(d) < 1 ? "flat" : d > 0 ? "up" : "down";
  // Variation et badge au début de la ligne de détail : l'icône reste en haut à droite, le libellé n'est jamais écrasé sur téléphone
  const variation = ton ? (
    <b style={{ color: ton === "up" ? "#4a6741" : ton === "down" ? "#b4443a" : T.muted, whiteSpace: "nowrap" }}>
      {d! > 0 ? "▲" : d! < 0 ? "▼" : ""} {Math.abs(d!).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
    </b>
  ) : b ? <b style={{ color: T.dark, whiteSpace: "nowrap" }}>{b}</b> : null;
  const detail = variation ? <>{variation}{sub ? ` · ${sub}` : ""}</> : sub;
  const tuile = <Tuile libelle={label} icone={icone} couleur={couleur} sous={detail} valeur={<span style={{ opacity: loading ? 0.4 : 1, transition: "opacity .2s" }}>{value}</span>} />;
  return href ? <Link href={href} style={{ textDecoration: "none", display: "block" }}>{tuile}</Link> : tuile;
}

function Attention({ n, ton, titre, sous, href }: { n: number; ton: "good" | "warn" | "bad"; titre: string; sous: string; href: string }) {
  const c = ton === "good" ? ["#4a6741", "rgba(74,103,65,0.12)"] : ton === "warn" ? ["#b7791f", "rgba(183,121,31,0.12)"] : ["#b4443a", "rgba(180,68,58,0.12)"];
  return (
    <Link href={href} style={{ ...CARD, display: "grid", gridTemplateColumns: "56px 1fr", gap: 12, alignItems: "center", textDecoration: "none", color: T.dark }}>
      <div style={{ width: 56, height: 56, borderRadius: 14, background: c[1], color: c[0], display: "grid", placeItems: "center", fontFamily: OSWALD, fontSize: 24 }}>{n}</div>
      <div><div style={{ fontWeight: 700 }}>{titre}</div><div style={{ color: T.muted, fontSize: 12.5 }}>{sous}</div></div>
    </Link>
  );
}

function Repart({ label, couleur, valeur }: { label: string; couleur: string; valeur: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
      <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: couleur, marginRight: 6, verticalAlign: -1 }} />{label}</span>
      <b style={{ fontFamily: OSWALD, fontSize: 16 }}>{valeur}</b>
    </div>
  );
}

function Raccourci({ href, titre, sous, couleur, icone }: { href: string; titre: string; sous: string; couleur: string; icone: React.ReactNode }) {
  return (
    <Link href={href} style={{ ...CARD, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, textDecoration: "none", color: T.dark }}>
      <span style={{ width: 38, height: 38, borderRadius: "50%", background: `${couleur}1f`, color: couleur, display: "grid", placeItems: "center", flexShrink: 0 }}>
        {icone}
      </span>
      <span><b style={{ display: "block", fontSize: 13.5 }}>{titre}</b><span style={{ fontSize: 12, color: T.muted }}>{sous}</span></span>
      <span style={{ marginLeft: "auto", color: "#a39d92" }}>→</span>
    </Link>
  );
}

/** Barres de la semaine : semaine courante en couleur, semaine précédente (mêmes jours) en gris derrière. Une seule échelle. */
function GraphSemaine({ jours, couleur }: { jours: { date: string; ca: number; caPrec: number; futur: boolean }[]; couleur: string }) {
  const max = Math.max(1000, ...jours.flatMap((j) => [j.ca, j.caPrec]));
  const pas = max > 8000 ? 5000 : max > 4000 ? 2500 : 1000;
  const haut = Math.ceil(max / pas) * pas;
  const H = 150, base = 170, gauche = 52, largeur = 580;
  const y = (v: number) => base - (v / haut) * H;
  const col = largeur / Math.max(1, jours.length);
  const totalCur = jours.reduce((s, j) => s + j.ca, 0);
  const totalPrec = jours.filter((j) => !j.futur).reduce((s, j) => s + j.caPrec, 0);
  const graduations = Array.from({ length: haut / pas + 1 }, (_, i) => i * pas);
  return (
    <div>
      <svg viewBox="0 0 640 215" style={{ width: "100%", height: "auto", display: "block" }} role="img" aria-label="CA TTC par jour, semaine courante et semaine précédente">
        {graduations.map((g) => (
          <g key={g}>
            <line x1={gauche} x2={gauche + largeur} y1={y(g)} y2={y(g)} stroke="#ddd6c8" strokeWidth={1} strokeDasharray={g === 0 ? undefined : "2 4"} />
            <text x={gauche - 8} y={y(g) + 4} fontSize={11} fill="#6f6a61" textAnchor="end">{g === 0 ? "0" : `${(g / 1000).toLocaleString("fr-FR")} k€`}</text>
          </g>
        ))}
        {jours.map((j, i) => {
          const x0 = gauche + i * col;
          return (
            <g key={j.date}>
              {j.caPrec > 0 && <rect x={x0 + col / 2 - 24} y={y(j.caPrec)} width={22} height={base - y(j.caPrec)} rx={4} fill="#d9d0c2" />}
              {j.ca > 0 && <rect x={x0 + col / 2 + 2} y={y(j.ca)} width={22} height={base - y(j.ca)} rx={4} fill={couleur} />}
              {j.ca > 0 && <text x={x0 + col / 2 + 13} y={y(j.ca) - 6} fontSize={11} fontWeight={600} fill="#1a1a1a" textAnchor="middle">{Math.round(j.ca).toLocaleString("fr-FR")}</text>}
              <text x={x0 + col / 2} y={190} fontSize={11} fill="#6f6a61" textAnchor="middle">{jourCourt(j.date)}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: "flex", gap: 14, fontSize: 12, color: T.muted, marginTop: 4, flexWrap: "wrap" }}>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: couleur, marginRight: 5, verticalAlign: -1 }} />Cette semaine · {fmtEur(totalCur)}</span>
        <span><i style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: "#d9d0c2", marginRight: 5, verticalAlign: -1 }} />Semaine précédente, mêmes jours · {fmtEur(totalPrec)}</span>
      </div>
    </div>
  );
}
