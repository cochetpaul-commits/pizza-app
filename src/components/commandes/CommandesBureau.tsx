"use client";

import React, { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { VoletDroit } from "@/components/produits/BaseProduits";
import { OSWALD } from "@/components/TuileProduit";

/**
 * Commandes, présentation bureau (09/10/2026, maquette validée) : compteurs détaillés, puis un tableau plat
 * des commandes (brouillons, à recevoir, historique récent) ou, au choix, trois accordéons colorés ;
 * un clic sur une ligne ouvre la commande dans le volet de droite avec ses articles et les actions de
 * son statut. L'éditeur de commande (choix des produits, quantités) reste la page actuelle, ouverte
 * par « Ouvrir la commande ». La version téléphone n'est pas touchée.
 */

export type CommandeLigne = {
  id: string;
  supplier_id?: string;
  supplier_name: string;
  status: string;
  created_at: string;
  nb_articles?: number;
  total_ht: number;
  email_sent_at?: string | null;
};
export type ArticleCommande = { id: string; name: string; quantite: number; unite: string; total_ligne_ht: number | null };
type Section = "en_cours" | "a_recevoir" | "historique";

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const BRUN = "#A0845C";
const VERT = "#4a6741";
const GRIS = "#939597";
const TH_PLAT: CSSProperties = { textAlign: "left", fontSize: 12.5, color: "#1a1a1a", padding: "12px 16px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" };
const TD_PLAT: CSSProperties = { padding: "12px 16px", borderBottom: `1px solid ${BORD}`, verticalAlign: "middle", fontSize: 13 };
/** Tableaux dans les accordéons (maquette) : en-tête en petites capitales discrètes, lignes plus serrées */
const TH_SEC: CSSProperties = { ...{ textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: FAIBLE, padding: "8px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 600, whiteSpace: "nowrap" } };
const TD_SEC: CSSProperties = { padding: "10px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13 };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const PETIT: CSSProperties = { fontSize: 12, fontWeight: 600, padding: "5px 10px", borderRadius: 8, border: `1px solid ${BORD}`, background: "#fff", cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };

const euros = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const nombre = (n: number) => n.toLocaleString("fr-FR");

// Affichage plat ou par section, mémorisé sur l'appareil (même mécanique que la Base produits)
const CLE = "commandes:affichage";
const abonnes = new Set<() => void>();
const lire = (): "plat" | "sections" => { try { return localStorage.getItem(CLE) === "sections" ? "sections" : "plat"; } catch { return "plat"; } };
const ecrire = (v: "plat" | "sections") => { try { localStorage.setItem(CLE, v); } catch { /* navigation privée */ } abonnes.forEach((f) => f()); };
const abonner = (f: () => void) => { abonnes.add(f); return () => { abonnes.delete(f); }; };

function Chip({ fond, couleur, children }: { fond: string; couleur: string; children: ReactNode }) {
  return <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, whiteSpace: "nowrap", background: fond, color: couleur }}>{children}</span>;
}

function Tuile({ libelle, valeur, sous, couleur }: { libelle: string; valeur: string; sous: string; couleur?: string }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, padding: "12px 14px", display: "grid", gap: 2, minWidth: 0 }}>
      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{libelle}</span>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: couleur ?? "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{valeur}</span>
      <span style={{ fontSize: 11.5, color: MUTED, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sous}</span>
    </div>
  );
}

export type CommandesBureauProps = {
  accent: string;
  /** Brouillons et commandes en attente de validation */
  enCours: CommandeLigne[];
  /** Validées / envoyées, pas encore reçues */
  aRecevoir: CommandeLigne[];
  /** Reçues et annulées récentes */
  recentes: CommandeLigne[];
  articles: Record<string, ArticleCommande[] | "loading">;
  chargerArticles: (id: string) => void;
  couleurFournisseur: (nom: string) => string;
  libelleStatut: Record<string, string>;
  couleurStatut: Record<string, string>;
  fmtDate: (iso: string) => string;
  peutEnvoyer: (supplierId: string | null | undefined) => boolean;
  saving: boolean;
  sendingEmail: boolean;
  onCommander: () => void;
  onOuvrir: (c: CommandeLigne) => void;
  onPdf: (c: CommandeLigne) => void;
  onEnvoyer: (c: CommandeLigne) => void;
  onValider: (c: CommandeLigne) => void;
  onSupprimer: (c: CommandeLigne) => void;
  onModifier: (c: CommandeLigne) => void;
  onRenvoyer: (c: CommandeLigne) => void;
  onPointer: (c: CommandeLigne) => void;
};

export function CommandesBureau(p: CommandesBureauProps) {
  const affichage = useSyncExternalStore(abonner, lire, () => "plat" as const);
  const [ouverteId, setOuverteId] = useState<string | null>(null);
  const [sectionsFermees, setSectionsFermees] = useState<Set<Section>>(() => new Set(["historique"]));

  const section = (c: CommandeLigne): Section =>
    p.enCours.some((x) => x.id === c.id) ? "en_cours" : p.aRecevoir.some((x) => x.id === c.id) ? "a_recevoir" : "historique";
  const toutes = useMemo(
    () => [...p.enCours, ...p.aRecevoir, ...p.recentes].sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [p.enCours, p.aRecevoir, p.recentes],
  );
  // La commande ouverte suit la liste (statut changé, supprimée) : on ne garde que son id
  const ouverte = useMemo(() => (ouverteId ? toutes.find((c) => c.id === ouverteId) ?? null : null), [toutes, ouverteId]);
  const chargerArticles = p.chargerArticles;
  useEffect(() => { if (ouverte?.id) chargerArticles(ouverte.id); }, [ouverte?.id, chargerArticles]);

  const debutMois = new Date(); debutMois.setDate(1); debutMois.setHours(0, 0, 0, 0);
  const recuesMois = p.recentes.filter((c) => c.status === "recue" && new Date(c.created_at) >= debutMois);
  const brouillons = p.enCours.filter((c) => c.status === "brouillon");
  const enAttente = p.enCours.filter((c) => c.status === "en_attente");
  const noms = (l: CommandeLigne[]) => l.map((c) => c.supplier_name).join(", ");

  const statut = (c: CommandeLigne) => {
    const s = section(c);
    if (s === "a_recevoir") return <Chip fond="rgba(74,103,65,0.12)" couleur={VERT}>{c.email_sent_at ? "Envoyée" : "Validée · à envoyer"}</Chip>;
    const couleur = p.couleurStatut[c.status] ?? GRIS;
    return <Chip fond={`${couleur}1f`} couleur={couleur}>{p.libelleStatut[c.status] ?? c.status}</Chip>;
  };
  const actionLigne = (c: CommandeLigne) => {
    const s = section(c);
    if (s === "en_cours") return c.supplier_id ? <button type="button" style={PETIT} onClick={(e) => { e.stopPropagation(); p.onOuvrir(c); }}>Ouvrir</button> : null;
    if (s === "a_recevoir") return <button type="button" disabled={p.saving} style={{ ...PETIT, background: VERT, color: "#fff", borderColor: VERT, fontWeight: 700 }} onClick={(e) => { e.stopPropagation(); p.onPointer(c); }}>Pointer</button>;
    return <button type="button" style={PETIT} onClick={(e) => { e.stopPropagation(); p.onPdf(c); }}>PDF</button>;
  };
  const ligne = (c: CommandeLigne, enSection = false) => { const TD = enSection ? TD_SEC : TD_PLAT; return (
    <tr key={c.id} className={`cb-ligne${ouverte?.id === c.id ? " on" : ""}`} onClick={() => setOuverteId(c.id)} style={{ cursor: "pointer" }}>
      <td style={TD}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 600 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: p.couleurFournisseur(c.supplier_name), flexShrink: 0 }} />
          {c.supplier_name}
        </span>
      </td>
      <td style={TD}>{statut(c)}</td>
      <td style={{ ...TD, color: MUTED }}>{p.fmtDate(c.created_at)}</td>
      <td style={{ ...TD, color: MUTED }}>{c.nb_articles != null ? `${c.nb_articles} article${c.nb_articles > 1 ? "s" : ""}` : "—"}</td>
      <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: c.total_ht > 0 ? "#1a1a1a" : FAIBLE }}>{c.total_ht > 0 ? euros(c.total_ht) : "—"}</td>
      <td style={{ ...TD, color: MUTED, fontSize: 12.5 }}>{section(c) === "a_recevoir" ? (c.email_sent_at ? "✓ envoyée par mail" : "à envoyer") : ""}</td>
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{actionLigne(c)}</td>
    </tr>
  ); };
  const tableau = (liste: CommandeLigne[], vide: string, enSection = false) => { const TH = enSection ? TH_SEC : TH_PLAT; const TD = enSection ? TD_SEC : TD_PLAT; return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
        <thead><tr>
          <th style={TH}>Fournisseur</th><th style={TH}>Statut</th><th style={TH}>Créée</th><th style={TH}>Articles</th>
          <th style={{ ...TH, textAlign: "right" }}>Total HT</th><th style={TH}>Envoi</th><th style={TH} />
        </tr></thead>
        <tbody>
          {liste.map((c) => ligne(c, enSection))}
          {liste.length === 0 && <tr><td style={{ ...TD, padding: "28px 16px", textAlign: "center", color: "#999" }} colSpan={7}>{vide}</td></tr>}
        </tbody>
      </table>
    </div>
  ); };
  const barre = (s: Section, titre: string, couleur: string, n: number) => {
    const fermee = sectionsFermees.has(s);
    return (
      <button className={`barre-categorie${fermee ? "" : " ouverte"}`} type="button" aria-expanded={!fermee}
        onClick={() => setSectionsFermees((prev) => { const next = new Set(prev); if (next.has(s)) next.delete(s); else next.add(s); return next; })}
        style={{ width: "100%", minHeight: 46, display: "flex", alignItems: "center", gap: 12, padding: "0 16px", border: "none", cursor: "pointer", textAlign: "left", fontFamily: "inherit", color: "#fff", borderRadius: fermee ? 14 : "14px 14px 0 0", background: `linear-gradient(90deg, ${couleur} 0%, ${couleur}cc 100%)` }}>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em" }}>{titre}</span>
        <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, opacity: 0.7, marginLeft: -4, flex: 1 }}>{n}</span>
        <span style={{ fontSize: 12, opacity: 0.85, transform: fermee ? "none" : "rotate(180deg)", transition: "transform .15s" }}>▼</span>
      </button>
    );
  };
  const sections: { s: Section; titre: string; couleur: string; liste: CommandeLigne[]; vide: string }[] = [
    { s: "en_cours", titre: "Commandes en cours", couleur: BRUN, liste: p.enCours, vide: "Aucune commande en cours." },
    { s: "a_recevoir", titre: "Réceptions en attente", couleur: VERT, liste: p.aRecevoir, vide: "Rien à recevoir." },
    { s: "historique", titre: "Historique récent", couleur: GRIS, liste: p.recentes, vide: "Aucune commande reçue récemment." },
  ];

  // ── Volet ──
  const sectionOuverte = ouverte ? section(ouverte) : null;
  const etapes = ["Brouillon", "Validée", "Envoyée", "Reçue"];
  const etapeCourante = !ouverte ? -1 : ouverte.status === "recue" ? 3 : sectionOuverte === "a_recevoir" ? (ouverte.email_sent_at ? 2 : 1) : ouverte.status === "annulee" ? -1 : 0;
  const lignesOuverte = ouverte ? p.articles[ouverte.id] : undefined;
  const pied = ouverte && (
    <>
      {sectionOuverte === "en_cours" && (
        <button type="button" disabled={p.saving} onClick={() => p.onSupprimer(ouverte)} style={{ border: "none", background: "transparent", color: "#b4443a", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}>Supprimer</button>
      )}
      <button type="button" onClick={() => p.onPdf(ouverte)} style={{ ...BTN, marginLeft: sectionOuverte === "en_cours" ? 0 : "auto" }}>Aperçu PDF</button>
      {sectionOuverte === "en_cours" && ouverte.status === "brouillon" && p.peutEnvoyer(ouverte.supplier_id) && (
        <button type="button" disabled={p.sendingEmail} onClick={() => p.onEnvoyer(ouverte)} style={{ ...BTN, opacity: p.sendingEmail ? 0.6 : 1 }}>{p.sendingEmail ? "Envoi…" : "Envoyer par mail"}</button>
      )}
      {sectionOuverte === "en_cours" && (
        <>
          {p.peutEnvoyer(ouverte.supplier_id) && <button type="button" disabled={p.saving} onClick={() => p.onValider(ouverte)} style={{ ...BTN, marginLeft: "auto", color: VERT, borderColor: VERT }}>Valider</button>}
          {ouverte.supplier_id && <button type="button" onClick={() => p.onOuvrir(ouverte)} style={{ ...BTN, background: "#1a1a1a", color: "#f2ede4", border: "none", fontWeight: 700 }}>Ouvrir la commande</button>}
        </>
      )}
      {sectionOuverte === "a_recevoir" && (
        <>
          {p.peutEnvoyer(ouverte.supplier_id) && <button type="button" disabled={p.saving} onClick={() => p.onModifier(ouverte)} style={BTN}>Modifier</button>}
          {p.peutEnvoyer(ouverte.supplier_id) && <button type="button" disabled={p.sendingEmail || p.saving} onClick={() => p.onRenvoyer(ouverte)} style={{ ...BTN, opacity: p.sendingEmail ? 0.6 : 1 }}>{p.sendingEmail ? "Envoi…" : ouverte.email_sent_at ? "Renvoyer" : "Envoyer"}</button>}
          <button type="button" disabled={p.saving} onClick={() => p.onPointer(ouverte)} style={{ ...BTN, background: VERT, color: "#fff", border: "none", fontWeight: 700 }}>Pointer la réception</button>
        </>
      )}
    </>
  );

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <style>{`.cb-ligne:hover td { background: #f7f3ec; } .cb-ligne.on td { background: rgba(212,119,90,0.08); }.cb-ligne:last-child td{border-bottom:0}`}</style>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Commandes</h1>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Brouillons, envois et réceptions, par fournisseur.</div>
        </div>
        <button type="button" onClick={p.onCommander} style={{ ...BTN, background: p.accent, color: "#fff", border: "none", fontWeight: 700 }}>+ Commander</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <Tuile libelle="Brouillons" valeur={nombre(brouillons.length)} couleur={brouillons.length ? BRUN : FAIBLE} sous={brouillons.length ? noms(brouillons) : "aucun brouillon"} />
        <Tuile libelle="En attente de validation" valeur={nombre(enAttente.length)} couleur={enAttente.length ? "#2563EB" : FAIBLE} sous={enAttente.length ? noms(enAttente) : "aucune commande d'équipier à valider"} />
        <Tuile libelle="À recevoir" valeur={nombre(p.aRecevoir.length)} couleur={p.aRecevoir.length ? VERT : FAIBLE} sous={p.aRecevoir.length ? p.aRecevoir.map((c) => `${c.supplier_name} ${euros(c.total_ht)}`).join(" · ") : "rien en attente de livraison"} />
        <Tuile libelle="Reçues ce mois" valeur={euros(recuesMois.reduce((t, c) => t + c.total_ht, 0))} couleur={recuesMois.length ? "#16a34a" : FAIBLE} sous={`${recuesMois.length} commande${recuesMois.length > 1 ? "s" : ""} depuis le 1er du mois`} />
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ color: MUTED, fontSize: 12.5 }}>{nombre(toutes.length)} commande{toutes.length > 1 ? "s" : ""}</span>
        <span style={{ marginLeft: "auto", display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3 }}>
          {(["plat", "sections"] as const).map((v) => (
            <button key={v} type="button" onClick={() => ecrire(v)} aria-pressed={affichage === v} style={{
              border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
              background: affichage === v ? "#fff" : "transparent", color: affichage === v ? "#1a1a1a" : MUTED, boxShadow: affichage === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
            }}>{v === "plat" ? "Toutes" : "Par étape"}</button>
          ))}
        </span>
      </div>

      {affichage === "plat" ? (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" }}>
          {tableau(toutes, "Aucune commande. Cliquez sur « Commander » pour en créer une.")}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {sections.map(({ s, titre, couleur, liste, vide }) => (
            <div key={s}>
              {barre(s, titre, couleur, liste.length)}
              {!sectionsFermees.has(s) && (
                <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>{tableau(liste, vide, true)}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {ouverte && (
        <VoletDroit
          titre={`${ouverte.supplier_name} · ${(sectionOuverte === "a_recevoir" ? "à recevoir" : (p.libelleStatut[ouverte.status] ?? ouverte.status)).toLowerCase()}`}
          sousTitre={`Créée le ${p.fmtDate(ouverte.created_at)}${ouverte.nb_articles != null ? ` · ${ouverte.nb_articles} article${ouverte.nb_articles > 1 ? "s" : ""}` : ""}${ouverte.total_ht > 0 ? ` · ${euros(ouverte.total_ht)} HT` : ""}`}
          onFermer={() => setOuverteId(null)}
          pied={pied}
        >
          <div style={{ display: "flex", marginBottom: 14 }}>
            {etapes.map((e, i) => (
              <span key={e} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, padding: "6px 4px", borderTop: `3px solid ${i === etapeCourante ? p.accent : i < etapeCourante ? VERT : BORD}`, color: i === etapeCourante ? p.accent : i < etapeCourante ? VERT : FAIBLE }}>{e}</span>
            ))}
          </div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: MUTED, marginBottom: 8 }}>Articles</div>
          {!lignesOuverte || lignesOuverte === "loading" ? (
            <div style={{ fontSize: 12.5, color: "#999" }}>Chargement…</div>
          ) : lignesOuverte.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#999" }}>Aucun article. « Ouvrir la commande » pour en ajouter.</div>
          ) : (
            <div>
              {lignesOuverte.map((l) => (
                <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px", gap: 8, alignItems: "center", padding: "7px 0", borderBottom: "1px solid #ece6db", fontSize: 13 }}>
                  <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                  <span style={{ textAlign: "right", color: MUTED, fontVariantNumeric: "tabular-nums" }}>{l.quantite} {l.unite}</span>
                  <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{l.total_ligne_ht != null ? euros(l.total_ligne_ht) : "—"}</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, paddingTop: 10 }}>
                <span>Total HT</span><span>{ouverte.total_ht > 0 ? euros(ouverte.total_ht) : "—"}</span>
              </div>
            </div>
          )}
          {sectionOuverte === "a_recevoir" && (
            <div style={{ fontSize: 12.5, color: MUTED, marginTop: 14 }}>{ouverte.email_sent_at ? `Envoyée par mail le ${p.fmtDate(ouverte.email_sent_at)}.` : "Validée, pas encore envoyée au fournisseur."}</div>
          )}
        </VoletDroit>
      )}
    </div>
  );
}
