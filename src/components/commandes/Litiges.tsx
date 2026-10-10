"use client";

import React, { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { OSWALD } from "@/components/TuileProduit";
import { EtatVide } from "@/components/ui/EtatVide";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useBureau } from "@/hooks/useBureau";
import { ETATS, type EtatReception } from "@/lib/reception";

/**
 * Réclamations fournisseur (10/10/2026) : les écarts relevés au contrôle de réception
 * (manquant, partiel, abîmé, refusé, prix différent) avec leur montant, par fournisseur.
 * Statuts : à réclamer → réclamé → avoir reçu (ou abandonné). Un mail de réclamation est
 * préparé à partir des lignes (modifiable) et envoyé au fournisseur depuis l'app.
 */
type Statut = "a_reclamer" | "reclame" | "avoir_recu" | "abandonne";
type Ligne = {
  id: string; session_id: string; supplier_id: string | null; produit: string; quantite: number; unite: string | null;
  prix_unitaire_ht: number | null; qty_received: number | null; etat: EtatReception | null; prix_recu: number | null;
  montant: number; statut: Statut; reclame_at: string | null; note: string | null; commentaire: string | null;
  commande_du: string | null; recue_le: string | null; document_numero: string | null;
};
type Fournisseur = { id: string; nom: string; emails: string[] };

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const ROUGE = "#b4443a";
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const CHAMP: CSSProperties = { padding: "0 12px", height: 38, borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 13.5, fontFamily: "inherit", outline: "none", background: "#fff", color: "#1a1a1a", width: "100%", boxSizing: "border-box" };
export const STATUTS_LITIGE: Record<Statut, { libelle: string; couleur: string }> = {
  a_reclamer: { libelle: "À réclamer", couleur: ROUGE },
  reclame: { libelle: "Réclamé", couleur: "#b7791f" },
  avoir_recu: { libelle: "Avoir reçu", couleur: "#4a6741" },
  abandonne: { libelle: "Abandonné", couleur: FAIBLE },
};
const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const qte = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const u = (l: { unite: string | null }) => (l.unite ?? "").trim() || "unité";
const dateFr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) : "");

/** Ce qui s'est passé sur la ligne, en une phrase (mail et liste) */
export function detailLitige(l: Ligne): string {
  switch (l.etat) {
    case "manquant": return `commandé ${qte(l.quantite)} ${u(l)}, rien livré`;
    case "partiel": return `commandé ${qte(l.quantite)} ${u(l)}, reçu ${qte(l.qty_received ?? 0)}`;
    case "abime": return `commandé ${qte(l.quantite)} ${u(l)}, ${qte(l.qty_received ?? 0)} utilisable${(l.qty_received ?? 0) > 1 ? "s" : ""} (abîmé)`;
    case "refuse": return `refusé à la livraison (${qte(l.quantite)} ${u(l)})`;
    case "prix": return `facturé ${l.prix_recu != null ? eur(l.prix_recu) : "?"} au lieu de ${l.prix_unitaire_ht != null ? eur(l.prix_unitaire_ht) : "?"} HT / ${u(l)} (× ${qte(l.quantite)})`;
    default: return "écart à la réception";
  }
}

function texteMail(f: Fournisseur, lignes: Ligne[], etab: string): { sujet: string; texte: string } {
  const total = lignes.reduce((t, l) => t + l.montant, 0);
  const commandes = [...new Set(lignes.map((l) => [l.commande_du ? `du ${dateFr(l.commande_du)}` : null, l.document_numero ? `bon n° ${l.document_numero}` : null].filter(Boolean).join(", ")))].filter(Boolean);
  const texte = [
    "Bonjour,",
    "",
    `À la réception de notre commande${commandes.length ? ` ${commandes.join(" et ")}` : ""}, nous avons relevé les écarts suivants :`,
    "",
    ...lignes.map((l) => `- ${l.produit} : ${detailLitige(l)} → ${eur(l.montant)} HT${l.commentaire ? ` (${l.commentaire})` : ""}`),
    "",
    `Total à régulariser : ${eur(total)} HT.`,
    "",
    "Merci de nous adresser un avoir correspondant.",
    "",
    "Cordialement,",
    etab,
  ].join("\n");
  return { sujet: `Réclamation livraison ${f.nom} — ${etab} — ${eur(total)} HT`, texte };
}

/** Bouton d'accès (en-tête de la page Commandes) : nombre et montant à réclamer */
export function BoutonLitiges({ bureau, style }: { bureau: boolean; style?: CSSProperties }) {
  const [ouvert, setOuvert] = useState(false);
  const [resume, setResume] = useState<{ n: number; total: number } | null>(null);
  const charger = useCallback(async () => {
    const r = await fetchApi("/api/commandes/litiges").catch(() => null);
    if (!r?.ok) return;
    const j = await r.json();
    const ouverts = ((j.lignes ?? []) as Ligne[]).filter((l) => l.statut === "a_reclamer" || l.statut === "reclame");
    setResume({ n: ouverts.length, total: ouverts.reduce((t, l) => t + l.montant, 0) });
  }, []);
  useEffect(() => { const t = setTimeout(() => void charger(), 0); return () => clearTimeout(t); }, [charger]);
  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} title="Écarts relevés à la réception, à réclamer aux fournisseurs"
        style={{ ...BTN, ...style, display: "inline-flex", alignItems: "center", gap: 6, ...(resume?.n ? { borderColor: ROUGE, color: ROUGE } : {}) }}>
        {bureau ? "Réclamations" : "Litiges"}
        {resume?.n ? <span style={{ fontWeight: 700 }}>{bureau ? `· ${eur(resume.total)}` : `· ${resume.n}`}</span> : null}
      </button>
      {ouvert && <Litiges onFermer={() => { setOuvert(false); void charger(); }} />}
    </>
  );
}

export function Litiges({ onFermer }: { onFermer: () => void }) {
  const bureau = useBureau();
  const { current: etab } = useEtablissement();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [vue, setVue] = useState<"ouverts" | "clos">("ouverts");
  const [mail, setMail] = useState<{ f: Fournisseur; lignes: Ligne[] } | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetchApi("/api/commandes/litiges");
      const j = await r.json();
      if (!r.ok) { setErreur(j?.error ?? "Chargement impossible"); return; }
      setLignes(j.lignes ?? []);
      setFournisseurs(j.fournisseurs ?? []);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Chargement impossible"); }
    finally { setChargement(false); }
  }, []);
  useEffect(() => { const t = setTimeout(() => void charger(), 0); return () => clearTimeout(t); }, [charger]);

  async function changer(ids: string[], statut: Statut) {
    setLignes((prev) => prev.map((l) => (ids.includes(l.id) ? { ...l, statut } : l)));
    const r = await fetchApi("/api/commandes/litiges", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, statut }) });
    if (!r.ok) { const j = await r.json().catch(() => null); setErreur(j?.error ?? "Enregistrement impossible"); void charger(); }
  }

  const visibles = lignes.filter((l) => (vue === "ouverts" ? l.statut === "a_reclamer" || l.statut === "reclame" : l.statut === "avoir_recu" || l.statut === "abandonne"));
  const groupes = useMemo(() => fournisseurs
    .map((f) => ({ f, lignes: visibles.filter((l) => l.supplier_id === f.id) }))
    .filter((g) => g.lignes.length)
    .sort((a, b) => b.lignes.reduce((t, l) => t + l.montant, 0) - a.lignes.reduce((t, l) => t + l.montant, 0)), [fournisseurs, visibles]);
  const totalOuvert = lignes.filter((l) => l.statut === "a_reclamer" || l.statut === "reclame").reduce((t, l) => t + l.montant, 0);
  const totalAvoirs = lignes.filter((l) => l.statut === "avoir_recu").reduce((t, l) => t + l.montant, 0);

  return (
    <VoletDroit titre="Réclamations fournisseurs" sousTitre={chargement ? "Chargement…" : `${eur(totalOuvert)} HT en cours · ${eur(totalAvoirs)} HT d'avoirs reçus`} largeur={760} onFermer={onFermer}>
      {erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: ROUGE, fontSize: 13, marginBottom: 12 }}>{erreur}</div>}
      {info && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(74,103,65,0.10)", color: "#4a6741", fontSize: 13, marginBottom: 12 }}>{info}</div>}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {([["ouverts", "En cours"], ["clos", "Réglés"]] as const).map(([v, lib]) => (
          <button key={v} type="button" onClick={() => setVue(v)} style={{ height: 30, padding: "0 12px", borderRadius: 9, border: `1px solid ${vue === v ? "#1a1a1a" : BORD}`, background: vue === v ? "#1a1a1a" : "#fff", color: vue === v ? "#fff" : MUTED, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>{lib}</button>
        ))}
      </div>
      {chargement && <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div>}
      {!chargement && groupes.length === 0 && (
        <EtatVide icone="camion" titre={vue === "ouverts" ? "Rien à réclamer" : "Aucune réclamation réglée"} texte={vue === "ouverts" ? "Les écarts relevés au contrôle de réception (manquant, partiel, abîmé, refusé, prix) apparaissent ici." : "Les réclamations passées en « avoir reçu » ou « abandonné » apparaissent ici."} />
      )}
      <div style={{ display: "grid", gap: 14 }}>
        {groupes.map(({ f, lignes: ls }) => {
          const aReclamer = ls.filter((l) => l.statut === "a_reclamer");
          const total = ls.reduce((t, l) => t + l.montant, 0);
          return (
            <section key={f.id} style={{ border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden", background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "#f7f3ec", flexWrap: "wrap" }}>
                <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".03em" }}>{f.nom}</span>
                <span style={{ fontSize: 12.5, color: MUTED }}>{ls.length} ligne{ls.length > 1 ? "s" : ""} · <strong style={{ color: "#1a1a1a" }}>{eur(total)} HT</strong></span>
                {vue === "ouverts" && (
                  <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {aReclamer.length > 0 && <button type="button" onClick={() => setMail({ f, lignes: aReclamer })} style={{ ...BTN, height: 32, background: ROUGE, color: "#fff", border: "none", fontWeight: 700 }}>Réclamer par mail</button>}
                    <button type="button" onClick={() => void changer(ls.map((l) => l.id), "avoir_recu")} style={{ ...BTN, height: 32 }}>Tout : avoir reçu</button>
                  </span>
                )}
              </div>
              {ls.map((l) => {
                const s = STATUTS_LITIGE[l.statut];
                return (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: bureau ? "1fr auto auto" : "1fr auto", gap: bureau ? 12 : 6, alignItems: "center", padding: "10px 14px", borderTop: "1px solid #f0ebe2" }}>
                    <div style={{ minWidth: 0, gridColumn: bureau ? undefined : "1 / -1" }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5 }}>{l.produit}{l.etat && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: ETATS[l.etat].couleur }}>{ETATS[l.etat].libelle}</span>}</div>
                      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.4 }}>
                        {detailLitige(l)}{l.commande_du ? ` · commande du ${dateFr(l.commande_du)}` : ""}{l.document_numero ? ` · bon ${l.document_numero}` : ""}
                        {l.commentaire && <span style={{ fontStyle: "italic" }}> · {l.commentaire}</span>}
                        {l.statut === "reclame" && l.reclame_at && <div style={{ color: "#b7791f" }}>Réclamé le {dateFr(l.reclame_at)}{l.note ? ` · ${l.note}` : ""}</div>}
                      </div>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", textAlign: "right" }}>{eur(l.montant)}</div>
                    <select value={l.statut} onChange={(e) => void changer([l.id], e.target.value as Statut)} style={{ height: 32, borderRadius: 8, border: `1px solid ${s.couleur}66`, color: s.couleur, fontWeight: 700, fontSize: 12.5, fontFamily: "inherit", background: "#fff", padding: "0 6px" }}>
                      {(Object.keys(STATUTS_LITIGE) as Statut[]).map((k) => <option key={k} value={k}>{STATUTS_LITIGE[k].libelle}</option>)}
                    </select>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
      {mail && (
        <MailReclamation f={mail.f} lignes={mail.lignes} etab={etab?.nom ?? "Bello Mio"} bureau={bureau} onFermer={() => setMail(null)}
          onEnvoye={(dest) => { setMail(null); setInfo(`Réclamation envoyée à ${dest.join(", ")}.`); void charger(); }} />
      )}
    </VoletDroit>
  );
}

function MailReclamation({ f, lignes, etab, bureau, onFermer, onEnvoye }: { f: Fournisseur; lignes: Ligne[]; etab: string; bureau: boolean; onFermer: () => void; onEnvoye: (dest: string[]) => void }) {
  const modele = useMemo(() => texteMail(f, lignes, etab), [f, lignes, etab]);
  const [dest, setDest] = useState(f.emails.slice(0, 1).join(", "));
  const [sujet, setSujet] = useState(modele.sujet);
  const [texte, setTexte] = useState(modele.texte);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);

  async function envoyer() {
    setEnvoi(true); setErreur(null);
    const destinataires = dest.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
    try {
      const r = await fetchApi("/api/commandes/litiges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: lignes.map((l) => l.id), destinataires, sujet, texte }) });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErreur(j?.error ?? "Envoi impossible"); return; }
      onEnvoye(j.destinataires ?? destinataires);
    } catch (e) { setErreur(e instanceof Error ? e.message : "Envoi impossible"); }
    finally { setEnvoi(false); }
  }

  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(26,26,26,0.45)", display: "flex", alignItems: bureau ? "center" : "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: "#fff", borderRadius: bureau ? 16 : "20px 20px 0 0", width: bureau ? "min(620px, calc(100vw - 32px))" : "100%", maxHeight: "92vh", overflowY: "auto", padding: bureau ? "20px 22px" : "18px 16px calc(16px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase" }}>Réclamation {f.nom}</div>
            <div style={{ fontSize: 12.5, color: MUTED }}>{lignes.length} ligne{lignes.length > 1 ? "s" : ""} · {eur(lignes.reduce((t, l) => t + l.montant, 0))} HT · le texte est modifiable</div>
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: "none", background: "transparent", fontSize: 22, color: MUTED, cursor: "pointer" }}>×</button>
        </div>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>À</span>
          <input value={dest} onChange={(e) => setDest(e.target.value)} placeholder="adresse@fournisseur.fr" style={CHAMP} />
          {f.emails.length > 1 && <span style={{ fontSize: 11.5, color: MUTED }}>Contacts connus : {f.emails.map((m) => <button key={m} type="button" onClick={() => setDest((d) => (d.includes(m) ? d : d ? `${d}, ${m}` : m))} style={{ border: "none", background: "transparent", color: "#D4775A", cursor: "pointer", fontFamily: "inherit", fontSize: 11.5, padding: "0 4px" }}>{m}</button>)}</span>}
          {f.emails.length === 0 && <span style={{ fontSize: 11.5, color: "#b7791f" }}>Aucune adresse sur la fiche fournisseur : saisissez-la.</span>}
        </label>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Objet</span>
          <input value={sujet} onChange={(e) => setSujet(e.target.value)} style={CHAMP} />
        </label>
        <textarea value={texte} onChange={(e) => setTexte(e.target.value)} rows={12} style={{ ...CHAMP, height: "auto", padding: "10px 12px", resize: "vertical", fontSize: 13, lineHeight: 1.5 }} />
        {erreur && <div style={{ fontSize: 12.5, color: ROUGE }}>{erreur}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          <button type="button" onClick={() => { void navigator.clipboard?.writeText(`${sujet}\n\n${texte}`).then(() => { setCopie(true); setTimeout(() => setCopie(false), 2000); }); }} style={BTN}>{copie ? "Copié" : "Copier le texte"}</button>
          <button type="button" onClick={onFermer} style={BTN}>Annuler</button>
          <button type="button" disabled={envoi || !dest.trim()} onClick={() => void envoyer()} style={{ ...BTN, background: ROUGE, color: "#fff", border: "none", fontWeight: 700, opacity: envoi || !dest.trim() ? 0.6 : 1 }}>{envoi ? "Envoi…" : "Envoyer"}</button>
        </div>
      </div>
    </div>
  );
}
