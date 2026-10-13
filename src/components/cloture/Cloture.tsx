"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { OSWALD } from "@/components/TuileProduit";
import { useBureau } from "@/hooks/useBureau";
import { fetchApi } from "@/lib/fetchApi";
import { calculerCloture, eur, lireMontant, recapCloture, VIDE, type SaisieCloture } from "@/lib/cloture";
import { aideCloture, heureParis, jourService, lireExportFlatpay, type TransactionFlatpay } from "@/lib/flatpay";
import { COUPURES, estBillet, libelleCoupure, listerCoupures, type Comptage } from "@/lib/fondCaisse";

/**
 * Clôture de caisse du soir, Bello Mio (10/10/2026). Déroulé : le Z du TPE sort, l'équipe recopie
 * le ticket Z et l'écran Popina ici, l'app donne le verdict. S'il y a un écart, l'export Flatpay du
 * jour (app Flatpay de l'iPad) montre les transactions qui l'expliquent ; l'équipe corrige le mode de
 * paiement dans Popina, recopie les montants, et n'arrête la caisse Popina que quand tout tombe juste.
 * Chaque saisie est enregistrée (contrôle de la nuit, historique, pourboires de la paie).
 */
const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const VERT = "#2F5A3E";
const ROUGE = "#B8342A";
const AMBRE = "#8A5A00";
const ACCENT = "#D4775A";

type Champ = { cle: string; libelle: string; aide?: string; entier?: boolean; siPourboires?: boolean };
const CHAMPS_Z: Champ[] = [
  { cle: "total", libelle: "Total net", aide: "Premier bloc, ligne « TOTAL NET »" },
  { cle: "pourboires", libelle: "Pourboires", aide: "Premier bloc, ligne « POURBOIRES »" },
  { cle: "amex", libelle: "American Express", aide: "Accords cartes, ligne AMEX ; 0 s'il n'y en a pas" },
  { cle: "conecs", libelle: "Conecs total net", aide: "Bloc CONECS, ligne « TOTAL NET »" },
  { cle: "conecsPourboires", libelle: "Conecs pourboires", aide: "Bloc CONECS, ligne « POURBOIRES »" },
  { cle: "conecsNb", libelle: "Nombre de Conecs", aide: "Bloc CONECS, le chiffre après « VENTE x »", entier: true },
];
const CHAMPS_POPINA: Champ[] = [
  { cle: "cb", libelle: "Carte de crédit" },
  { cle: "conecs", libelle: "Carte Connecs" },
  { cle: "conecsNb", libelle: "Nombre de Connecs", aide: "Le chiffre devant « Carte Connecs »", entier: true },
  { cle: "amex", libelle: "American Express" },
  { cle: "especes", libelle: "Espèces", aide: "Obligatoire pour valider (0 s'il n'y en a pas)" },
  { cle: "pourboires", libelle: "Total pourboires", aide: "Pourboires saisis pour une facture (à annuler avant le Z)" },
  { cle: "pourboireAmexFacture", libelle: "Dont pourboire AMEX", aide: "Seulement si le total pourboires ci-dessus contient un pourboire sur un AMEX ; sinon vide", siPourboires: true },
];

type Textes = Record<"z" | "popina" | "tiroir", Record<string, string>>;
const versTextes = (s: SaisieCloture): Textes => {
  const t = (o: Record<string, number | null>) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v).replace(".", ",")]));
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
const assembler = (t: Textes, coupures: Comptage): SaisieCloture => {
  const s = versSaisie(t);
  return { ...s, tiroir: { ...s.tiroir, coupures: propre(coupures) } };
};

/** Lundi de la semaine d'un jour (AAAA-MM-JJ) */
const lundi = (jour: string) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const dateCourte = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
type Historique = { jour: string; statut: string; resultat: { enveloppe?: number | null; fondCaisse?: { totalSorti: number } | null } | null };
const dateLongue = (jour: string) => new Date(`${jour}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const decaler = (jour: string, n: number) => { const d = new Date(`${jour}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

export function Cloture() {
  const bureau = useBureau();
  const [jour, setJour] = useState(() => jourService(new Date()));
  const [textes, setTextes] = useState<Textes>(() => versTextes(VIDE));
  const [coupures, setCoupures] = useState<Comptage>({});

  const [historique, setHistorique] = useState<Historique[]>([]);
  const [corrections, setCorrections] = useState<string[]>([]);
  const [nouvelleCorrection, setNouvelleCorrection] = useState("");
  const [notes, setNotes] = useState("");
  const [statut, setStatut] = useState<"en_cours" | "validee">("en_cours");
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
        const r = await fetchApi(`/api/cloture?jour=${jour}`);
        const j = await r.json();
        if (annule) return;
        if (!r.ok) { setEtat((e) => ({ ...e, chargement: false, erreur: j?.error ?? "Chargement impossible" })); return; }
        const c = j.cloture;
        const lue: SaisieCloture = c?.saisie?.z ? (c.saisie as SaisieCloture) : VIDE;
        setTextes(versTextes(lue));
        setCoupures(lue.tiroir?.coupures ?? {});

        setCorrections(Array.isArray(c?.corrections) ? c.corrections : []);
        setNotes(c?.notes ?? "");
        setStatut(c?.statut === "validee" ? "validee" : "en_cours");
        setTransactions(j.transactions ?? []);
        dernier.current = JSON.stringify({ s: assembler(versTextes(lue), lue.tiroir?.coupures ?? {}), c: Array.isArray(c?.corrections) ? c.corrections : [], n: c?.notes ?? "" });
        setEtat((e) => ({ ...e, chargement: false }));
        charge.current = true;
      } catch (e) { if (!annule) setEtat((s) => ({ ...s, chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible" })); }
    })();
    return () => { annule = true; };
  }, [jour]);

  const saisie = useMemo(() => assembler(textes, coupures), [textes, coupures]);

  // Historique : enveloppes de la semaine pour le dépôt en banque
  const chargerHistorique = useCallback(async () => {
    try {
      const r = await fetchApi("/api/cloture?historique=1");
      const j = await r.json().catch(() => null);
      if (r.ok) setHistorique(j?.clotures ?? []);
    } catch { /* l'enveloppe de la semaine est un plus, pas bloquant */ }
  }, []);
  useEffect(() => { void chargerHistorique(); }, [chargerHistorique]);
  const resultat = useMemo(() => calculerCloture(saisie), [saisie]);
  const aide = useMemo(() => aideCloture(transactions, resultat.residu), [transactions, resultat.residu]);

  const enregistrer = useCallback(async (valider = false) => {
    setEtat((e) => ({ ...e, enregistrement: true, erreur: null }));
    try {
      const r = await fetchApi("/api/cloture", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jour, saisie, corrections, notes, valider }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setEtat((e) => ({ ...e, enregistrement: false, erreur: j?.error ?? "Enregistrement impossible" })); return; }
      setStatut(j.cloture?.statut === "validee" ? "validee" : "en_cours");
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
    return { lundi: lundi(jour), cette, precedente, totalCette: Math.round(somme(cette) * 100) / 100, totalPrecedente: Math.round(somme(precedente) * 100) / 100 };
  }, [historique, resultat.enveloppe, jour]);
  const changerCoupure = (k: number, n: number) => setCoupures((c) => ({ ...c, [String(k)]: Math.max(0, Math.min(9999, Math.floor(n) || 0)) }));
  const peutValider = resultat.niveau === "ok" && resultat.manquePourValider.length === 0;

  const couleur = resultat.niveau === "ok" ? VERT : resultat.niveau === "mode" ? AMBRE : resultat.niveau === "vide" ? MUTED : ROUGE;
  const fond = resultat.niveau === "ok" ? "#E6EFE7" : resultat.niveau === "mode" ? "#F7EDD6" : resultat.niveau === "vide" ? "#fff" : "#F8E5E2";
  const zSaisi = saisie.z.total != null;
  const exportVsZ = zSaisi && transactions.length > 0 ? Math.round((aide.totalExport.cb + aide.totalExport.amex - (saisie.z.total ?? 0)) * 100) / 100 : null;

  const bloc = (titre: string, source: string, nom: keyof Textes, champs: Champ[]) => (
    <fieldset style={{ border: `1.5px solid ${BORD}`, borderRadius: 14, background: "#fff", margin: 0, padding: "12px 14px 6px", minWidth: 0 }}>
      <legend style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: ".03em", padding: "0 6px" }}>{titre}</legend>
      <div style={{ color: MUTED, fontSize: 12.5, margin: "-2px 0 6px" }}>{source}</div>
      {champs.filter((c) => !c.siPourboires || (saisie.popina.pourboires ?? 0) > 0 || !!textes[nom][c.cle]).map((c, i) => (
        <label key={c.cle} style={{ display: "grid", gridTemplateColumns: "1fr 128px", alignItems: "center", gap: 10, padding: "7px 0", borderTop: i ? `1px solid #f0ebe2` : "none" }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, minWidth: 0 }}>{c.libelle}{c.aide && <small style={{ display: "block", color: MUTED, fontSize: 11.5, fontWeight: 400, lineHeight: 1.3 }}>{c.aide}</small>}</span>
          <input inputMode={c.entier ? "numeric" : "decimal"} autoComplete="off" value={textes[nom][c.cle] ?? ""} onChange={(e) => changer(nom, c.cle, e.target.value)} placeholder={c.entier ? "0" : "0,00"}
            style={{ font: "inherit", fontSize: 19, fontWeight: 700, textAlign: "right", width: "100%", boxSizing: "border-box", padding: "8px 10px", border: `1.5px solid ${BORD}`, borderRadius: 9, background: "#faf8f4", color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }} />
        </label>
      ))}
    </fieldset>
  );

  const BTN: CSSProperties = { height: 40, padding: "0 16px", borderRadius: 10, border: `1.5px solid #1a1a1a`, background: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a" };
  const grille = (valeurs: Comptage, changer: (k: number, n: number) => void) => (
  <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: bureau ? 18 : 4 }}>
    {[COUPURES.filter(estBillet), COUPURES.filter((k) => !estBillet(k))].map((groupe, gi) => (
      <div key={gi}>
        <div style={{ fontSize: 12, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: ".05em", margin: "4px 0" }}>{gi ? "Pièces" : "Billets"}</div>
        {groupe.map((k) => {
          const n = valeurs[String(k)] ?? 0;
          return (
            <div key={k} style={{ display: "grid", gridTemplateColumns: "64px 40px minmax(0, 72px) 40px 1fr", alignItems: "center", gap: 6, padding: "4px 0", borderTop: "1px solid #f0ebe2" }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{libelleCoupure(k)}</span>
              <button type="button" aria-label={`Retirer ${libelleCoupure(k)}`} onClick={() => changer(k, n - 1)} style={{ ...BTN, width: 40, padding: 0, borderColor: BORD }}>−</button>
              <input inputMode="numeric" autoComplete="off" value={n || ""} placeholder="0" onChange={(e) => changer(k, Number(e.target.value.replace(/\D/g, "")))}
                style={{ font: "inherit", fontSize: 18, fontWeight: 700, textAlign: "center", width: "100%", boxSizing: "border-box", height: 40, border: `1.5px solid ${BORD}`, borderRadius: 9, background: "#faf8f4", fontVariantNumeric: "tabular-nums" }} />
              <button type="button" aria-label={`Ajouter ${libelleCoupure(k)}`} onClick={() => changer(k, n + 1)} style={{ ...BTN, width: 40, padding: 0, borderColor: BORD }}>+</button>
              <span style={{ textAlign: "right", color: n ? "#1a1a1a" : FAIBLE, fontVariantNumeric: "tabular-nums", fontSize: 14 }}>{eur((n * k) / 100)}</span>
            </div>
          );
        })}
      </div>
    ))}
  </div>
  );

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

      {etat.erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#F8E5E2", color: ROUGE, fontSize: 13.5 }}>{etat.erreur}</div>}
      {etat.chargement ? <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div> : (
        <>
          {statut === "validee" && <div style={{ padding: "10px 14px", borderRadius: 10, background: "#E6EFE7", color: VERT, fontSize: 13.5, fontWeight: 700 }}>Clôture validée{resultat.niveau !== "ok" ? " — mais la saisie a changé depuis : revérifie." : "."}</div>}
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: 14 }}>
            {bloc("Ticket Z du TPE", "Le ticket Flatpay imprimé à la clôture du TPE.", "z", CHAMPS_Z)}
            {bloc("Écran Popina", "Avant d'arrêter la caisse, sans rien corriger.", "popina", CHAMPS_POPINA)}
          </div>
          {/* Tiroir : comptage par coupure, fond à laisser, enveloppe de la banque */}
          <fieldset style={{ border: `1.5px solid ${BORD}`, borderRadius: 14, background: "#fff", margin: 0, padding: "12px 14px 12px", minWidth: 0, display: "grid", gap: 10 }}>
            <legend style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: ".03em", padding: "0 6px" }}>Tiroir</legend>
            <div style={{ color: MUTED, fontSize: 12.5, marginTop: -4 }}>Compte tout le tiroir, fond compris, sans la cagnotte des pourboires.</div>
            <label style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10, fontSize: 14.5, fontWeight: 600 }}>
              Fond de caisse
              <input inputMode="decimal" autoComplete="off" value={textes.tiroir.fond ?? ""} onChange={(e) => changer("tiroir", "fond", e.target.value)} placeholder="100"
                style={{ font: "inherit", fontSize: 17, fontWeight: 700, textAlign: "right", width: 90, boxSizing: "border-box", padding: "6px 10px", border: `1.5px solid ${BORD}`, borderRadius: 9, background: "#faf8f4" }} />
              <span style={{ color: MUTED, fontWeight: 400, fontSize: 13 }}>€</span>
            </label>
            {grille(coupures, changerCoupure)}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 16px", alignItems: "baseline", borderTop: `1.5px solid ${BORD}`, paddingTop: 10 }}>
              <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22 }}>{resultat.tiroirCompte != null ? eur(resultat.tiroirCompte) : "—"}</span>
              <span style={{ color: MUTED, fontSize: 13.5 }}>compté · {eur(resultat.tiroirAttendu)} attendu (fond + espèces Popina)</span>
              {resultat.ecartTiroir != null && saisie.popina.especes != null && (
                <span style={{ fontWeight: 700, color: Math.abs(resultat.ecartTiroir) < 0.005 ? VERT : resultat.ecartTiroir > 0 ? AMBRE : ROUGE }}>{Math.abs(resultat.ecartTiroir) < 0.005 ? "Tiroir juste"
                  : resultat.ecartTiroir > 0 ? `${eur(resultat.ecartTiroir)} de trop perçu : aux pourboires de l'équipe`
                  : `Il manque ${eur(-resultat.ecartTiroir)} : à prendre dans les pourboires`}</span>
              )}
            </div>
            {resultat.fondCaisse && (() => {
              const f = resultat.fondCaisse;
              return (
                <div style={{ display: "grid", gridTemplateColumns: bureau ? "1fr 1fr" : "minmax(0, 1fr)", gap: 10 }}>
                  <div style={{ borderRadius: 12, background: "#E6EFE7", padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: VERT, fontSize: 14 }}>À laisser dans la caisse · {eur(f.totalLaisse / 100)}</div>
                    <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.45 }}>{listerCoupures(f.laisser) || "Rien"}</div>
                    {f.incomplet > 0 && <div style={{ fontSize: 13, color: ROUGE, marginTop: 4 }}>Il manque {eur(f.incomplet / 100)} pour faire le fond{f.compte > f.fond ? " au centime : pas la bonne monnaie" : ""}. Prévois du change.</div>}
                  </div>
                  <div style={{ borderRadius: 12, background: "#F7EDD6", padding: "10px 12px" }}>
                    <div style={{ fontWeight: 700, color: AMBRE, fontSize: 14 }}>À sortir · {eur(f.totalSorti / 100)}</div>
                    <div style={{ fontSize: 14, marginTop: 4, lineHeight: 1.45 }}>{listerCoupures(f.sortir) || "Rien à sortir"}</div>
                    {resultat.enveloppe != null && (
                      <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
                        <strong>Enveloppe banque : {eur(resultat.enveloppe)}</strong> (espèces Popina)
                        {resultat.ecartTiroir != null && resultat.ecartTiroir > 0.005 && <span style={{ color: MUTED }}> · {eur(resultat.ecartTiroir)} pour les pourboires de l&apos;équipe</span>}
                        {resultat.ecartTiroir != null && resultat.ecartTiroir < -0.005 && <span style={{ color: MUTED }}> · {eur(-resultat.ecartTiroir)} à compléter avec les pourboires</span>}
                      </div>
                    )}
                  </div>
                  {Object.keys(f.manqueIdeal).length > 0 && (
                    <div style={{ gridColumn: "1 / -1", fontSize: 13, color: MUTED }}>Pour refaire le fond idéal du lundi, il manque : {listerCoupures(f.manqueIdeal)}.</div>
                  )}
                </div>
              );
            })()}
            {(enveloppes.cette.length > 0 || enveloppes.precedente.length > 0) && (
              <div style={{ fontSize: 13.5, display: "grid", gap: 4, borderTop: "1px solid #f0ebe2", paddingTop: 8 }}>
                <div><strong>Enveloppes de la semaine du {dateCourte(enveloppes.lundi)} : {eur(enveloppes.totalCette)}</strong>
                  {enveloppes.cette.length > 0 && <span style={{ color: MUTED }}> ({enveloppes.cette.map(([j, v]) => `${dateCourte(j)} ${eur(v)}`).join(" · ")})</span>}</div>
                {enveloppes.precedente.length > 0 && <div style={{ color: AMBRE, fontWeight: 700 }}>Semaine précédente, à déposer à la banque : {eur(enveloppes.totalPrecedente)}</div>}
              </div>
            )}
          </fieldset>

          {/* Verdict */}
          <section aria-live="polite" style={{ borderRadius: 16, padding: bureau ? 20 : 16, border: `2px solid ${couleur}`, background: fond }}>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, lineHeight: 1.1, color: couleur }}>{resultat.titre}</div>
            {resultat.etapes.length > 0 && <ol style={{ margin: "10px 0 0", paddingLeft: 22, fontSize: 15, lineHeight: 1.45 }}>{resultat.etapes.map((e, i) => <li key={i} style={{ margin: "6px 0" }}>{e}</li>)}</ol>}
            {resultat.niveau !== "vide" && (
              <div style={{ overflowX: "auto", marginTop: 12 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14.5, fontVariantNumeric: "tabular-nums" }}>
                  <thead><tr>{["Mode", "Popina", "Attendu", "Écart"].map((h, i) => <th key={h} style={{ textAlign: i ? "right" : "left", color: MUTED, fontSize: 12, fontWeight: 600, padding: "6px 6px", borderTop: `1px solid ${BORD}` }}>{h}</th>)}</tr></thead>
                  <tbody>{resultat.lignes.map((l) => (
                    <tr key={l.mode}>
                      <td style={{ padding: "6px", borderTop: `1px solid ${BORD}` }}>{l.libelle}</td>
                      <td style={{ padding: "6px", borderTop: `1px solid ${BORD}`, textAlign: "right" }}>{eur(l.popina)}</td>
                      <td style={{ padding: "6px", borderTop: `1px solid ${BORD}`, textAlign: "right" }}>{eur(l.attendu)}</td>
                      <td style={{ padding: "6px", borderTop: `1px solid ${BORD}`, textAlign: "right", fontWeight: 700, color: Math.abs(l.ecart) < 0.005 ? VERT : ROUGE }}>{Math.abs(l.ecart) < 0.005 ? "juste" : `${l.ecart > 0 ? "+" : "−"}${eur(Math.abs(l.ecart))}`}</td>
                    </tr>
                  ))}</tbody>
                </table>
                <div style={{ marginTop: 10, fontSize: 14 }}>Pourboires carte pour la paie : <strong>{eur(resultat.pourboiresPaie)}</strong>{resultat.pourboireAmex > 0 && <span style={{ color: MUTED }}> (dont AMEX {eur(resultat.pourboireAmex)})</span>}</div>
              </div>
            )}
          </section>

          {/* Export Flatpay */}
          <section style={{ border: `1.5px solid ${BORD}`, borderRadius: 14, background: "#fff", padding: "12px 14px", display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase" }}>Export Flatpay du jour</div>
                <div style={{ color: MUTED, fontSize: 12.5 }}>En cas d&apos;écart : app Flatpay de l&apos;iPad, transactions du jour, export ; et l&apos;export « titre restaurant » s&apos;il y a des Conecs.</div>
              </div>
              <input ref={fichierRef} type="file" multiple accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => void importer(e.target.files)} />
              <button type="button" disabled={import_.enCours} onClick={() => fichierRef.current?.click()} style={{ ...BTN, borderColor: ACCENT, color: ACCENT }}>{import_.enCours ? "Lecture…" : transactions.length ? "Ajouter un export" : "Déposer l'export"}</button>
            </div>
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
          </section>

          {/* Corrections et notes */}
          <section style={{ border: `1.5px solid ${BORD}`, borderRadius: 14, background: "#fff", padding: "12px 14px", display: "grid", gap: 8 }}>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase" }}>Corrections faites dans Popina</div>
            <div style={{ color: MUTED, fontSize: 12.5 }}>Une ligne par correction : la table, l&apos;heure, ce qui a changé. Le contrôle de la nuit les reconnaîtra.</div>
            {corrections.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14, padding: "4px 0", borderTop: "1px solid #f0ebe2" }}>
                <span style={{ flex: 1 }}>{c}</span>
                <button type="button" onClick={() => setCorrections((l) => l.filter((_, k) => k !== i))} aria-label="Retirer" style={{ border: "none", background: "transparent", color: MUTED, fontSize: 18, cursor: "pointer" }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={nouvelleCorrection} onChange={(e) => setNouvelleCorrection(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouterCorrection(); }} placeholder="Ex. : table 12 à 21 h 40, 26 € passés d'Espèces à Carte"
                style={{ flex: 1, minWidth: 0, height: 40, padding: "0 12px", borderRadius: 10, border: `1.5px solid ${BORD}`, fontSize: 14, fontFamily: "inherit" }} />
              <button type="button" onClick={ajouterCorrection} style={{ ...BTN, borderColor: BORD }}>Ajouter</button>
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Notes (facultatif)" style={{ padding: "10px 12px", borderRadius: 10, border: `1.5px solid ${BORD}`, fontSize: 14, fontFamily: "inherit", resize: "vertical" }} />
          </section>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
            <button type="button" disabled={!peutValider || etat.enregistrement} onClick={() => void enregistrer(true)}
              style={{ ...BTN, background: peutValider ? VERT : "#c9c2b4", borderColor: peutValider ? VERT : "#c9c2b4", color: "#fff", cursor: peutValider ? "pointer" : "not-allowed" }}>
              {statut === "validee" ? "Clôture validée ✓" : "Valider la clôture"}
            </button>
            <button type="button" disabled={resultat.niveau === "vide"} onClick={() => { void navigator.clipboard?.writeText(recap).then(() => { setCopie(true); setTimeout(() => setCopie(false), 1600); }); }} style={BTN}>{copie ? "Copié" : "Copier le récap"}</button>
            {resultat.niveau === "ok" && resultat.manquePourValider.length > 0 && <span style={{ fontSize: 13, color: ROUGE, fontWeight: 600 }}>Pour valider, il manque {resultat.manquePourValider.join(" et ")}.</span>}
            <span style={{ fontSize: 12.5, color: MUTED }}>{etat.enregistrement ? "Enregistrement…" : etat.info ?? "Enregistré automatiquement."}</span>
          </div>

          <div style={{ color: MUTED, fontSize: 13.5, lineHeight: 1.5, maxWidth: "70ch" }}>
            <p><strong style={{ color: "#1a1a1a" }}>Les règles.</strong> La caisse doit tomber juste au centime avant d&apos;arrêter Popina. On corrige le mode de paiement sur le bon ticket ; on n&apos;invente jamais de montant. Si un petit écart reste introuvable, on corrige le mode sur une table et on le note ci-dessus : le contrôle du lendemain trouvera la vraie cause.</p>
            <p><strong style={{ color: "#1a1a1a" }}>Les pourboires.</strong> Seuls ceux du TPE comptent pour la paie. Le liquide laissé sur la monnaie se passe en « monnaie rendue » et va dans la cagnotte : on ne le tape pas. Un pourboire carte n&apos;est saisi dans Popina que pour une facture, et on l&apos;annule avant d&apos;arrêter la caisse. On ne prend jamais dans les pourboires pour combler un écart.</p>
          </div>
        </>
      )}
    </div>
  );
}
