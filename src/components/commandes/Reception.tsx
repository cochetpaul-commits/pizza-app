"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { OSWALD } from "@/components/TuileProduit";
import { EtatVide } from "@/components/ui/EtatVide";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau } from "@/hooks/useBureau";
import { ETATS, erreurLigne, montantReclame, quantiteEnStock, resumeReception, type EtatReception, type LigneControle } from "@/lib/reception";

/**
 * Contrôle de réception d'une commande (10/10/2026, sur le modèle du contrôle des livraisons
 * ComandR) : progression, filtres, et pour chaque ligne trois gestes (Reçu, Manque, Partiel) plus
 * un menu (Abîmé, Refusé, Prix différent). Un signalement précise la quantité reçue, si la ligne
 * est facturée, un commentaire ; l'app affiche ce qui entre en stock et le montant à réclamer.
 * Chaque geste est enregistré tout de suite ; « Valider la réception » clôt la commande et crée
 * les mouvements de stock avec ce qui est réellement entré.
 */
type Ligne = {
  id: string; ingredient_id: string | null; ingredient_name: string; category: string | null;
  quantite: number; unite: string | null; prix_unitaire_ht: number | null;
  qty_received: number | null; reception_note: string | null;
  etat_reception: EtatReception | null; prix_recu: number | null; facture_sur_bon: boolean; montant_reclame: number;
};
type Session = { id: string; status: string; supplier_name: string; created_at: string; email_sent_at: string | null; received_at: string | null; total_ht: number | null };
type Filtre = "tout" | "a_controler" | "problemes";

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const ACCENT = "#D4775A";
const VERT = "#4a6741";
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const GESTE: CSSProperties = { height: 34, padding: "0 12px", borderRadius: 9, border: `1px solid ${BORD}`, background: "#fff", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 5 };
const CHAMP: CSSProperties = { height: 40, padding: "0 12px", borderRadius: 10, border: `1px solid ${BORD}`, fontSize: 14, fontFamily: "inherit", outline: "none", background: "#fff", color: "#1a1a1a", width: "100%", boxSizing: "border-box" };

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const qte = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
const unite = (l: { unite: string | null }, n = 1) => { const u = (l.unite ?? "").trim(); if (!u) return n > 1 ? "unités" : "unité"; return n > 1 && !/s$/.test(u) && !/^(kg|g|l|cl|ml)$/i.test(u) ? `${u}s` : u; };
const dateCourte = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : null;
const controle = (l: Ligne): LigneControle => ({ quantite: l.quantite, prix_unitaire_ht: l.prix_unitaire_ht, etat_reception: l.etat_reception, qty_received: l.qty_received, prix_recu: l.prix_recu, facture_sur_bon: l.facture_sur_bon });

function Badge({ etat }: { etat: EtatReception }) {
  const e = ETATS[etat];
  return <span style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: `${e.couleur}1f`, color: e.couleur, whiteSpace: "nowrap" }}>{etat === "recu" ? "✓ Reçu" : e.libelle}</span>;
}

export function Reception({ sessionId, onFermer, onValidee }: { sessionId: string; onFermer: () => void; onValidee: () => void }) {
  const bureau = useBureau();
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const [validation, setValidation] = useState(false);
  const [filtre, setFiltre] = useState<Filtre>("tout");
  const [q, setQ] = useState("");
  const [menuId, setMenuId] = useState<string | null>(null);
  const [signalement, setSignalement] = useState<{ ligne: Ligne; etat: EtatReception } | null>(null);
  const [confirmation, setConfirmation] = useState(false);
  const lignesRef = useRef(lignes);
  lignesRef.current = lignes;

  useEffect(() => {
    let annule = false;
    (async () => {
      try {
        const r = await fetchApi(`/api/commandes/reception?session_id=${sessionId}`);
        const j = await r.json();
        if (annule) return;
        if (!r.ok) { setErreur(j?.error ?? "Chargement impossible"); setChargement(false); return; }
        setLignes((j.lines ?? []) as Ligne[]);
        setSession(j.session ?? null);
        setChargement(false);
      } catch (e) { if (!annule) { setErreur(e instanceof Error ? e.message : "Chargement impossible"); setChargement(false); } }
    })();
    return () => { annule = true; };
  }, [sessionId]);

  // Fermer le menu « … » au clic ailleurs
  useEffect(() => {
    if (!menuId) return;
    const h = () => setMenuId(null);
    window.addEventListener("click", h);
    return () => window.removeEventListener("click", h);
  }, [menuId]);

  const enregistrer = useCallback(async (modifiees: Ligne[], finalize = false) => {
    setEnregistrement(true);
    setErreur(null);
    try {
      const r = await fetchApi("/api/commandes/reception", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: sessionId, finalize,
          lines: modifiees.map((l) => ({ id: l.id, etat_reception: l.etat_reception, qty_received: l.qty_received, prix_recu: l.prix_recu, facture_sur_bon: l.facture_sur_bon, reception_note: l.reception_note })),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) { setErreur(j?.error ?? "Enregistrement impossible"); return false; }
      return true;
    } catch (e) { setErreur(e instanceof Error ? e.message : "Enregistrement impossible"); return false; }
    finally { setEnregistrement(false); }
  }, [sessionId]);

  /** Applique un état à une ligne et l'enregistre tout de suite */
  const appliquer = useCallback((id: string, patch: Partial<Ligne>) => {
    const suivantes = lignesRef.current.map((l) => (l.id === id ? { ...l, ...patch, montant_reclame: montantReclame(controle({ ...l, ...patch })) } : l));
    setLignes(suivantes);
    const ligne = suivantes.find((l) => l.id === id);
    if (ligne) void enregistrer([ligne]);
  }, [enregistrer]);

  const recu = (l: Ligne) => appliquer(l.id, { etat_reception: "recu", qty_received: l.quantite, prix_recu: null });
  const retirer = (l: Ligne) => appliquer(l.id, { etat_reception: null, qty_received: null, prix_recu: null, facture_sur_bon: true, reception_note: null });

  const resume = useMemo(() => resumeReception(lignes.map(controle)), [lignes]);
  const nbAControler = lignes.filter((l) => !l.etat_reception).length;
  const visibles = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lignes.filter((l) =>
      (filtre === "tout" || (filtre === "a_controler" ? !l.etat_reception : l.etat_reception != null && ETATS[l.etat_reception].probleme))
      && (!n || l.ingredient_name.toLowerCase().includes(n)));
  }, [lignes, filtre, q]);

  async function valider() {
    setConfirmation(false);
    setValidation(true);
    // Les lignes non contrôlées sont comptées reçues conformes
    const toutes = lignesRef.current.map((l) => (l.etat_reception ? l : { ...l, etat_reception: "recu" as const, qty_received: l.quantite }));
    const ok = await enregistrer(toutes, true);
    setValidation(false);
    if (ok) onValidee();
  }

  const lue = session?.status === "recue";
  const titre = session?.supplier_name || "Réception";
  const sousTitre = session
    ? [`Commande du ${dateCourte(session.created_at)}`, session.email_sent_at ? `envoyée le ${dateCourte(session.email_sent_at)}` : null, lue && session.received_at ? `reçue le ${dateCourte(session.received_at)}` : null, `${lignes.length} ligne${lignes.length > 1 ? "s" : ""}`].filter(Boolean).join(" · ")
    : "Chargement…";

  const pied = !chargement && lignes.length > 0 && !lue ? (
    <>
      <div style={{ flex: "1 1 180px", minWidth: 0, fontSize: 12.5, color: MUTED, lineHeight: 1.35 }}>
        <span style={{ color: VERT, fontWeight: 700 }}>{resume.conformes} conforme{resume.conformes > 1 ? "s" : ""}</span>
        {resume.problemes > 0 && <> · <span style={{ color: "#b4443a", fontWeight: 700 }}>{resume.problemes} problème{resume.problemes > 1 ? "s" : ""}</span></>}
        {nbAControler > 0 && <> · {nbAControler} à contrôler</>}
        {resume.aReclamer > 0 && <div style={{ fontWeight: 700, color: "#1a1a1a" }}>À réclamer : {eur(resume.aReclamer)} HT</div>}
        {enregistrement && <div style={{ color: FAIBLE }}>Enregistrement…</div>}
      </div>
      <button type="button" disabled={validation || enregistrement} onClick={() => (nbAControler > 0 || resume.problemes > 0 ? setConfirmation(true) : void valider())}
        style={{ ...BTN, background: VERT, color: "#fff", border: "none", fontWeight: 700, opacity: validation ? 0.6 : 1 }}>
        {validation ? "Validation…" : "Valider la réception"}
      </button>
    </>
  ) : undefined;

  return (
    <VoletDroit titre={titre} sousTitre={sousTitre} largeur={720} onFermer={onFermer} pied={pied}>
      <style>{`.rc-geste:hover{background:#f7f3ec}.rc-pill{height:30px;padding:0 10px;border-radius:9px;border:1px solid ${BORD};background:#fff;font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;color:${MUTED};white-space:nowrap;display:inline-flex;align-items:center;gap:5px}.rc-pill.on{background:#1a1a1a;color:#fff;border-color:#1a1a1a}.rc-pill.on span{color:#c9c2b4}.rc-pill span{font-weight:500;color:${FAIBLE}}`}</style>
      {erreur && <div style={{ padding: "10px 14px", borderRadius: 10, background: "rgba(180,68,58,0.08)", color: "#b4443a", fontSize: 13, marginBottom: 12 }}>{erreur}</div>}
      {chargement && <div style={{ padding: 40, textAlign: "center", color: MUTED }}>Chargement…</div>}
      {!chargement && lignes.length === 0 && <EtatVide icone="commande" titre="Aucune ligne" texte="Cette commande ne contient aucun article." />}
      {!chargement && lignes.length > 0 && (
        <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
          {/* Statut + progression */}
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, border: `1px solid ${lue ? VERT : ACCENT}`, color: lue ? VERT : ACCENT, background: "#fff" }}>{lue ? "Reçue" : "À contrôler"}</span>
              {session?.total_ht != null && session.total_ht > 0 && <span style={{ fontSize: 12.5, color: MUTED }}>Commande {eur(session.total_ht)} HT</span>}
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{resume.controlees}/{resume.total} contrôlée{resume.controlees > 1 ? "s" : ""}</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: "#ece6db", overflow: "hidden" }}>
              <div style={{ width: `${resume.total ? (resume.controlees / resume.total) * 100 : 0}%`, height: "100%", background: resume.problemes ? "#b7791f" : VERT, transition: "width .2s" }} />
            </div>
          </div>

          {/* Recherche + filtres */}
          <div style={{ display: "grid", gap: 8 }}>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un produit…" style={{ ...CHAMP, height: 36, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {([["tout", "Tout", lignes.length], ["a_controler", "À contrôler", nbAControler], ["problemes", "Problèmes", resume.problemes]] as [Filtre, string, number][]).map(([cle, lib, n]) => (
                <button key={cle} type="button" className={`rc-pill${filtre === cle ? " on" : ""}`} onClick={() => setFiltre(cle)}>{lib} <span>{n}</span></button>
              ))}
            </div>
          </div>

          {/* Lignes */}
          {visibles.length === 0 && <EtatVide compact icone="recherche" titre="Aucune ligne ne correspond" texte="Modifiez la recherche ou le filtre." />}
          <div style={{ display: "grid", gap: 8 }}>
            {visibles.map((l) => {
              const e = l.etat_reception ? ETATS[l.etat_reception] : null;
              const total = l.prix_unitaire_ht != null ? l.prix_unitaire_ht * l.quantite : null;
              const enStock = quantiteEnStock(controle(l));
              const num = lignes.indexOf(l) + 1;
              return (
                <div key={l.id} style={{ background: "#fff", border: `1px solid ${e ? (e.probleme ? `${e.couleur}66` : "#cfe3d6") : BORD}`, borderLeft: `4px solid ${e ? e.couleur : BORD}`, borderRadius: 12, padding: "10px 12px 10px 12px", display: "grid", gap: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13.5, lineHeight: 1.25, color: "#1a1a1a" }}><span style={{ color: FAIBLE, fontWeight: 500, fontSize: 12 }}>{num}.</span> {l.ingredient_name}</div>
                      <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
                        Commandé : <strong style={{ color: "#1a1a1a" }}>{qte(l.quantite)} {unite(l, l.quantite)}</strong>
                        {l.prix_unitaire_ht != null ? ` · ${eur(l.prix_unitaire_ht)} HT / ${unite(l)}` : <span style={{ color: "#b7791f" }}> · prix inconnu</span>}
                        {total != null && <span style={{ fontVariantNumeric: "tabular-nums" }}> · {eur(total)}</span>}
                      </div>
                    </div>
                    {e && <Badge etat={l.etat_reception!} />}
                  </div>
                  {e && e.probleme && (
                    <div style={{ fontSize: 12.5, color: "#1a1a1a", background: "#f7f3ec", borderRadius: 8, padding: "6px 10px", lineHeight: 1.4 }}>
                      {l.etat_reception === "prix"
                        ? <>Facturé {l.prix_recu != null ? eur(l.prix_recu) : "—"} HT / {unite(l)} au lieu de {l.prix_unitaire_ht != null ? eur(l.prix_unitaire_ht) : "—"}</>
                        : <>Entre en stock : <strong>{qte(enStock)} {unite(l, enStock)}</strong> sur {qte(l.quantite)}{!l.facture_sur_bon && <span style={{ color: MUTED }}> · non facturé</span>}</>}
                      {l.montant_reclame > 0 && <> · <strong style={{ color: "#b4443a" }}>à réclamer {eur(l.montant_reclame)} HT</strong></>}
                      {l.reception_note && <div style={{ color: MUTED, fontStyle: "italic" }}>{l.reception_note}</div>}
                    </div>
                  )}
                  {!lue && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", position: "relative" }}>
                      <button type="button" className="rc-geste" onClick={() => recu(l)} style={{ ...GESTE, ...(l.etat_reception === "recu" ? { background: VERT, color: "#fff", borderColor: VERT } : {}) }}>✓ Reçu</button>
                      <button type="button" className="rc-geste" onClick={() => setSignalement({ ligne: l, etat: "manquant" })} style={{ ...GESTE, ...(l.etat_reception === "manquant" ? { background: "#b4443a", color: "#fff", borderColor: "#b4443a" } : {}) }}>Manque</button>
                      <button type="button" className="rc-geste" onClick={() => setSignalement({ ligne: l, etat: "partiel" })} style={{ ...GESTE, ...(l.etat_reception === "partiel" ? { background: "#b7791f", color: "#fff", borderColor: "#b7791f" } : {}) }}>Partiel</button>
                      <button type="button" className="rc-geste" aria-label="Plus d'options" onClick={(ev) => { ev.stopPropagation(); setMenuId(menuId === l.id ? null : l.id); }} style={{ ...GESTE, padding: "0 10px", fontSize: 16, letterSpacing: 1 }}>···</button>
                      {menuId === l.id && (
                        <div onClick={(ev) => ev.stopPropagation()} style={{ position: "absolute", left: 0, top: 38, zIndex: 5, background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, boxShadow: "0 10px 30px rgba(0,0,0,0.14)", padding: 6, minWidth: 220, display: "grid" }}>
                          {(["abime", "refuse", "prix"] as EtatReception[]).map((et) => (
                            <button key={et} type="button" onClick={() => { setMenuId(null); setSignalement({ ligne: l, etat: et }); }} style={{ textAlign: "left", border: "none", background: "transparent", padding: "9px 10px", borderRadius: 8, fontSize: 13.5, fontFamily: "inherit", cursor: "pointer", color: "#1a1a1a" }}>{ETATS[et].libelle}…<span style={{ display: "block", fontSize: 11.5, color: MUTED }}>{ETATS[et].detail}</span></button>
                          ))}
                          {l.etat_reception && <button type="button" onClick={() => { setMenuId(null); retirer(l); }} style={{ textAlign: "left", border: "none", borderTop: `1px solid ${BORD}`, background: "transparent", padding: "9px 10px", fontSize: 13, fontFamily: "inherit", cursor: "pointer", color: MUTED }}>Retirer le contrôle</button>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {!lue && <div style={{ fontSize: 12, color: FAIBLE, lineHeight: 1.4 }}>Chaque geste est enregistré tout de suite. À la validation, les lignes non contrôlées sont comptées reçues conformes, le stock est mis à jour avec ce qui est réellement entré.</div>}
        </div>
      )}

      {signalement && (
        <Signalement ligne={signalement.ligne} etatInitial={signalement.etat} bureau={bureau} onFermer={() => setSignalement(null)}
          onEnregistrer={(patch) => { appliquer(signalement.ligne.id, patch); setSignalement(null); }} />
      )}
      {confirmation && (
        <Feuille bureau={bureau} onFermer={() => setConfirmation(false)}>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 18, textTransform: "uppercase", color: "#1a1a1a" }}>Valider la réception ?</div>
          <div style={{ fontSize: 13.5, color: "#1a1a1a", lineHeight: 1.5, marginTop: 8 }}>
            {nbAControler > 0 && <div>{nbAControler} ligne{nbAControler > 1 ? "s" : ""} non contrôlée{nbAControler > 1 ? "s" : ""} : comptée{nbAControler > 1 ? "s" : ""} reçue{nbAControler > 1 ? "s" : ""} conforme{nbAControler > 1 ? "s" : ""}.</div>}
            {resume.problemes > 0 && <div>{resume.problemes} problème{resume.problemes > 1 ? "s" : ""} signalé{resume.problemes > 1 ? "s" : ""}{resume.aReclamer > 0 ? <> · <strong>{eur(resume.aReclamer)} HT à réclamer</strong> au fournisseur</> : null}.</div>}
            <div style={{ color: MUTED, marginTop: 6 }}>Le stock est mis à jour avec ce qui est réellement entré.</div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button type="button" onClick={() => setConfirmation(false)} style={BTN}>Annuler</button>
            <button type="button" onClick={() => void valider()} style={{ ...BTN, background: VERT, color: "#fff", border: "none", fontWeight: 700 }}>Valider</button>
          </div>
        </Feuille>
      )}
    </VoletDroit>
  );
}

/** Feuille par-dessus le volet : centrée sur bureau, qui monte du bas sur téléphone */
function Feuille({ bureau, onFermer, children }: { bureau: boolean; onFermer: () => void; children: React.ReactNode }) {
  return (
    <div onClick={onFermer} style={{ position: "fixed", inset: 0, zIndex: 400, background: "rgba(26,26,26,0.45)", display: "flex", alignItems: bureau ? "center" : "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ background: "#fff", borderRadius: bureau ? 16 : "20px 20px 0 0", width: bureau ? "min(460px, calc(100vw - 32px))" : "100%", maxHeight: "92vh", overflowY: "auto", padding: bureau ? "20px 22px" : "18px 16px calc(16px + env(safe-area-inset-bottom, 0px))", boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
        {children}
      </div>
    </div>
  );
}

/** Fiche de signalement d'un problème sur une ligne */
function Signalement({ ligne, etatInitial, bureau, onFermer, onEnregistrer }: {
  ligne: Ligne; etatInitial: EtatReception; bureau: boolean; onFermer: () => void;
  onEnregistrer: (patch: Partial<Ligne>) => void;
}) {
  const dejaCeType = ligne.etat_reception === etatInitial;
  const [etat, setEtat] = useState<EtatReception>(etatInitial);
  const [qteRecue, setQteRecue] = useState<string>(dejaCeType && ligne.qty_received != null ? String(ligne.qty_received) : "");
  const [prixRecu, setPrixRecu] = useState<string>(dejaCeType && ligne.prix_recu != null ? String(ligne.prix_recu) : "");
  const [facture, setFacture] = useState<boolean>(ligne.facture_sur_bon);
  const [note, setNote] = useState<string>(ligne.reception_note ?? "");
  const num = (s: string) => { const v = parseFloat(s.replace(",", ".")); return Number.isFinite(v) ? v : null; };
  const ctrl: LigneControle = { quantite: ligne.quantite, prix_unitaire_ht: ligne.prix_unitaire_ht, etat_reception: etat, qty_received: num(qteRecue), prix_recu: num(prixRecu), facture_sur_bon: facture };
  const erreur = erreurLigne(ctrl);
  const montant = montantReclame(ctrl);
  const enStock = quantiteEnStock(ctrl);
  const TYPES: EtatReception[] = ["manquant", "partiel", "abime", "refuse", "prix"];
  const demandeQte = etat === "partiel" || etat === "abime";

  return (
    <Feuille bureau={bureau} onFermer={onFermer}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", color: "#1a1a1a", lineHeight: 1.15 }}>Problème sur « {ligne.ingredient_name} »</div>
          <div style={{ fontSize: 12.5, color: MUTED, marginTop: 3 }}>Commandé : {qte(ligne.quantite)} {unite(ligne, ligne.quantite)}{ligne.prix_unitaire_ht != null ? ` · ${eur(ligne.prix_unitaire_ht)} HT / ${unite(ligne)}` : ""}</div>
        </div>
        <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, color: MUTED, cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}>×</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
        {TYPES.map((t) => {
          const actif = etat === t;
          return (
            <button key={t} type="button" onClick={() => setEtat(t)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, border: `${actif ? 2 : 1}px solid ${actif ? "#1a1a1a" : BORD}`, background: actif ? "#f7f3ec" : "#fff", cursor: "pointer", fontFamily: "inherit" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{ETATS[t].libelle}</div>
              <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>{ETATS[t].detail}</div>
            </button>
          );
        })}
      </div>

      {demandeQte && (
        <label style={{ display: "block", marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{etat === "abime" ? "Quantité utilisable" : "Quantité reçue"}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input inputMode="decimal" value={qteRecue} onChange={(e) => setQteRecue(e.target.value)} placeholder="0" autoFocus style={{ ...CHAMP, width: 120, fontSize: 18, fontFamily: OSWALD, fontWeight: 700, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: MUTED }}>sur {qte(ligne.quantite)} {unite(ligne, ligne.quantite)}</span>
          </div>
        </label>
      )}
      {etat === "prix" && (
        <label style={{ display: "block", marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Prix facturé, HT par {unite(ligne)}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input inputMode="decimal" value={prixRecu} onChange={(e) => setPrixRecu(e.target.value)} placeholder="0,00" autoFocus style={{ ...CHAMP, width: 140, fontSize: 18, fontFamily: OSWALD, fontWeight: 700, textAlign: "center" }} />
            <span style={{ fontSize: 13, color: MUTED }}>{ligne.prix_unitaire_ht != null ? `convenu ${eur(ligne.prix_unitaire_ht)}` : "prix convenu inconnu"}</span>
          </div>
        </label>
      )}
      {etat !== "prix" && (
        <button type="button" onClick={() => setFacture(!facture)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", marginTop: 14, padding: "10px 12px", borderRadius: 12, border: `1px solid ${BORD}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
          <span>
            <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, color: "#1a1a1a" }}>Facturé sur le bon</span>
            <span style={{ display: "block", fontSize: 11.5, color: MUTED, marginTop: 2 }}>Décochez si la ligne ne compte pas dans le total du bon : rien ne sera réclamé.</span>
          </span>
          <span aria-hidden style={{ width: 42, height: 24, borderRadius: 12, background: facture ? "#1a1a1a" : "#d6cfc2", position: "relative", flexShrink: 0, transition: "background .15s" }}>
            <span style={{ position: "absolute", top: 3, left: facture ? 21 : 3, width: 18, height: 18, borderRadius: 9, background: "#fff", transition: "left .15s" }} />
          </span>
        </button>
      )}
      <label style={{ display: "block", marginTop: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>Commentaire (facultatif)</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Carton écrasé, DLC dépassée…" rows={2} style={{ ...CHAMP, height: "auto", padding: "10px 12px", resize: "vertical", fontSize: 13.5 }} />
      </label>

      <div style={{ marginTop: 14, padding: "10px 12px", borderRadius: 10, background: erreur ? "rgba(183,121,31,0.10)" : "#f7f3ec", fontSize: 13, color: erreur ? "#8a5a10" : "#1a1a1a", lineHeight: 1.45 }}>
        {erreur ? erreur : (
          <>
            {etat === "prix"
              ? <div>Tout entre en stock ({qte(ligne.quantite)} {unite(ligne, ligne.quantite)}).</div>
              : <div>{enStock > 0 ? <>Entre en stock : <strong>{qte(enStock)} {unite(ligne, enStock)}</strong> sur {qte(ligne.quantite)}.</> : "Rien de cette ligne n'entre en stock."}</div>}
            <div style={{ fontWeight: 700 }}>À réclamer : {montant > 0 ? `${eur(montant)} HT` : ligne.prix_unitaire_ht == null ? "prix inconnu" : "rien"}</div>
          </>
        )}
      </div>

      <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
        <button type="button" disabled={!!erreur} onClick={() => onEnregistrer({ etat_reception: etat, qty_received: demandeQte ? num(qteRecue) : etat === "prix" || etat === "recu" ? ligne.quantite : 0, prix_recu: etat === "prix" ? num(prixRecu) : null, facture_sur_bon: etat === "prix" ? true : facture, reception_note: note.trim() || null })}
          style={{ ...BTN, height: 44, background: erreur ? "#c9c2b4" : "#1a1a1a", color: "#fff", border: "none", fontWeight: 700, fontSize: 14, cursor: erreur ? "not-allowed" : "pointer" }}>Enregistrer le signalement</button>
        <button type="button" onClick={onFermer} style={{ ...BTN, height: 40 }}>Annuler</button>
      </div>
    </Feuille>
  );
}
