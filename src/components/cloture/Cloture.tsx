"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ACCENT, ATTENTION, BON, BORD, BTN as PILULE, CADRE, FAIBLE, INFO, MAUVAIS, MUTED, OSWALD, TH, alpha, pastille } from "@/components/ui/charte";
import { couleurTexteSur, degradeCategorie, stylePastilleBarre } from "@/lib/styleCategories";
import { useBureau } from "@/hooks/useBureau";
import { useProfile } from "@/lib/ProfileContext";
import { fetchApi } from "@/lib/fetchApi";
import { calculerCloture, eur, lireMontant, noteManquante, recapCloture, VIDE, type SaisieCloture } from "@/lib/cloture";
import { aideCloture, heureParis, jourService, lireExportFlatpay, type TransactionFlatpay } from "@/lib/flatpay";
import type { ControleNuit } from "@/lib/controleNuit";
import { additionner, COUPURES, estBillet, libelleCoupure, listerCoupures, totalComptage, type Comptage, type CompositionFond } from "@/lib/fondCaisse";

/**
 * Clôture de caisse du soir, Bello Mio (10/10/2026). Déroulé : le Z du TPE sort, l'équipe recopie
 * le ticket Z et l'écran Popina ici, l'app donne le verdict. S'il y a un écart, l'export Flatpay du
 * jour (app Flatpay de l'iPad) montre les transactions qui l'expliquent ; l'équipe corrige le mode de
 * paiement dans Popina, recopie les montants, et n'arrête la caisse Popina que quand tout tombe juste.
 * Chaque saisie est enregistrée (contrôle de la nuit, historique, pourboires de la paie).
 */
const VERT = BON, ROUGE = MAUVAIS, AMBRE = ATTENTION;
const TITRE_CADRE: CSSProperties = { fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: "#1a1a1a" };
/** En-tête de cadre nuancé à la couleur de l'étape (29/10) : fond teinté, titre coloré */
const entete = (c: string): CSSProperties => ({ padding: "10px 16px", background: degradeCategorie(c), color: couleurTexteSur(c) });
const titre = (c: string): CSSProperties => ({ ...TITRE_CADRE, color: couleurTexteSur(c) });
const SOUS_ENTETE: CSSProperties = { fontSize: 12.5, marginTop: 2, opacity: 0.85 };
/** Champ de saisie de la clôture : chiffre gros et gras, cadre fin */
const SAISIE: CSSProperties = { font: "inherit", fontSize: 18, fontWeight: 700, textAlign: "right", boxSizing: "border-box", height: 40, padding: "0 10px", border: `1px solid ${BORD}`, borderRadius: 10, background: "#fff", color: "#1a1a1a", fontVariantNumeric: "tabular-nums" };
/** Panneau neutre avec liseré d'état à gauche (charte : pas de fond coloré) */
const panneau = (_couleur: string): CSSProperties => ({ borderRadius: 12, background: "#f7f3ec", padding: "10px 12px" });

type Champ = { cle: string; libelle: string; aide?: string; entier?: boolean; siPourboires?: boolean };
// Même ordre que le ticket Z Flatpay et l'écran de clôture Popina (demande de Paul, 14/10)
const CHAMPS_Z: Champ[] = [
  { cle: "total", libelle: "Total net", aide: "Bloc DEVISE EUR, ligne « TOTAL NET »" },
  { cle: "pourboires", libelle: "Pourboires", aide: "Bloc DEVISE EUR, ligne « POURBOIRES »" },
  { cle: "amex", libelle: "American Express", aide: "Accords cartes, ligne « American Express » ; 0 s'il n'y en a pas" },
  { cle: "conecs", libelle: "Conecs total net", aide: "Bloc CONECS, ligne « TOTAL NET »" },
  { cle: "conecsNb", libelle: "Nombre de Conecs", aide: "Bloc CONECS, le chiffre après « TOTAL NET x »", entier: true },
  { cle: "conecsPourboires", libelle: "Conecs pourboires", aide: "Bloc CONECS, ligne « POURBOIRES »" },
];
const CHAMPS_POPINA: Champ[] = [
  { cle: "especes", libelle: "Espèces", aide: "Obligatoire pour valider (0 s'il n'y en a pas)" },
  { cle: "cb", libelle: "Carte de crédit" },
  { cle: "amex", libelle: "American Express", aide: "0 s'il n'y en a pas" },
  { cle: "conecs", libelle: "Carte Connecs" },
  { cle: "conecsNb", libelle: "Nombre de Carte Connecs", aide: "Le chiffre devant « Carte Connecs »", entier: true },
  { cle: "pourboires", libelle: "Total pourboires", aide: "Colonne de droite ; à annuler avant le Z s'il y en a" },
  { cle: "pourboireAmexFacture", libelle: "Dont pourboire AMEX", aide: "Seulement si le total pourboires ci-dessus contient un pourboire sur un AMEX ; sinon vide", siPourboires: true },
];

type Textes = Record<"z" | "popina" | "tiroir", Record<string, string>>;
const versTextes = (s: SaisieCloture): Textes => {
  const t = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : (/nb$/i.test(k) ? String(v) : v.toFixed(2)).replace(".", ",")]));
  return { z: t(s.z), popina: t(s.popina), tiroir: t({ fond: s.tiroir.fond, compte: s.tiroir.compte }) };
};
const versSaisie = (t: Textes): SaisieCloture => {
  const n = (o: Record<string, string>, base: Record<string, number | null>) => Object.fromEntries(Object.keys(base).map((k) => [k, lireMontant(o[k] ?? "")])) as never;
  return { z: n(t.z, VIDE.z), popina: n(t.popina, VIDE.popina), tiroir: n(t.tiroir, { fond: null, compte: null }) };
};
const propre = (c: Comptage | null | undefined): Comptage | null => {
  const o = Object.fromEntries(Object.entries(c ?? {}).filter(([, n]) => n > 0));
  return Object.keys(o).length ? o : null;
};
const assembler = (t: Textes, coupures: Comptage, ajustement: number | null, cagnotte: Comptage | null): SaisieCloture => {
  const s = versSaisie(t);
  return { ...s, tiroir: { ...s.tiroir, coupures: propre(coupures) }, ajustement, cagnotte: cagnotte ? { total: null, coupures: propre(cagnotte) } : null };
};
const estVendredi = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay() === 5;
const estLundi = (jour: string) => new Date(`${jour}T12:00:00Z`).getUTCDay() === 1;

/** Lundi de la semaine d'un jour (AAAA-MM-JJ) */
const lundi = (jour: string) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dateCourte = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
type Historique = { jour: string; statut: string; pourboires_paie?: number | null; pourboires_especes?: number | null; resultat: { enveloppe?: number | null; fondCaisse?: { totalSorti: number; sortir?: Comptage; enveloppe?: Comptage | null } | null } | null };
const dateLongue = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const decaler = (jour: string, n: number) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function Cloture() {
  const bureau = useBureau();
  // Les enveloppes de la semaine et le bordereau de banque : managers et admins seulement (30/10/2026)
  const { canWrite: voitBanque } = useProfile();
  const [jour, setJour] = useState(() => jourService(new Date()));
  const [textes, setTextes] = useState<Textes>(() => versTextes(VIDE));
  const [coupures, setCoupures] = useState<Comptage>({});
  /** Cagnotte des pourboires espèces, vidée et comptée le vendredi (null : pas ce soir) */
  const [cagnotte, setCagnotte] = useState<Comptage | null>(null);

  const [historique, setHistorique] = useState<Historique[]>([]);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [nouvelleCorrection, setNouvelleCorrection] = useState("");
  /** Petit écart carte réglé en prix sur mesure pendant la soirée (gardé par le serveur) */
  const [ajustement, setAjustement] = useState<number | null>(null);
  const correctionRef = useRef<HTMLInputElement>(null);
  const [notes, setNotes] = useState("");
  const [statut, setStatut] = useState<"en_cours" | "validee">("en_cours");
  const [controle, setControle] = useState<{ c: ControleNuit; at: string } | null>(null);
  const [controleEnCours, setControleEnCours] = useState<string | null>(null);
  const [grosBillets, setGrosBillets] = useState(false);
  const [transactions, setTransactions] = useState<TransactionFlatpay[]>([]);
  const [etat, setEtat] = useState<{ chargement: boolean; enregistrement: boolean; erreur: string | null; info: string | null }>({ chargement: true, enregistrement: false, erreur: null, info: null });
  const [import_, setImport] = useState<{ enCours: boolean; message: string | null }>({ enCours: false, message: null });
  const charge = useRef(false);
  /** Dernier état enregistré (ou chargé) : rien n'est renvoyé tant que la saisie n'a pas changé */
  const dernier = useRef("");
  const fichierRef = useRef<HTMLInputElement>(null);

  // Chargement du jour
  useEffect(() => {
    let annule = false;
    charge.current = false;
    (async () => {
      setEtat((e) => ({ ...e, chargement: true, erreur: null, info: null }));
      try {
        // recalculer : le verdict enregistré est remis à jour avec les règles du moment (bordereau, enveloppes)
        const r = await fetchApi(`/api/cloture?jour=${jour}&recalculer=1`);
        const j = await r.json();
        if (annule) return;
        if (!r.ok) { setEtat((e) => ({ ...e, chargement: false, erreur: j?.error ?? "Chargement impossible" })); return; }
        const c = j.cloture;
        const lue: SaisieCloture = c?.saisie?.z ? (c.saisie as SaisieCloture) : VIDE;
        setTextes(versTextes(lue));
        setCoupures(lue.tiroir?.coupures ?? {});
        setAjustement(lue.ajustement ?? null);
        setCagnotte(lue.cagnotte?.coupures ?? (lue.cagnotte?.total != null ? {} : null));

        setCorrections(Array.isArray(c?.corrections) ? c.corrections : []);
        setNotes(c?.notes ?? "");
        setStatut(c?.statut === "validee" ? "validee" : "en_cours");
        setControle(c?.controle ? { c: c.controle as ControleNuit, at: c.controle_at as string } : null);
        setControleEnCours(null);
        setTransactions(j.transactions ?? []);
        dernier.current = JSON.stringify({ s: assembler(versTextes(lue), lue.tiroir?.coupures ?? {}, lue.ajustement ?? null, lue.cagnotte?.coupures ?? null), c: Array.isArray(c?.corrections) ? c.corrections : [], n: c?.notes ?? "" });
        setEtat((e) => ({ ...e, chargement: false }));
        charge.current = true;
      } catch (e) { if (!annule) setEtat((s) => ({ ...s, chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible" })); }
    })();
    return () => { annule = true; };
  }, [jour]);

  const saisie = useMemo(() => assembler(textes, coupures, ajustement, cagnotte), [textes, coupures, ajustement, cagnotte]);

  // Historique : enveloppes de la semaine pour le dépôt en banque
  const chargerHistorique = useCallback(async () => {
    try {
      const r = await fetchApi("/api/cloture?historique=1");
      const j = await r.json().catch(() => null);
      if (r.ok) setHistorique(j?.clotures ?? []);
    } catch { /* l'enveloppe de la semaine est un plus, pas bloquant */ }
  }, []);
  useEffect(() => { void chargerHistorique(); }, [chargerHistorique]);
  const resultat = useMemo(() => calculerCloture(saisie, jour), [saisie, jour]);
  const aide = useMemo(() => aideCloture(transactions, resultat.residu), [transactions, resultat.residu]);

  const enregistrer = useCallback(async (valider = false) => {
    setEtat((e) => ({ ...e, enregistrement: true, erreur: null }));
    try {
      const r = await fetchApi("/api/cloture", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jour, saisie, corrections, notes, valider }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setEtat((e) => ({ ...e, enregistrement: false, erreur: j?.error ?? "Enregistrement impossible" })); return; }
      setStatut(j.cloture?.statut === "validee" ? "validee" : "en_cours");
      setAjustement(j.cloture?.saisie?.ajustement ?? null);
      setEtat((e) => ({ ...e, enregistrement: false, info: valider ? "Clôture validée : tu peux arrêter la caisse Popina." : null }));
      if (valider) void chargerHistorique();
    } catch (e) { setEtat((s) => ({ ...s, enregistrement: false, erreur: e instanceof Error ? e.message : "Enregistrement impossible" })); }
  }, [jour, saisie, corrections, notes, chargerHistorique]);

  // Enregistrement automatique, une seconde après la dernière frappe (rien pour une journée vide ou inchangée)
  useEffect(() => {
    if (!charge.current) return;
    const cle = JSON.stringify({ s: saisie, c: corrections, n: notes });
    if (cle === dernier.current) return;
    if (resultat.niveau === "vide" && !corrections.length && !notes.trim()) return;
    const t = setTimeout(() => { dernier.current = cle; void enregistrer(false); }, 1000);
    return () => clearTimeout(t);
  }, [saisie, corrections, notes, resultat.niveau, enregistrer]);

  const changer = (bloc: keyof Textes, cle: string, v: string) => setTextes((t) => ({ ...t, [bloc]: { ...t[bloc], [cle]: v } }));

  async function importer(fichiers: FileList | null) {
    if (!fichiers?.length) return;
    setImport({ enCours: true, message: null });
    try {
      const XLSX = await import("xlsx");
      const lues: TransactionFlatpay[] = [];
      const messages: string[] = [];
      for (const f of Array.from(fichiers)) {
        // Dates en numéro de série (pas cellDates) : lecture identique quel que soit le fuseau de l'iPad
        const wb = XLSX.read(await f.arrayBuffer());
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { raw: true });
        const r = lireExportFlatpay(rows);
        if (!r.source) { messages.push(`${f.name} : ce n'est pas un export Flatpay reconnu.`); continue; }
        lues.push(...r.transactions);
        messages.push(`Export ${r.source === "carte" ? "carte" : "Conecs"} : ${r.transactions.length} transaction${r.transactions.length > 1 ? "s" : ""}`);
      }
      if (!lues.length) { setImport({ enCours: false, message: messages.join(" · ") || "Aucune transaction lue." }); return; }
      const res = await fetchApi("/api/cloture/flatpay", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transactions: lues }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setImport({ enCours: false, message: j?.error ?? "Import impossible" }); return; }
      const duJour = lues.filter((t) => t.jour === jour);
      setTransactions((prev) => {
        const vu = new Set(prev.map((t) => `${t.source}|${t.horodatage}|${t.montant}|${t.typeCarte}`));
        return [...prev, ...duJour.filter((t) => !vu.has(`${t.source}|${t.horodatage}|${t.montant}|${t.typeCarte}`))].sort((a, b) => a.horodatage.localeCompare(b.horodatage));
      });
      const autres = lues.length - duJour.length;
      setImport({ enCours: false, message: `${messages.join(" · ")}${autres ? ` · ${autres} hors de cette journée, gardées pour leur jour` : ""}` });
    } catch (e) {
      setImport({ enCours: false, message: `Lecture impossible : ${e instanceof Error ? e.message : "fichier illisible"}` });
    } finally { if (fichierRef.current) fichierRef.current.value = ""; }
  }

  const lancerControle = async () => {
    setControleEnCours("Contrôle en cours…");
    try {
      const r = await fetchApi(`/api/cron/cloture-controle?jour=${jour}`);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.controle) { setControleEnCours(j?.error ?? (r.status === 401 ? "Réservé à la direction." : "Contrôle impossible.")); return; }
      setControle({ c: j.controle as ControleNuit, at: new Date().toISOString() });
      setControleEnCours(null);
    } catch { setControleEnCours("Contrôle impossible, vérifie la connexion."); }
  };
  const moisCle = jour.slice(0, 7);
  const autresJours = historique.filter((h) => h.jour.slice(0, 7) === moisCle && h.jour !== jour);
  const pourboiresMois = Math.round((autresJours.reduce((t, h) => t + (Number(h.pourboires_paie) || 0), 0) + (resultat.niveau !== "vide" ? resultat.pourboiresPaie : 0)) * 100) / 100;
  const especesMois = Math.round((autresJours.reduce((t, h) => t + (Number(h.pourboires_especes) || 0), 0) + (resultat.pourboiresEspeces ?? 0)) * 100) / 100;

  const ajouterCorrection = () => { const c = nouvelleCorrection.trim(); if (!c) return; setCorrections((l) => [...l, c]); setNouvelleCorrection(""); };
  const recap = recapCloture(jour, saisie, resultat, corrections);
  const [copie, setCopie] = useState(false);

  const enveloppes = useMemo(() => {
    const parJour = new Map<string, number>();
    for (const h of historique) {
      const v = h.resultat?.enveloppe ?? (h.resultat?.fondCaisse ? h.resultat.fondCaisse.totalSorti / 100 : null);
      if (v != null) parJour.set(h.jour, v);
    }
    if (resultat.enveloppe != null) parJour.set(jour, resultat.enveloppe); else parJour.delete(jour);
    const semaine = (l: string) => [...parJour.entries()].filter(([j]) => lundi(j) === l).sort(([a], [b]) => a.localeCompare(b));
    const cette = semaine(lundi(jour));
    const precedente = semaine(lundi(decaler(lundi(jour), -7)));
    const somme = (l: [string, number][]) => l.reduce((a, [, v]) => a + v, 0);
    // Bordereau de banque : billets et pièces sortis chaque soir (bloc « À sortir »), additionnés sur la semaine
    const sorties = new Map<string, Comptage | undefined>();
    // Depuis le 27/10 l'enveloppe est détaillée à part (le trop perçu va dans la cagnotte) ; avant, c'était tout ce qui sortait
    for (const h of historique) sorties.set(h.jour, h.resultat?.fondCaisse?.enveloppe ?? h.resultat?.fondCaisse?.sortir);
    sorties.set(jour, resultat.fondCaisse?.enveloppe ?? resultat.fondCaisse?.sortir);
    const bordereau = (l: [string, number][]) => {
      const c = additionner(l.map(([j]) => sorties.get(j)));
      return { coupures: c, total: totalComptage(c) / 100, soirsSansComptage: l.filter(([j]) => !sorties.get(j)).map(([j]) => j) };
    };
    return {
      lundi: lundi(jour), cette, precedente, totalCette: Math.round(somme(cette) * 100) / 100, totalPrecedente: Math.round(somme(precedente) * 100) / 100,
      lundiPrecedent: lundi(decaler(lundi(jour), -7)), bordereauCette: bordereau(cette), bordereauPrecedente: bordereau(precedente),
    };
  }, [historique, resultat.enveloppe, resultat.fondCaisse, jour]);
  const changerCoupure = (k: number, n: number) => setCoupures((c) => ({ ...c, [String(k)]: Math.max(0, Math.min(9999, Math.floor(n) || 0)) }));
  const changerCagnotte = (k: number, n: number) => setCagnotte((c) => ({ ...(c ?? {}), [String(k)]: Math.max(0, Math.min(9999, Math.floor(n) || 0)) }));
  const noteRequise = noteManquante(resultat, corrections);
  /** L'écart du tiroir ne se règle avec les pourboires que quand la carte est juste */
  const carteJuste = resultat.niveau !== "vide" && Math.abs(resultat.residu) < 0.005;
  const peutValider = resultat.niveau === "ok" && resultat.manquePourValider.length === 0 && !noteRequise;
  const preparerNote = (montant?: number) => {
    const a = montant ?? resultat.ajustement ?? 0;
    setNouvelleCorrection(`Table … : prix sur mesure ${a < 0 ? "+" : "−"}${eur(Math.abs(a))} en carte (écart carte TPE / Popina)`);
    setTimeout(() => correctionRef.current?.focus(), 0);
  };

  const couleur = resultat.niveau === "ok" ? VERT : resultat.niveau === "mode" ? AMBRE : resultat.niveau === "vide" ? MUTED : ROUGE;
  const zSaisi = saisie.z.total != null;
  const exportVsZ = zSaisi && transactions.length > 0 ? Math.round((aide.totalExport.cb + aide.totalExport.amex - (saisie.z.total ?? 0)) * 100) / 100 : null;

  const bloc = (nomBloc: string, source: string, nom: keyof Textes, champs: Champ[], c: string) => (
    <section style={{ ...CADRE, minWidth: 0 }}>
      <div style={entete(c)}><div style={titre(c)}>{nomBloc}</div><div style={SOUS_ENTETE}>{source}</div></div>
      <div style={{ padding: "4px 16px 8px" }}>
      {champs.filter((c) => !c.siPourboires || (saisie.popina.pourboires ?? 0) > 0 || !!textes[nom][c.cle]).map((c, i) => (
        <label key={c.cle} style={{ display: "grid", gridTemplateColumns: "1fr 128px", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? `1px solid #f0ebe2` : "none" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, minWidth: 0 }}>{c.libelle}{c.aide && <small style={{ display: "block", color: MUTED, fontSize: 11.5, fontWeight: 400, lineHeight: 1.3 }}>{c.aide}</small>}</span>
          <input inputMode={c.entier ? "numeric" : "decimal"} autoComplete="off" value={textes[nom][c.cle] ?? ""} onChange={(e) => changer(nom, c.cle, e.target.value)} placeholder={c.entier ? "0" : "0,00"}
            onBlur={(e) => { const v = lireMontant(e.target.value); if (v != null && !c.entier) changer(nom, c.cle, v.toFixed(2).replace(".", ",")); }}
            style={{ ...SAISIE, width: "100%" }} />
        </label>
      ))}
      </div>
    </section>
  );

  const BTN: CSSProperties = { ...PILULE, height: 38, padding: "0 16px", fontSize: 14, fontWeight: 700 };
  /** Billets de 200 € et 100 € : repliés sauf s'il y en a (presque jamais en caisse) */
  const gros = (k: number) => k >= 10000;
  const grille = (valeurs: Comptage, changer: (k: number, n: number) => void, repartition?: CompositionFond | null) => {
    const voirGros = grosBillets || COUPURES.some((k) => gros(k) && (valeurs[String(k)] ?? 0) > 0);
    return (
      <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: bureau ? 18 : 4 }}>
        {[COUPURES.filter(estBillet), COUPURES.filter((k) => !estBillet(k))].map((groupe, gi) => (
          <div key={gi}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, margin: "4px 0" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".08em" }}>{gi ? "Pièces" : "Billets"}</span>
              {!gi && !voirGros && <button type="button" onClick={() => setGrosBillets(true)} style={{ border: "none", background: "none", padding: 0, color: ACCENT, fontWeight: 700, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit" }}>+ billets de 100 et 200 €</button>}
            </div>
            {groupe.filter((k) => voirGros || !gros(k)).map((k) => {
              const n = valeurs[String(k)] ?? 0;
              // Ce qu'on garde et ce qu'on sort, ligne par ligne : on sépare le tiroir en le parcourant
              const garder = repartition?.laisser[String(k)] ?? 0;
              const banque = repartition?.enveloppe ? repartition.enveloppe[String(k)] ?? 0 : repartition?.sortir[String(k)] ?? 0;
              const pourboires = repartition?.cagnotte?.[String(k)] ?? 0;
              const tas = [[garder, "laisser", VERT], [banque, repartition?.enveloppe ? "banque" : "sortir", AMBRE], [pourboires, "cagnotte", ACCENT]].filter(([n]) => (n as number) > 0) as [number, string, string][];
              return (
                <div key={k} style={{ display: "grid", gridTemplateColumns: "52px 36px minmax(0, 64px) 36px 1fr", alignItems: "center", gap: 6, padding: "3px 0", borderTop: "1px solid #f0ebe2" }}>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{libelleCoupure(k)}</span>
                  <button type="button" aria-label={`Retirer ${libelleCoupure(k)}`} onClick={() => changer(k, n - 1)} style={{ ...BTN, width: 36, height: 36, padding: 0, borderRadius: 999, borderColor: BORD, color: MUTED }}>−</button>
                  <input inputMode="numeric" autoComplete="off" value={n || ""} placeholder="0" onChange={(e) => changer(k, Number(e.target.value.replace(/\D/g, "")))}
                    style={{ ...SAISIE, width: "100%", height: 36, fontSize: 16, textAlign: "center", padding: 0 }} />
                  <button type="button" aria-label={`Ajouter ${libelleCoupure(k)}`} onClick={() => changer(k, n + 1)} style={{ ...BTN, width: 36, height: 36, padding: 0, borderRadius: 999, borderColor: BORD, color: MUTED }}>+</button>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontSize: 13.5, lineHeight: 1.2 }}>
                    {repartition && n > 0
                      ? tas.map(([nb, mot, coul], i) => <span key={mot}>{i > 0 && <br />}<span style={{ color: coul, fontWeight: 700, whiteSpace: "nowrap" }}>{mot} {nb}</span></span>)
                      : <span style={{ color: n ? "#1a1a1a" : FAIBLE }}>{eur((n * k) / 100)}</span>}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  const ligneTx = (t: TransactionFlatpay, extra?: React.ReactNode) => (
    <div key={`${t.horodatage}-${t.montant}-${t.typeCarte}`} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderTop: "1px solid #f0ebe2", fontSize: 13.5 }}>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums", width: 44 }}>{heureParis(t.horodatage)}</span>
      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{eur(t.montant)}</span>
      <span style={{ color: MUTED, fontSize: 12 }}>{t.typeCarte.replace("_", " ").toLowerCase()}{t.terminal && t.source === "carte" ? ` · ${t.terminal.toLowerCase()}` : ""}</span>
      {extra && <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12 }}>{extra}</span>}
    </div>
  );

  return (
    <div style={{ maxWidth: 980, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 60px", display: "grid", gap: 14, gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", margin: 0, lineHeight: 1.05 }}>Clôture de caisse</h1>
          <div style={{ color: MUTED, fontSize: 13 }}>Le Z du TPE est sorti : recopie-le avec l&apos;écran Popina, avant d&apos;arrêter la caisse.</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button type="button" onClick={() => setJour((j) => decaler(j, -1))} aria-label="Jour précédent" style={{ ...BTN, width: 40, padding: 0, borderColor: BORD }}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize", minWidth: 150, textAlign: "center" }}>{dateLongue(jour)}</span>
          <button type="button" onClick={() => setJour((j) => decaler(j, 1))} disabled={jour >= jourService(new Date())} aria-label="Jour suivant" style={{ ...BTN, width: 40, padding: 0, borderColor: BORD, opacity: jour >= jourService(new Date()) ? 0.4 : 1 }}>›</button>
        </div>
      </div>

      {etat.erreur && <div style={{ ...panneau(ROUGE), color: ROUGE, fontSize: 13.5 }}>{etat.erreur}</div>}
      {etat.chargement ? <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div> : (
        <>
          {statut === "validee" && <div style={{ ...panneau(VERT), color: VERT, fontSize: 13.5, fontWeight: 700 }}>Clôture validée{resultat.niveau !== "ok" ? " — mais la saisie a changé depuis : revérifie." : "."}</div>}
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: 14 }}>
            {bloc("Ticket Z du TPE", "Le ticket Flatpay imprimé à la clôture du TPE.", "z", CHAMPS_Z, ACCENT)}
            {bloc("Écran Popina", "Avant d'arrêter la caisse, sans rien corriger.", "popina", CHAMPS_POPINA, INFO)}
          </div>
          {/* Verdict */}
          <section aria-live="polite" style={{ ...CADRE, padding: bureau ? "18px 20px" : "14px 16px", background: `linear-gradient(135deg, ${alpha(couleur, 0.12)} 0%, ${alpha(couleur, 0.03)} 50%, #fff 100%)` }}>
            <span style={pastille(couleur)}>{resultat.niveau === "ok" ? "Caisse juste" : resultat.niveau === "mode" ? "Erreur de mode" : resultat.niveau === "vide" ? "À remplir" : "Écart"}</span>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 26 : 21, lineHeight: 1.1, color: "#1a1a1a", marginTop: 6 }}>{resultat.titre}</div>
            {resultat.etapes.length > 0 && <ol style={{ margin: "10px 0 0", paddingLeft: 22, fontSize: 15, lineHeight: 1.45 }}>{resultat.etapes.map((e, i) => <li key={i} style={{ margin: "6px 0" }}>{e}</li>)}</ol>}
            {resultat.petitEcart != null && ajustement == null && (
              <button type="button" onClick={() => { setAjustement(resultat.petitEcart); preparerNote(resultat.petitEcart ?? 0); }}
                style={{ ...BTN, marginTop: 10, background: ACCENT, borderColor: ACCENT, color: "#fff" }}>J&apos;ai fait l&apos;ajustement dans Popina</button>
            )}
            {resultat.niveau !== "vide" && (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <div style={{ display: "grid", fontSize: bureau ? 14.5 : 14, fontVariantNumeric: "tabular-nums" }}>
                  {resultat.lignes.map((l) => {
                    const juste = Math.abs(l.ecart) < 0.005;
                    return (
                      <div key={l.mode} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto auto", alignItems: "baseline", gap: "0 12px", padding: "7px 2px", borderTop: "1px solid #ece6db" }}>
                        <span>{l.libelle}</span>
                        <span style={{ whiteSpace: "nowrap" }}>{eur(l.popina)}</span>
                        <span style={{ whiteSpace: "nowrap", fontWeight: 700, color: juste ? VERT : ROUGE, minWidth: 60, textAlign: "right" }}>{juste ? "juste" : `${l.ecart > 0 ? "+" : "−"}${eur(Math.abs(l.ecart))}`}</span>
                        {!juste && <span style={{ gridColumn: "1 / -1", fontSize: 12.5, color: MUTED }}>attendu {eur(l.attendu)} d&apos;après le ticket Z</span>}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 14 }}>Pourboires carte pour la paie : <strong>{eur(resultat.pourboiresPaie)}</strong>{resultat.pourboireAmex > 0 && <span style={{ color: MUTED }}> (dont AMEX {eur(resultat.pourboireAmex)})</span>}</div>
                <div style={{ marginTop: 2, fontSize: 13, color: MUTED }}>Pot de {new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { month: "long" })} : <strong style={{ color: "#1a1a1a" }}>{eur(pourboiresMois + especesMois)}</strong> (carte {eur(pourboiresMois)}{especesMois > 0 ? `, espèces ${eur(especesMois)}` : ""})</div>
              </div>
            )}
          </section>

          {/* Tiroir : comptage par coupure, fond à laisser, enveloppe de la banque */}
          <section style={{ ...CADRE, minWidth: 0, display: "grid", gap: 10, paddingBottom: 16 }}>
            <div style={entete(BON)}><div style={titre(BON)}>Tiroir</div><div style={SOUS_ENTETE}>Compte tout le tiroir, fond compris, sans la cagnotte des pourboires.</div></div>
            <div style={{ padding: "0 16px", display: "grid", gap: 10 }}>
            <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 14.5, fontWeight: 600 }}>
              Fond de caisse
              <input inputMode="decimal" autoComplete="off" value={textes.tiroir.fond ?? ""} onChange={(e) => changer("tiroir", "fond", e.target.value)} placeholder="100"
                style={{ ...SAISIE, width: 96 }} />
              <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>€</span>
            </label>
            {grille(coupures, changerCoupure, resultat.fondCaisse)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
              <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22 }}>{resultat.tiroirCompte != null ? eur(resultat.tiroirCompte) : "—"}</span>
              <span style={{ color: MUTED, fontSize: 13.5 }}>compté · {eur(resultat.tiroirAttendu)} attendu (fond + espèces Popina)</span>
              {resultat.ecartTiroir != null && saisie.popina.especes != null && (
                <span style={{ fontWeight: 700, color: Math.abs(resultat.ecartTiroir) < 0.005 ? VERT : carteJuste && resultat.ecartTiroir > 0 ? AMBRE : ROUGE }}>{Math.abs(resultat.ecartTiroir) < 0.005 ? "Tiroir juste"
                  : resultat.niveau === "vide" ? `Écart de ${eur(Math.abs(resultat.ecartTiroir))} : remplis d'abord le ticket Z et Popina`
                  : resultat.erreurEspecesCarte ? `${resultat.ecartTiroir > 0 ? "+" : "−"}${eur(Math.abs(resultat.ecartTiroir))}, le même écart que la carte : erreur de mode, voir le verdict`
                  : !carteJuste ? `Écart de ${eur(Math.abs(resultat.ecartTiroir))} : règle d'abord la carte`
                  : resultat.ecartTiroir > 0 ? `${eur(resultat.ecartTiroir)} de trop perçu : aux pourboires de l'équipe`
                  : `Il manque ${eur(-resultat.ecartTiroir)} : à prendre dans les pourboires`}</span>
              )}
            </div>
            {resultat.fondCaisse && (() => {
              const f = resultat.fondCaisse;
              return (
                <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: 10 }}>
                  <div style={panneau(VERT)}>
                    <div style={{ fontWeight: 700, color: VERT, fontSize: 14 }}>À laisser dans la caisse · {eur(f.totalLaisse / 100)}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>Le détail est dans la grille : « laisser ».</div>
                    {f.incomplet > 0 && <div style={{ fontSize: 13, color: ROUGE, marginTop: 4 }}>Il manque {eur(f.incomplet / 100)} pour faire le fond{f.compte > f.fond ? " au centime : pas la bonne monnaie" : ""}. Prévois du change.</div>}
                  </div>
                  <div style={panneau(AMBRE)}>
                    <div style={{ fontWeight: 700, color: AMBRE, fontSize: 14 }}>{f.enveloppe ? `Enveloppe banque · ${eur(totalComptage(f.enveloppe) / 100)}` : `À sortir · ${eur(f.totalSorti / 100)}`}</div>
                    <div style={{ fontSize: 12.5, color: MUTED, marginTop: 2 }}>{f.enveloppe ? `Le détail est dans la grille : « banque » (${listerCoupures(f.enveloppe)}).` : "Le détail est dans la grille : « sortir »."}</div>
                    {resultat.enveloppe != null && (
                      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                        {!f.enveloppe && <><strong>Enveloppe banque : {eur(resultat.enveloppe)}</strong> (espèces Popina)</>}
                        {f.cagnotte && totalComptage(f.cagnotte) > 0 && <div><strong style={{ color: ACCENT }}>Cagnotte des pourboires : {eur(totalComptage(f.cagnotte) / 100)}</strong> ({listerCoupures(f.cagnotte)}), le trop perçu du tiroir.</div>}
                        {(f.enveloppeManque ?? 0) > 0 && <div style={{ color: ROUGE }}>Il manque {eur((f.enveloppeManque ?? 0) / 100)} à l&apos;enveloppe ({eur(resultat.enveloppe)} d&apos;espèces Popina) : complète avec la cagnotte.</div>}
                        {f.cagnotteImpossible && <div style={{ color: ROUGE }}>Le trop perçu de {eur(resultat.ecartTiroir ?? 0)} ne peut pas être isolé avec ces coupures : fais de la monnaie sur un billet, puis recompte le tiroir.</div>}
                        {!carteJuste && resultat.ecartTiroir != null && Math.abs(resultat.ecartTiroir) > 0.005 && <div style={{ color: MUTED }}>Règle d&apos;abord la carte : le trop perçu n&apos;est donné aux pourboires que si la carte est juste.</div>}
                      </div>
                    )}
                  </div>
                  {Object.keys(f.manqueIdeal).length > 0 && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 13, color: MUTED }}>Pour refaire le fond idéal{estLundi(jour) ? " du lundi" : ""}, il manque : {listerCoupures(f.manqueIdeal)}.{!cagnotte && " Fais la monnaie avec la cagnotte (bouton ci-dessous)."}</div>
                  )}
                </div>
              );
            })()}
            {voitBanque && (enveloppes.cette.length > 0 || enveloppes.precedente.length > 0) && (
              <div style={{ fontSize: 13.5, display: "grid", gap: 4, borderTop: "1px solid #f0ebe2", paddingTop: 8 }}>
                <div><strong>Enveloppes de la semaine du {dateCourte(enveloppes.lundi)} : {eur(enveloppes.totalCette)}</strong>
                  {enveloppes.cette.length > 0 && <span style={{ color: MUTED }}> ({enveloppes.cette.map(([j, v]) => `${dateCourte(j)} ${eur(v)}`).join(" · ")})</span>}</div>
                {enveloppes.precedente.length > 0 && <div style={{ color: AMBRE, fontWeight: 700 }}>Semaine précédente, à déposer à la banque : {eur(enveloppes.totalPrecedente)}</div>}
              </div>
            )}
            {voitBanque && (() => {
              // Bordereau de la semaine à déposer (la précédente), sinon celui de la semaine en cours
              const avecPrec = enveloppes.precedente.length > 0;
              const b = avecPrec ? enveloppes.bordereauPrecedente : enveloppes.bordereauCette;
              const totalEnveloppes = avecPrec ? enveloppes.totalPrecedente : enveloppes.totalCette;
              if (b.total <= 0) return null;
              const lignes = COUPURES.filter((k) => (b.coupures[String(k)] ?? 0) > 0);
              const billets = lignes.filter(estBillet);
              const pieces = lignes.filter((k) => !estBillet(k));
              const totalPieces = pieces.reduce((t, k) => t + k * (b.coupures[String(k)] ?? 0), 0) / 100;
              const nbPieces = pieces.reduce((t, k) => t + (b.coupures[String(k)] ?? 0), 0);
              const ecart = Math.round((b.total - totalEnveloppes) * 100) / 100;
              const cellule: CSSProperties = { padding: "4px 6px", borderTop: "1px solid #f0ebe2", fontVariantNumeric: "tabular-nums" };
              return (
                <details style={{ fontSize: 13.5, borderTop: "1px solid #f0ebe2", paddingTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontWeight: 700 }}>Bordereau de banque, semaine du {dateCourte(avecPrec ? enveloppes.lundiPrecedent : enveloppes.lundi)}{avecPrec ? "" : " (en cours)"} : {eur(b.total)}</summary>
                  <table style={{ width: "100%", maxWidth: 420, borderCollapse: "collapse", marginTop: 8 }}>
                    <tbody>
                      {billets.map((k) => (
                        <tr key={k}><td style={cellule}>Billets de {libelleCoupure(k)}</td><td style={{ ...cellule, textAlign: "right" }}>{b.coupures[String(k)]}</td><td style={{ ...cellule, textAlign: "right" }}>{eur((k * (b.coupures[String(k)] ?? 0)) / 100)}</td></tr>
                      ))}
                      {pieces.length > 0 && <tr><td style={{ ...cellule, fontWeight: 700 }}>Pièces</td><td style={{ ...cellule, textAlign: "right", fontWeight: 700 }}>{nbPieces}</td><td style={{ ...cellule, textAlign: "right", fontWeight: 700 }}>{eur(totalPieces)}</td></tr>}
                      {pieces.map((k) => (
                        <tr key={k}><td style={{ ...cellule, paddingLeft: 18, color: MUTED }}>{libelleCoupure(k)}</td><td style={{ ...cellule, textAlign: "right", color: MUTED }}>{b.coupures[String(k)]}</td><td style={{ ...cellule, textAlign: "right", color: MUTED }}>{eur((k * (b.coupures[String(k)] ?? 0)) / 100)}</td></tr>
                      ))}
                      <tr><td style={{ ...cellule, fontWeight: 700, borderTop: `1px solid ${BORD}` }}>Total</td><td style={{ ...cellule, borderTop: `1px solid ${BORD}` }} /><td style={{ ...cellule, textAlign: "right", fontWeight: 700, borderTop: `1px solid ${BORD}` }}>{eur(b.total)}</td></tr>
                    </tbody>
                  </table>
                  <div style={{ fontSize: 12.5, color: MUTED, marginTop: 6, lineHeight: 1.45 }}>
                    Les enveloppes de chaque soir, additionnées. Recompte les pièces si vous avez fait de la monnaie.
                    {Math.abs(ecart) >= 0.005 && <> {ecart > 0 ? `${eur(ecart)} de plus que les espèces Popina de la semaine : un trop perçu est resté dans une enveloppe, il va aux pourboires.` : `${eur(-ecart)} de moins que les espèces Popina : complété avec la cagnotte.`}</>}
                    {b.soirsSansComptage.length > 0 && <> Soir sans comptage du tiroir : {b.soirsSansComptage.map(dateCourte).join(", ")}, son enveloppe n&apos;est pas détaillée.</>}
                  </div>
                </details>
              );
            })()}
            </div>
          </section>

          {/* Cagnotte des pourboires espèces : vidée et comptée le vendredi, monnaie faite avec le tiroir */}
          <section style={{ ...CADRE, minWidth: 0, display: "grid", gap: 10, paddingBottom: 16 }}>
            <div style={{ ...entete(AMBRE), display: "flex", alignItems: "center", gap: 8 }}><div style={titre(AMBRE)}>Cagnotte des pourboires</div>{estVendredi(jour) && <span style={stylePastilleBarre(AMBRE)}>Vendredi</span>}</div>
            <div style={{ padding: "0 16px", display: "grid", gap: 10 }}>
            {!cagnotte ? (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
                <span style={{ color: estVendredi(jour) ? AMBRE : MUTED, fontSize: 13.5, fontWeight: estVendredi(jour) ? 700 : 400 }}>
                  {estVendredi(jour) ? "C'est vendredi : vide la cagnotte, compte-la, elle entre dans le pot du mois." : "La cagnotte se vide et se compte le vendredi soir. Pas besoin ce soir."}
                </span>
                <button type="button" onClick={() => setCagnotte({})} style={{ ...BTN, borderColor: AMBRE, color: AMBRE }}>{estVendredi(jour) ? "Compter la cagnotte" : "La compter quand même ce soir"}</button>
              </div>
            ) : (<>
              <div style={{ color: MUTED, fontSize: 12.5, marginTop: -4 }}>Compte tout ce qu&apos;il y a dans la cagnotte, billets et pièces. Le total part dans le pot du mois ; les pièces servent à faire la monnaie du tiroir.</div>
              {grille(cagnotte, changerCagnotte)}
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", borderTop: `1px solid ${BORD}`, paddingTop: 10 }}>
                <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22 }}>{eur(resultat.pourboiresEspeces ?? 0)}</span>
                <span style={{ color: MUTED, fontSize: 13.5 }}>de pourboires espèces pour le pot du mois</span>
                <button type="button" onClick={() => setCagnotte(null)} style={{ border: "none", background: "none", padding: 0, color: MUTED, fontSize: 12.5, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Finalement pas ce soir</button>
              </div>
              {resultat.echange ? (
                <div style={{ ...panneau(AMBRE), fontSize: 13.5, lineHeight: 1.45 }}>
                  <div style={{ fontWeight: 700, color: AMBRE }}>Fais la monnaie · {eur(resultat.echange.montant / 100)}</div>
                  <div>Mets dans le tiroir : <strong>{listerCoupures(resultat.echange.pieces)}</strong>.</div>
                  <div>Sors du tiroir pour la cagnotte : <strong>{listerCoupures(resultat.echange.billets)}</strong>.</div>
                  <div style={{ color: MUTED, fontSize: 12.5, marginTop: 2 }}>Le fond et l&apos;enveloppe ci-dessus sont calculés après cet échange : les pourboires sortent en billets, la monnaie reste au tiroir.</div>
                </div>
              ) : resultat.tiroirCompte != null && (resultat.pourboiresEspeces ?? 0) > 0 ? (
                <div style={{ fontSize: 12.5, color: MUTED }}>Pas de monnaie à faire : il faut au moins 5 € de pièces dans la cagnotte et autant en billets dans le tiroir.</div>
              ) : null}
            </>)}
            </div>
          </section>

          {/* Contrôle de la nuit : le vrai Z Popina relu vers 1 h */}
          {(controle || jour < jourService(new Date())) && (() => {
            const c = controle?.c;
            const coul = !c ? MUTED : c.niveau === "ok" ? VERT : c.niveau === "absent" ? AMBRE : ROUGE;
            return (
              <section style={{ ...CADRE, display: "grid", gap: 8, paddingBottom: 14 }}>
                <div style={{ ...entete(c ? coul : MUTED), display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: "4px 10px" }}>
                  <div style={{ ...titre(c ? coul : MUTED), flex: "1 1 auto" }}>Contrôle de la nuit</div>
                  <button type="button" disabled={controleEnCours === "Contrôle en cours…"} onClick={() => void lancerControle()} style={{ ...stylePastilleBarre(c ? coul : MUTED), border: "none", cursor: "pointer", fontFamily: "inherit" }}>{c ? "Relancer" : "Lancer maintenant"}</button>
                </div>
                <div style={{ padding: "0 16px", display: "grid", gap: 8 }}>
                {controleEnCours && <div style={{ fontSize: 13, color: MUTED }}>{controleEnCours}</div>}
                {!c ? <div style={{ fontSize: 13.5, color: MUTED }}>Pas encore fait : il passe vers 1 h, une fois le Z Popina publié.</div> : (
                  <>
                    <div style={{ fontWeight: 700, color: coul, fontSize: 15, lineHeight: 1.35 }}>{c.titre}</div>
                    {c.differences.length > 0 && (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13.5, fontVariantNumeric: "tabular-nums" }}>
                        <thead><tr>{["Popina", "Recopié le soir", "Z Popina"].map((h, i) => <th key={h} style={{ ...TH, textAlign: i ? "right" : "left", padding: "6px 4px" }}>{h}</th>)}</tr></thead>
                        <tbody>{c.differences.map((d) => (
                          <tr key={d.libelle}><td style={{ padding: "4px", borderTop: "1px solid #f0ebe2" }}>{d.libelle}</td><td style={{ padding: "4px", borderTop: "1px solid #f0ebe2", textAlign: "right", whiteSpace: "nowrap" }}>{eur(d.soir)}</td><td style={{ padding: "4px", borderTop: "1px solid #f0ebe2", textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{eur(d.reel)}</td></tr>
                        ))}</tbody>
                      </table>
                    )}
                    {c.messages.length > 0 && <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, lineHeight: 1.45 }}>{c.messages.map((m, i) => <li key={i}>{m}</li>)}</ul>}
                    {c.rapprochement && (c.rapprochement.tpeSeuls.length > 0 || c.rapprochement.popinaSeuls.length > 0) && (
                      <div style={{ fontSize: 13, display: "grid", gap: 2 }}>
                        {c.rapprochement.tpeSeuls.map((t, i) => <div key={`t${i}`}>TPE sans Popina : <strong>{eur(t.montant)}</strong> à {t.heure}{t.mode === "amex" ? " (AMEX)" : ""}</div>)}
                        {c.rapprochement.popinaSeuls.map((t, i) => <div key={`p${i}`}>Popina sans TPE : <strong>{eur(t.montant)}</strong>{t.heure ? ` à ${t.heure}` : ""}{t.table ? `, ${t.table}` : ""}</div>)}
                      </div>
                    )}
                    {controle && <div style={{ fontSize: 12, color: FAIBLE }}>Contrôlé le {new Date(controle.at).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                  </>
                )}
                </div>
              </section>
            );
          })()}

          {/* Export Flatpay : replié quand tout colle (il ne sert qu'en cas d'écart) */}
          <input ref={fichierRef} type="file" multiple accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => void importer(e.target.files)} />
          {resultat.niveau === "ok" && transactions.length === 0 && !import_.message ? (
            <div style={{ fontSize: 13, color: MUTED, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "baseline" }}>
              Export Flatpay : pas besoin ce soir, tout colle.
              <button type="button" onClick={() => fichierRef.current?.click()} style={{ border: "none", background: "none", padding: 0, color: ACCENT, fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Déposer quand même</button>
            </div>
          ) : (
          <section style={{ ...CADRE, display: "grid", gap: 8, paddingBottom: 14 }}>
            <div style={{ ...entete(MUTED), display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={titre(MUTED)}>Export Flatpay du jour</div>
                <div style={SOUS_ENTETE}>En cas d&apos;écart : app Flatpay de l&apos;iPad, transactions du jour, export ; et l&apos;export « titre restaurant » s&apos;il y a des Conecs.</div>
              </div>
              <button type="button" disabled={import_.enCours} onClick={() => fichierRef.current?.click()} style={{ ...BTN, borderColor: ACCENT, color: ACCENT }}>{import_.enCours ? "Lecture…" : transactions.length ? "Ajouter un export" : "Déposer l'export"}</button>
            </div>
            <div style={{ padding: "0 16px", display: "grid", gap: 8 }}>
            {import_.message && <div style={{ fontSize: 12.5, color: MUTED }}>{import_.message}</div>}
            {transactions.length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                <div style={{ fontSize: 13.5 }}>
                  {transactions.filter((t) => t.mode !== "conecs").length} transactions carte · {eur(aide.totalExport.cb + aide.totalExport.amex)}
                  {aide.conecs.length > 0 && <> · {aide.conecs.length} Conecs · {eur(aide.totalExport.conecs)}</>}
                  {exportVsZ != null && (Math.abs(exportVsZ) < 0.005
                    ? <span style={{ color: VERT, fontWeight: 700 }}> · égal au total net du Z</span>
                    : <span style={{ color: ROUGE, fontWeight: 700 }}> · {exportVsZ > 0 ? "+" : "−"}{eur(Math.abs(exportVsZ))} par rapport au total net du Z : export incomplet, ou Z mal recopié</span>)}
                </div>
                {Math.abs(resultat.residu) >= 0.01 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>Transactions qui peuvent expliquer {eur(Math.abs(resultat.residu))}</div>
                    {aide.candidates.length > 0
                      ? aide.candidates.map((c) => ligneTx(c.t, c.pourboire ? `soit ${eur(Math.abs(resultat.residu))} + ${c.pourboire} % de pourboire` : "montant exact"))
                      : aide.proches.length > 0
                        ? <>{<div style={{ fontSize: 12.5, color: MUTED }}>Aucune au montant exact ou avec un pourboire usuel ; les plus proches :</div>}{aide.proches.map((t) => ligneTx(t))}</>
                        : <div style={{ fontSize: 13, color: MUTED }}>Aucune transaction ne correspond : un montant mal tapé, ou plusieurs erreurs. Compare les paiements des tables récentes.</div>}
                    <div style={{ fontSize: 12, color: FAIBLE, marginTop: 4 }}>{resultat.residu < 0 ? "Retrouve la table à cette heure dans Popina : son paiement est en espèces, ou elle n'est pas soldée." : "Ces transactions existent au TPE : le paiement carte de ce montant saisi à une autre heure dans Popina est celui qui n'a pas été payé par carte."}</div>
                  </div>
                )}
                {(Math.abs(resultat.ecartConecs) >= 0.01 || aide.conecs.length > 0) && (
                  <div><div style={{ fontWeight: 700, fontSize: 14 }}>Conecs du TPE · {aide.conecs.length}</div>{aide.conecs.length ? aide.conecs.map((t) => ligneTx(t, t.emetteur ?? undefined)) : <div style={{ fontSize: 13, color: MUTED }}>Aucun Conecs dans l&apos;export (dépose l&apos;export « titre restaurant »).</div>}<div style={{ fontSize: 12, color: FAIBLE }}>Compare avec les paiements Conecs de Popina : celui qui n&apos;est pas ici est une carte bancaire.</div></div>
                )}
                {aide.amex.length > 0 && <div><div style={{ fontWeight: 700, fontSize: 14 }}>AMEX du TPE · {aide.amex.length}</div>{aide.amex.map((t) => ligneTx(t))}</div>}
                {aide.refusees.length > 0 && <div><div style={{ fontWeight: 700, fontSize: 14, color: ROUGE }}>Paiements refusés · {aide.refusees.length}</div>{aide.refusees.map((t) => ligneTx(t, "vérifie que la table a été repayée"))}</div>}
              </div>
            )}
            </div>
          </section>
          )}

          {/* Corrections et notes */}
          <section style={{ ...CADRE, display: "grid", gap: 8, paddingBottom: 14 }}>
            <div style={entete(ACCENT)}><div style={titre(ACCENT)}>Corrections faites dans Popina</div><div style={SOUS_ENTETE}>Une ligne par correction : la table, l&apos;heure, ce qui a changé. Le contrôle de la nuit les reconnaîtra.</div></div>
            <div style={{ padding: "0 16px", display: "grid", gap: 8 }}>
            {noteRequise && (
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 10, background: alpha(ACCENT, 0.08), fontSize: 13.5 }}>
                <span style={{ flex: "1 1 220px" }}>Ajustement en prix sur mesure de <strong>{eur(Math.abs(resultat.ajustement ?? 0))}</strong> : note la table et le montant, c&apos;est obligatoire pour valider.
                  {" "}<button type="button" onClick={() => setAjustement(null)} style={{ border: "none", background: "none", padding: 0, color: MUTED, textDecoration: "underline", cursor: "pointer", font: "inherit", fontSize: 12.5 }}>Pas d&apos;ajustement finalement</button></span>
                <button type="button" onClick={() => preparerNote()} style={{ ...BTN, height: 36, borderColor: ACCENT, color: ACCENT }}>Préparer la note</button>
              </div>
            )}
            {corrections.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "4px 0", borderTop: "1px solid #f0ebe2" }}>
                <span style={{ flex: 1 }}>{c}</span>
                <button type="button" onClick={() => setCorrections((l) => l.filter((_, k) => k !== i))} aria-label="Retirer" style={{ border: "none", background: "transparent", color: MUTED, fontSize: 18, cursor: "pointer" }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={correctionRef} value={nouvelleCorrection} onChange={(e) => setNouvelleCorrection(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouterCorrection(); }} placeholder="Ex. : table 12 à 21 h 40, 26 € passés d'Espèces à Carte"
                style={{ flex: 1, minWidth: 0, height: 38, padding: "0 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 14, fontFamily: "inherit", background: "#fff" }} />
              <button type="button" onClick={ajouterCorrection} style={{ ...BTN, borderColor: BORD }}>Ajouter</button>
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (facultatif)" style={{ padding: "10px 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
            </div>
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" disabled={!peutValider || etat.enregistrement} onClick={() => void enregistrer(true)}
              style={{ ...BTN, background: peutValider ? VERT : "#c9c2b4", borderColor: peutValider ? VERT : "#c9c2b4", color: "#fff", cursor: peutValider ? "pointer" : "not-allowed" }}>
              {statut === "validee" ? "Clôture validée ✓" : "Valider la clôture"}
            </button>
            <button type="button" disabled={resultat.niveau === "vide"} onClick={() => { void navigator.clipboard?.writeText(recap).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); }); }} style={BTN}>{copie ? "Copié" : "Copier le récap"}</button>
            {resultat.niveau === "ok" && noteRequise && <span style={{ fontSize: 13, color: ROUGE, fontWeight: 600 }}>Pour valider, note la correction en prix sur mesure.</span>}
            {resultat.niveau === "ok" && resultat.manquePourValider.length > 0 && <span style={{ fontSize: 13, color: ROUGE, fontWeight: 600 }}>Pour valider, il manque {resultat.manquePourValider.join(" et ")}.</span>}
            <span style={{ fontSize: 12.5, color: MUTED }}>{etat.enregistrement ? "Enregistrement…" : etat.info ?? "Enregistré automatiquement."}</span>
          </div>

          <details style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.5, maxWidth: "70ch" }}>
            <summary style={{ cursor: "pointer", fontWeight: 700, color: "#1a1a1a" }}>Les règles de la clôture</summary>
            <p><strong style={{ color: "#1a1a1a" }}>Les règles.</strong> La caisse doit tomber juste au centime avant d&apos;arrêter Popina. On corrige le mode de paiement sur le bon ticket ; on n&apos;invente jamais de montant. Un petit écart de carte (2 € ou moins, liquide bon) se règle en « prix sur mesure » sur une table payée en carte, et on le note ci-dessus. La nuit, l&apos;app relit le vrai Z Popina et vérifie la soirée.</p>
            <p><strong style={{ color: "#1a1a1a" }}>Les pourboires.</strong> Ceux du TPE entrent chaque soir dans le pot du mois. Le liquide laissé sur la monnaie se passe en « monnaie rendue » et va dans la cagnotte : on ne le tape pas. Le vendredi soir, on vide la cagnotte, on la compte ici, et elle entre dans le pot ; l&apos;app dit quelles pièces mettre au tiroir contre des billets, pour que les pourboires sortent en billets. Un pourboire carte n&apos;est saisi dans Popina que pour une facture, et on l&apos;annule avant d&apos;arrêter la caisse. Le tiroir se règle avec la cagnotte seulement quand la carte est juste : un trop perçu va aux pourboires, un manque (monnaie mal rendue) s&apos;y prend. Le pot est réparti sur les jours de présence (Mon tableau).</p>
            <p><strong style={{ color: "#1a1a1a" }}>Le fond.</strong> 100 € chaque soir. Le lundi soir, on refait le fond du début de semaine, avec plus de monnaie (20 pièces de 1 €, 14 de 50 c) ; les autres soirs, le fond ordinaire.</p>
          </details>
        </>
      )}
    </div>
  );
}
