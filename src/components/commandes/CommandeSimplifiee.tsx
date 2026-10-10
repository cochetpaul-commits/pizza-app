"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { fetchApi } from "@/lib/fetchApi";
import { useBureau, useLarge } from "@/hooks/useBureau";
import { SEUIL_HABITUEL } from "@/lib/commandeHabituels";
import { libelleZone, nomUnite, quantiteAffichee, type UniteCommande, type UniteTaille } from "@/lib/commandeArticles";

/**
 * Écran de commande simplifié (fournisseurs avec suppliers.commande_simplifiee, Maël d'abord).
 * Pensé pour le téléphone : les habituels de l'établissement rangés par rayon ; le gros bouton
 * ajoute 1 unité de commande, − / + ajustent la part de la personne connectée. L'équipe commande
 * par petits bouts plusieurs fois par jour : la quantité habituelle (médiane par livraison) n'est qu'indiquée.
 * Habituel = au moins SEUIL_HABITUEL jours d'achat sur 90 jours ; le reste passe par la recherche.
 * Les produits de précommande restent commandables (réassort en semaine) : le flag ne sert qu'au mercredi.
 * Rayons repliés, sauf ceux qui ont déjà un produit dans le brouillon ; un appui ouvre ou ferme.
 * Plusieurs personnes remplissent le même brouillon ; le détail par personne est affiché.
 */

type Mode = "uc" | "element";
type Habituel = { nb_achats: number; quantite: number; mode: Mode; derniere: string };
type Article = {
  ingredient_id: string;
  nom: string;
  rayon: string | null;
  precommande: boolean;
  au_poids: boolean;
  unite_commande: UniteCommande;
  contenu_nb: number;
  /** Type d'élément dans le colis (pot, bouteille, barquette…) : la cuisine compte à la pièce */
  element: UniteCommande | null;
  element_qte: number | null;
  element_unite: UniteTaille | null;
  /** Emplacements de stockage (principal d'abord), avec la couleur de la zone */
  zones: { nom: string; couleur: string | null }[];
  /** Stock idéal (inventaire), en éléments ; null si non renseigné */
  stock_objectif: number | null;
  unite_uc: string;
  unite_element: string | null;
  prix_uc: number | null;
  prix_element: number | null;
  ref: string | null;
  habituel: Habituel | null;
  /** Quantité dans la dernière commande envoyée (fournisseurs réglés sur « derniere_commande ») */
  derniere: { quantite: number; mode: Mode } | null;
};
type Apport = { user_id: string; nom: string; quantite: number };
type Ligne = { ingredient_id: string; unite: string | null; quantite: number; apports: Apport[] };
type Onglet = "jour" | "precommande";
type Donnees = {
  fournisseur: { id: string; nom: string };
  type: Onglet;
  /** Des produits sont cochés « précommande » chez ce fournisseur (Bello Mio) : onglets affichés */
  a_precommande: boolean;
  indication: "habitude" | "derniere_commande";
  moi: string;
  rayons: { code: string; libelle: string; ordre: number }[];
  articles: Article[];
  session: { id: string; status: string } | null;
  lignes: Ligne[];
};

const ACCENT = "#D4775A";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const euros = (n: number) => n.toFixed(2).replace(".", ",") + " €";
const qteTexte = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** Couleur du titre de rayon : partagée avec l'inventaire (src/lib/rayons.ts) */
import { couleurRayon } from "@/lib/rayons";
import { styleBarreCategorie, styleChevronBarre, stylePastilleBarre, styleTitreCategorie } from "@/lib/styleCategories";
import { BoutonCrayon, Compteur } from "@/components/TuileProduit";
import { CelluleProduit, TableauMobile } from "@/components/ui/TableauMobile";

/**
 * Aller-retour vers la fiche produit (admins, managers) : l'état de l'écran est gardé le temps de corriger
 * la fiche (onglet, rayons ouverts, recherche, défilement), puis restauré au retour sur ce fournisseur.
 */
const CLE_RETOUR = "commande-simplifiee:retour";

type EtatRetour = { supplierId: string; onglet: Onglet; bascules: Record<string, boolean>; recherche: string; y: number; t: number };
function lireRetour(supplierId: string): EtatRetour | null {
  try {
    const e = JSON.parse(sessionStorage.getItem(CLE_RETOUR) ?? "null") as EtatRetour | null;
    return e && e.supplierId === supplierId && Date.now() - e.t < 30 * 60 * 1000 ? e : null;
  } catch { return null; }
}


export function CommandeSimplifiee({ supplierId, onChange, onNbArticles, onEnvoyer, onOngletChange }: {
  supplierId: string;
  /** Le brouillon apparaît ou se vide : la page met à jour sa session en arrière-plan (sans recharger l'écran) */
  onChange?: () => void;
  /** Nombre de produits dans le brouillon affiché (barre du bas de la page) */
  onNbArticles?: (nb: number) => void;
  /** Envoi de la précommande (écran de confirmation de la page) */
  onEnvoyer?: (sessionId: string) => void;
  /** La page masque ses boutons « Valider / Envoyer » (commande du jour) sur l'onglet Précommande */
  onOngletChange?: (onglet: Onglet) => void;
}) {
  const bureau = useBureau();
  const large = useLarge();
  // Commande du jour / précommande du mercredi : deux brouillons séparés
  const router = useRouter();
  const { canWrite: peutCorrigerFiche } = useProfile();
  /** État à restaurer en revenant de la fiche produit (lu une fois, au montage) */
  const [retour] = useState<EtatRetour | null>(() => (typeof window === "undefined" ? null : lireRetour(supplierId)));
  const [onglet, setOnglet] = useState<Onglet>(retour?.onglet ?? "jour");
  const ongletRef = useRef<Onglet>(retour?.onglet ?? "jour");
  useEffect(() => { ongletRef.current = onglet; onOngletChange?.(onglet); }, [onglet, onOngletChange]);
  const [data, setData] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState(retour?.recherche ?? "");
  const [modes, setModes] = useState<Record<string, Mode>>({});
  /** Message discret en cas d'échec d'enregistrement */
  const [alerte, setAlerte] = useState<string | null>(null);
  // Saisie : affichage immédiat, appuis rapides regroupés (400 ms), une requête par produit à la fois
  const dataRef = useRef<Donnees | null>(null);
  const voulues = useRef(new Map<string, { a: Article; m: Mode; qte: number }>());
  const confirmees = useRef(new Map<string, number>());
  const minuteries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const enVol = useRef(new Set<string>());
  const dernierVide = useRef<boolean | null>(null);
  /** Rayons ouverts ou fermés à la main (sinon : ouverts s'ils ont un produit dans le brouillon) */
  const [bascules, setBascules] = useState<Record<string, boolean>>(retour?.bascules ?? {});

  const charger = useCallback(async (): Promise<Donnees | null> => {
    try {
      const res = await fetchApi(`/api/commandes/simplifiee?supplier_id=${encodeURIComponent(supplierId)}&type=${onglet}`);
      const json = await res.json();
      if (!res.ok) { setErreur(json.error ?? "Erreur de chargement"); return null; }
      setErreur(null);
      const d = json as Donnees;
      confirmees.current = new Map();
      for (const l of d.lignes) for (const p of l.apports) if (p.user_id === d.moi) confirmees.current.set(`${l.ingredient_id}|${l.unite}`, p.quantite);
      dernierVide.current = !d.session || !d.lignes.some((x) => x.quantite > 0);
      setData(d);
      return d;
    } catch {
      setErreur("Erreur de chargement");
      return null;
    }
  }, [supplierId, onglet]);

  useEffect(() => { void charger(); }, [charger]);

  // Retour de la fiche produit : même position de défilement, une fois la liste affichée
  const yARestaurer = useRef<number | null>(retour?.y ?? null);
  useEffect(() => {
    if (!data || yARestaurer.current == null) return;
    const y = yARestaurer.current;
    yARestaurer.current = null;
    try { sessionStorage.removeItem(CLE_RETOUR); } catch { /* navigation privée */ }
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, y)));
  }, [data]);

  const uniteDe = (a: Article, m: Mode) => (m === "element" ? a.unite_element ?? a.unite_uc : a.unite_uc);
  const modeDe = (a: Article): Mode => modes[a.ingredient_id] ?? (a.unite_element && a.habituel?.mode === "element" ? "element" : "uc");
  const ligneDe = useCallback((a: Article, m: Mode) => data?.lignes.find((l) => l.ingredient_id === a.ingredient_id && l.unite === (m === "element" ? a.unite_element : a.unite_uc)), [data]);

  const duJour = useMemo(() => data?.articles ?? [], [data]);
  const estHabituel = (a: Article) => (a.habituel?.nb_achats ?? 0) >= SEUIL_HABITUEL;
  const enCommande = useCallback((a: Article) => (data?.lignes ?? []).some((l) => l.ingredient_id === a.ingredient_id && l.quantite > 0), [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    // Précommande : les produits cochés, tous affichés (à 0 au départ) ; jour : habituels + déjà commandés.
    // Aucun habituel (fournisseur rare, historique court) : tous les articles, l'écran n'est jamais vide.
    const habituelsOuCommandes = duJour.filter((a) => estHabituel(a) || enCommande(a));
    const visibles = onglet === "precommande" || habituelsOuCommandes.length === 0 ? duJour : habituelsOuCommandes;
    return data.rayons
      .map((r) => ({
        ...r,
        articles: visibles
          .filter((a) => a.rayon === r.code)
          // D'abord les produits achetés ces 90 derniers jours, puis les autres ; chaque groupe par ordre
          // alphabétique sans accents ni casse (« Crème » / « Creme » ensemble, « Œuf » avec les O), comme le mail et le PDF
          .sort((x, y) => (Number((y.habituel?.nb_achats ?? 0) > 0) - Number((x.habituel?.nb_achats ?? 0) > 0))
            || x.nom.localeCompare(y.nom, "fr", { sensitivity: "base" })),
      }))
      .filter((r) => r.articles.length > 0)
      .map((r) => ({ ...r, dansCommande: r.articles.filter(enCommande).length }));
  }, [data, duJour, enCommande, onglet]);

  const resultats = useMemo(() => {
    const q = norm(recherche.trim());
    if (q.length < 2) return [];
    const mots = q.split(/\s+/);
    return duJour.filter((a) => { const n = norm(a.nom); return mots.every((m) => n.includes(m)); }).slice(0, 30);
  }, [recherche, duJour]);

  const resume = useMemo(() => {
    let nb = 0, total = 0, prixInconnu = false;
    for (const l of data?.lignes ?? []) {
      if (l.quantite <= 0) continue;
      nb += 1;
      const a = data!.articles.find((x) => x.ingredient_id === l.ingredient_id);
      const prix = a ? (l.unite === a.unite_element ? a.prix_element : a.prix_uc) : null;
      if (prix == null) prixInconnu = true; else total += prix * l.quantite;
    }
    return { nb, total, prixInconnu };
  }, [data]);

  useEffect(() => { dataRef.current = data; }, [data]);
  useEffect(() => { if (data) onNbArticles?.(resume.nb); }, [data, resume.nb, onNbArticles]);

  /** Donnees avec ma part fixée à qte sur la ligne (produit, unité) ; total de la ligne recalculé */
  const avecMaPart = (d: Donnees, ingredientId: string, unite: string, qte: number): Donnees => {
    const lignes = d.lignes.map((l) => ({ ...l, apports: [...l.apports] }));
    let l = lignes.find((x) => x.ingredient_id === ingredientId && x.unite === unite);
    if (!l) { l = { ingredient_id: ingredientId, unite, quantite: 0, apports: [] }; lignes.push(l); }
    const moi = l.apports.find((p) => p.user_id === d.moi);
    const autres = l.apports.filter((p) => p.user_id !== d.moi);
    l.apports = qte > 0 ? [...autres, { user_id: d.moi, nom: moi?.nom ?? "Moi", quantite: qte }] : autres;
    l.quantite = l.apports.reduce((t, p) => t + p.quantite, 0);
    return { ...d, lignes: lignes.filter((x) => x.quantite > 0) };
  };

  /** Envoie la quantité voulue pour ce produit ; si elle change pendant l'envoi, renvoie la dernière */
  const envoyer = useCallback(async (cle: string) => {
    if (enVol.current.has(cle)) return;
    const v = voulues.current.get(cle);
    if (!v) return;
    const unite = v.m === "element" ? v.a.unite_element ?? v.a.unite_uc : v.a.unite_uc;
    const ongletAppel = onglet;
    enVol.current.add(cle);
    let ok = false;
    try {
      const res = await fetchApi("/api/commandes/simplifiee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, ingredient_id: v.a.ingredient_id, mode: v.m, quantite: v.qte, type: ongletAppel }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Refus du serveur (commande validée entre-temps…) : on revient à la valeur enregistrée
        setAlerte(json.error ?? "Pas enregistré, réessaie");
      } else {
        ok = true;
        confirmees.current.set(`${v.a.ingredient_id}|${unite}`, v.qte);
        if (ongletRef.current !== ongletAppel) return; // l'autre onglet est affiché : rien à mettre à jour
        const encore = voulues.current.get(cle);
        const aJour = !encore || encore.qte === v.qte;
        if (aJour) voulues.current.delete(cle);
        setData((d) => {
          if (!d) return d;
          const session = json.session_id ? { id: json.session_id as string, status: d.session?.status ?? "brouillon" } : d.session;
          if (!aJour) return { ...d, session }; // un appui plus récent attend : on garde l'affichage
          const sans = d.lignes.filter((l) => !(l.ingredient_id === v.a.ingredient_id && l.unite === unite));
          return { ...d, session, lignes: json.ligne ? [...sans, json.ligne as Ligne] : sans };
        });
      }
    } catch {
      setAlerte("Pas enregistré, réessaie");
    } finally {
      enVol.current.delete(cle);
    }
    if (!ok) {
      voulues.current.delete(cle);
      const conf = confirmees.current.get(`${v.a.ingredient_id}|${unite}`) ?? 0;
      setData((d) => (d ? avecMaPart(d, v.a.ingredient_id, unite, conf) : d));
      setTimeout(() => setAlerte(null), 4000);
      return;
    }
    if (voulues.current.has(cle)) { void envoyer(cle); return; }
    // La page parente (boutons Valider / Envoyer) n'est rechargée que quand le brouillon apparaît ou se vide
    const d = dataRef.current;
    const vide = !d?.session || !(d.lignes ?? []).some((x) => x.quantite > 0);
    if (dernierVide.current !== null && vide !== dernierVide.current) onChange?.();
    dernierVide.current = vide;
  }, [supplierId, onChange, onglet]);

  /** Appui sur + / − / « + 1 » : affichage immédiat, enregistrement 400 ms après le dernier appui */
  function fixerMaPart(a: Article, m: Mode, nouvelle: number) {
    if (!data) return;
    const cle = `${a.ingredient_id}|${m}`;
    const unite = uniteDe(a, m);
    voulues.current.set(cle, { a, m, qte: nouvelle });
    setData((d) => (d ? avecMaPart(d, a.ingredient_id, unite, nouvelle) : d));
    const t = minuteries.current.get(cle);
    if (t) clearTimeout(t);
    minuteries.current.set(cle, setTimeout(() => { minuteries.current.delete(cle); void envoyer(cle); }, 400));
  }

  /** Fiche produit : les appuis en attente sont enregistrés d'abord, l'état de l'écran est gardé pour le retour */
  async function ouvrirFiche(a: Article) {
    const cles = [...minuteries.current.keys()];
    for (const cle of cles) { clearTimeout(minuteries.current.get(cle)); minuteries.current.delete(cle); }
    await Promise.all(cles.map((cle) => envoyer(cle)));
    for (let i = 0; i < 30 && (enVol.current.size > 0 || voulues.current.size > 0); i++) await new Promise((r) => setTimeout(r, 100));
    try {
      sessionStorage.setItem(CLE_RETOUR, JSON.stringify({ supplierId, onglet, bascules, recherche, y: window.scrollY, t: Date.now() } satisfies EtatRetour));
    } catch { /* navigation privée : retour en haut de la liste */ }
    // Le conditionnement de commande se règle sur la fiche (bloc « Commande & Stock ») : l'écran suit automatiquement
    router.push(`/ingredients?edit=${a.ingredient_id}&back=${encodeURIComponent(`/commandes?supplier_id=${supplierId}`)}`);
  }

  // En quittant l'écran, les appuis en attente partent tout de suite (jamais perdus)
  useEffect(() => () => {
    for (const [cle, t] of minuteries.current) { clearTimeout(t); void envoyer(cle); }
    minuteries.current.clear();
  }, [envoyer]);

  if (erreur) return <div style={{ padding: 16, color: "#8a2b2b", background: "#fbeaea", borderRadius: 12, fontSize: 14 }}>{erreur}</div>;
  if (!data) return <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14 }}>Chargement des produits…</div>;

  const brouillon = !data.session || data.session.status === "brouillon";
  const changerOnglet = (o: Onglet) => {
    if (o === onglet) return;
    voulues.current.clear();
    setBascules({});
    setRecherche("");
    setData(null);
    setOnglet(o);
  };
  const aEnvoyer = onglet === "precommande" && brouillon && !!data.session && data.lignes.some((l) => l.quantite > 0);

  /** Téléphone (10/10/2026) : même tableau que le bureau en trois colonnes — nom + conditionnement · prix · repère, quantité à droite */
  function ligneMobile(a: Article, couleur: string = ACCENT) {
    const m = modeDe(a);
    const l = ligneDe(a, m);
    const total = l?.quantite ?? 0;
    const maPart = l?.apports.find((p) => p.user_id === data!.moi)?.quantite ?? 0;
    const pas = m === "uc" && a.au_poids ? 0.5 : 1;
    const prix = m === "element" ? a.prix_element : a.prix_uc;
    const unite = uniteDe(a, m);
    const autreMode: Mode = m === "uc" ? "element" : "uc";
    const autreLigne = a.unite_element ? ligneDe(a, autreMode) : undefined;
    const detail = l && l.apports.length > 0 && (l.apports.length > 1 || l.apports[0].user_id !== data!.moi)
      ? l.apports.map((p) => `${p.user_id === data!.moi ? "moi" : p.nom} ${qteTexte(p.quantite)}`).join(" · ")
      : null;
    const indication = data!.indication === "derniere_commande"
      ? (a.derniere ? `Dernière commande : ${quantiteAffichee(a, a.derniere.quantite, a.derniere.mode)}` : null)
      : (estHabituel(a) && a.habituel ? `D'habitude : ${quantiteAffichee(a, a.habituel.quantite, a.habituel.mode)} par livraison` : null);
    const TD: React.CSSProperties = { padding: "9px 6px 9px 10px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, background: total > 0 ? "rgba(212,119,90,0.08)" : undefined };
    const pilule = (actif: boolean): React.CSSProperties => ({
      padding: "3px 8px", borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: "pointer", lineHeight: 1.2, fontFamily: "inherit",
      border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#f7f3ec", color: actif ? ACCENT : "#8a8378",
    });
    return (
      <tr key={a.ingredient_id}>
        <td style={{ ...TD, padding: 0, width: 4, background: couleur }} />
        <CelluleProduit style={{ ...TD, paddingRight: 4 }} titre={a.nom} droite={
          <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
            {brouillon ? (total === 0 ? (
              <button type="button" aria-label={`Ajouter ${a.nom}`} onClick={() => fixerMaPart(a, m, 1)} style={{
                height: 36, minWidth: 60, padding: "0 14px", borderRadius: 18, border: "none", background: ACCENT, color: "#fff", fontSize: 15, fontWeight: 700,
                cursor: "pointer", touchAction: "manipulation", fontFamily: "inherit",
              }}>+ 1</button>
            ) : (
              <Compteur valeur={qteTexte(total)} moinsActif={maPart > 0}
                onMoins={() => fixerMaPart(a, m, Math.max(0, Math.round((maPart - pas) * 2) / 2))}
                onPlus={() => fixerMaPart(a, m, Math.round((maPart + pas) * 2) / 2)} />
            )) : <span style={{ fontWeight: 700 }}>{total > 0 ? qteTexte(total) : "—"}</span>}
            {total > 0 && prix != null && <span style={{ fontSize: 11.5, fontWeight: 700, color: "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{euros(total * prix)}</span>}
          </div>
        }>
          <div style={{ fontSize: 11.5, color: "#6f6656" }}>
            {unite}{prix != null ? ` · ${euros(prix)} HT` : ""}{a.ref ? ` · réf. ${a.ref}` : ""}
            {a.zones.length > 0 && <span style={{ display: "inline-flex", gap: 4, marginLeft: 6, verticalAlign: "middle" }}>{a.zones.map((z) => <span key={z.nom} className="pastille" style={{ "--pastille-c": z.couleur ?? "#8a8378" } as React.CSSProperties}>{libelleZone(z.nom)}</span>)}</span>}
          </div>
          {(indication || a.stock_objectif != null) && (
            <div style={{ fontSize: 11.5, color: ACCENT, marginTop: 2 }}>
              {indication}{indication && a.stock_objectif != null ? " · " : ""}{a.stock_objectif != null && <span style={{ color: "#6f6656" }}>stock idéal {quantiteAffichee(a, a.stock_objectif, a.contenu_nb > 1 ? "element" : "uc")}</span>}
            </div>
          )}
          {total > 0 && !a.au_poids && a.contenu_nb > 1 && <div style={{ fontSize: 11.5, color: "#1a1a1a", fontWeight: 700, marginTop: 2 }}>En cours : {quantiteAffichee(a, total, m)}</div>}
          {(detail || (autreLigne && autreLigne.quantite > 0)) && (
            <div style={{ fontSize: 11.5, color: "#6f6656", marginTop: 2 }}>{detail}{autreLigne && autreLigne.quantite > 0 && <>{detail ? " — " : ""}aussi {quantiteAffichee(a, autreLigne.quantite, autreMode)}</>}</div>
          )}
          {a.unite_element && brouillon && (
            <span style={{ display: "inline-flex", gap: 4, marginTop: 5 }}>
              {(["uc", "element"] as Mode[]).map((x) => (
                <button key={x} type="button" onClick={() => setModes((st) => ({ ...st, [a.ingredient_id]: x }))} style={pilule(m === x)}>
                  Par {x === "element" ? a.unite_element : a.contenu_nb > 1 && a.element ? `${nomUnite(a.unite_commande)} de ${qteTexte(a.contenu_nb)}` : a.unite_uc}
                </button>
              ))}
            </span>
          )}
        </CelluleProduit>
        <td style={{ ...TD, padding: "9px 8px 9px 2px", width: 30, textAlign: "right" }}>
          {peutCorrigerFiche && <BoutonCrayon onClick={() => void ouvrirFiche(a)} title="Ouvrir la fiche produit" />}
        </td>
      </tr>
    );
  }

  /** Bureau : une ligne de tableau par article, tout sur une ligne (gabarit Base produits) */
  function ligne(a: Article, couleur: string = ACCENT) {
    const m = modeDe(a);
    const l = ligneDe(a, m);
    const total = l?.quantite ?? 0;
    const maPart = l?.apports.find((p) => p.user_id === data!.moi)?.quantite ?? 0;
    const pas = m === "uc" && a.au_poids ? 0.5 : 1;
    const prix = m === "element" ? a.prix_element : a.prix_uc;
    const unite = uniteDe(a, m);
    const autreMode: Mode = m === "uc" ? "element" : "uc";
    const autreLigne = a.unite_element ? ligneDe(a, autreMode) : undefined;
    const detail = l && l.apports.length > 0 && (l.apports.length > 1 || l.apports[0].user_id !== data!.moi)
      ? l.apports.map((p) => `${p.user_id === data!.moi ? "moi" : p.nom} ${qteTexte(p.quantite)}`).join(" · ")
      : null;
    const indication = data!.indication === "derniere_commande"
      ? (a.derniere ? `Dernière commande : ${quantiteAffichee(a, a.derniere.quantite, a.derniere.mode)}` : null)
      : (estHabituel(a) && a.habituel ? `D'habitude : ${quantiteAffichee(a, a.habituel.quantite, a.habituel.mode)} par livraison` : null);
    const TD: React.CSSProperties = { padding: "9px 14px", borderBottom: "1px solid #f0ebe2", verticalAlign: "middle", fontSize: 13, whiteSpace: "nowrap", background: total > 0 ? "rgba(212,119,90,0.08)" : undefined };
    const pilule = (actif: boolean): React.CSSProperties => ({
      padding: "4px 9px", borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: "pointer", lineHeight: 1.2, fontFamily: "inherit",
      border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#f7f3ec", color: actif ? ACCENT : "#8a8378",
    });
    return (
      <tr key={a.ingredient_id}>
        <td style={{ ...TD, padding: 0, width: 4, background: couleur }} />
        <td style={{ ...TD, fontWeight: 600, color: "#1a1a1a", whiteSpace: "normal", minWidth: 220 }}>
          {a.nom}
          {total > 0 && !a.au_poids && a.contenu_nb > 1 && <div style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 700 }}>En cours : {quantiteAffichee(a, total, m)}</div>}
          {(detail || (autreLigne && autreLigne.quantite > 0)) && (
            <div style={{ fontSize: 12, color: "#6f6656", fontWeight: 400 }}>{detail}{autreLigne && autreLigne.quantite > 0 && <>{detail ? " — " : ""}aussi {quantiteAffichee(a, autreLigne.quantite, autreMode)}</>}</div>
          )}
        </td>
        <td style={{ ...TD, color: "#6f6656", fontSize: 12.5 }}>{unite}{a.ref ? <span style={{ color: "#a39d92" }}> · réf. {a.ref}</span> : null}</td>
        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: prix != null ? "#1a1a1a" : "#a39d92" }}>{prix != null ? `${euros(prix)} HT` : "—"}</td>
        <td style={TD}>
          <span style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {a.zones.map((z) => <span key={z.nom} className="pastille" style={{ "--pastille-c": z.couleur ?? "#8a8378" } as React.CSSProperties}>{libelleZone(z.nom)}</span>)}
          </span>
        </td>
        <td style={{ ...TD, fontSize: 12.5, color: ACCENT, whiteSpace: "normal", minWidth: 180 }}>
          {indication}
          {a.stock_objectif != null && <div style={{ color: "#6f6656" }}>Stock idéal : {quantiteAffichee(a, a.stock_objectif, a.contenu_nb > 1 ? "element" : "uc")}</div>}
        </td>
        <td style={TD}>
          {a.unite_element && brouillon ? (
            <span style={{ display: "inline-flex", gap: 4 }}>
              {(["uc", "element"] as Mode[]).map((x) => (
                <button key={x} type="button" onClick={() => setModes((st) => ({ ...st, [a.ingredient_id]: x }))} style={pilule(m === x)}>
                  Par {x === "element" ? a.unite_element : a.contenu_nb > 1 && a.element ? `${nomUnite(a.unite_commande)} de ${qteTexte(a.contenu_nb)}` : a.unite_uc}
                </button>
              ))}
            </span>
          ) : <span style={{ color: "#a39d92" }}>—</span>}
        </td>
        <td style={{ ...TD, textAlign: "right" }}>
          {brouillon ? (total === 0 ? (
            <button type="button" aria-label={`Ajouter ${a.nom}`} onClick={() => fixerMaPart(a, m, 1)} style={{
              height: 36, minWidth: 60, padding: "0 14px", borderRadius: 18, border: "none", background: ACCENT, color: "#fff", fontSize: 15, fontWeight: 700,
              cursor: "pointer", touchAction: "manipulation", fontFamily: "inherit",
            }}>+ 1</button>
          ) : (
            <span style={{ display: "inline-flex" }}>
              <Compteur valeur={qteTexte(total)} moinsActif={maPart > 0}
                onMoins={() => fixerMaPart(a, m, Math.max(0, Math.round((maPart - pas) * 2) / 2))}
                onPlus={() => fixerMaPart(a, m, Math.round((maPart + pas) * 2) / 2)} />
            </span>
          )) : <span style={{ fontWeight: 700 }}>{total > 0 ? qteTexte(total) : "—"}</span>}
        </td>
        <td style={{ ...TD, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700, color: total > 0 && prix != null ? "#1a1a1a" : "#a39d92" }}>
          {total > 0 && prix != null ? euros(total * prix) : "—"}
        </td>
        <td style={{ ...TD, textAlign: "right", width: 40 }}>
          {peutCorrigerFiche && <BoutonCrayon onClick={() => void ouvrirFiche(a)} title="Ouvrir la fiche produit" />}
        </td>
      </tr>
    );
  }

  function tableau(articles: Article[], couleur: string = ACCENT) {
    const TH: React.CSSProperties = { textAlign: "left", fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", color: "#a39d92", padding: "8px 14px", borderBottom: "1px solid #ddd6c8", fontWeight: 600, whiteSpace: "nowrap" };
    if (!large) return (
      <TableauMobile sansCadre colonnes={[{ libelle: "Produit" }, { libelle: "Quantité", align: "right", largeur: 132 }, { largeur: 30 }]}>
        {articles.map((a) => ligneMobile(a, couleur))}
      </TableauMobile>
    );
    return (
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 960 }}>
          <thead><tr>
            <th style={{ ...TH, padding: 0, width: 4 }} /><th style={TH}>Produit</th><th style={TH}>Conditionnement</th><th style={{ ...TH, textAlign: "right" }}>Prix</th>
            <th style={TH}>Zones</th><th style={TH}>Repère</th><th style={TH}>Unité</th><th style={{ ...TH, textAlign: "right" }}>Quantité</th><th style={{ ...TH, textAlign: "right" }}>Total HT</th><th style={TH} />
          </tr></thead>
          <tbody>{articles.map((a) => ligne(a, couleur))}</tbody>
        </table>
      </div>
    );
  }

  return (
    <div>
      {data.a_precommande && (
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#ece4d4", borderRadius: 14, marginBottom: 12 }}>
          {([["jour", "Commande du jour"], ["precommande", "Précommande du mercredi"]] as [Onglet, string][]).map(([o, libelle]) => (
            <button key={o} type="button" onClick={() => changerOnglet(o)} aria-pressed={onglet === o}
              style={{
                flex: 1, minHeight: 46, borderRadius: 11, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700,
                background: onglet === o ? "#fff" : "transparent", color: onglet === o ? "#1a1a1a" : "#8a8378",
                boxShadow: onglet === o ? "0 1px 4px rgba(0,0,0,0.08)" : "none", touchAction: "manipulation",
              }}>{libelle}</button>
          ))}
        </div>
      )}
      {onglet === "precommande" && (
        <div style={{ fontSize: 13, color: "#6f6656", marginBottom: 12 }}>
          À envoyer le mercredi avant midi : livraison le mercredi de la semaine suivante.
        </div>
      )}
      {alerte && (
        <div role="status" style={{
          position: "fixed", left: "50%", bottom: 96, transform: "translateX(-50%)", zIndex: 60,
          background: "#1a1a1a", color: "#fff", fontSize: 13, padding: "8px 14px", borderRadius: 20,
          boxShadow: "0 4px 14px rgba(0,0,0,0.2)", maxWidth: "90vw", textAlign: "center",
        }}>{alerte}</div>
      )}
      <div style={{
        background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", padding: "12px 14px", marginBottom: 12,
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <div style={{ fontSize: 14, color: "#1a1a1a" }}>
          <strong style={{ fontFamily: OSWALD, fontSize: 18 }}>{resume.nb}</strong> produit{resume.nb > 1 ? "s" : ""} dans la {onglet === "precommande" ? "précommande" : "commande"}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", whiteSpace: "nowrap" }}>
          {euros(resume.total)} HT{resume.prixInconnu ? " *" : ""}
        </div>
      </div>
      {!brouillon && (
        <div style={{ background: "#fbf0dc", borderRadius: 12, padding: "10px 12px", fontSize: 13, color: "#7a5a2b", marginBottom: 12 }}>
          Commande validée : repasse-la en brouillon pour la modifier.
        </div>
      )}

      {onglet === "jour" && <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={`Autre produit ${data.fournisseur.nom}…`}
        style={{
          width: "100%", height: 48, borderRadius: 12, border: "1.5px solid #ddd6c8", padding: "0 14px",
          fontSize: 16, background: "#fff", boxSizing: "border-box", marginBottom: 14, outline: "none",
        }}
      />}

      {onglet === "jour" && recherche.trim().length >= 2 ? (
        <div>
          {resultats.length === 0 && <div style={{ color: "#999", fontSize: 14, padding: 12 }}>Aucun produit trouvé.</div>}
          {resultats.length > 0 && <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 14, overflow: "hidden" }}>{tableau(resultats)}</div>}
        </div>
      ) : sections.length === 0 ? (
        <div style={{ color: "#999", fontSize: 14, padding: 12 }}>
          Aucun produit acheté au moins {SEUIL_HABITUEL} fois ces 90 derniers jours. Utilise la recherche pour ajouter un produit.
        </div>
      ) : (
        sections.map((r) => {
          const ouvert = bascules[r.code] ?? (onglet === "precommande" || r.dansCommande > 0);
          return (
            <div key={r.code} style={{ marginBottom: 10 }}>
              {/* Titre de rayon : fond plein, texte blanc ; collé en haut de l'écran tant que le rayon ouvert défile */}
              <div className={ouvert && !bureau ? "rayon-collant" : undefined} style={{ background: "#f2ede4", paddingBottom: ouvert && !bureau ? 8 : 0 }}>
              <button type="button" onClick={() => setBascules((s) => ({ ...s, [r.code]: !ouvert }))} aria-expanded={ouvert}
                className={`barre-categorie${ouvert ? " ouverte" : ""}`}
                style={{ ...styleBarreCategorie(couleurRayon(r.code)), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouvert ? "14px 14px 0 0" : 14 }}>
                <span style={styleTitreCategorie(couleurRayon(r.code))}>
                  {r.libelle} <span style={{ opacity: 0.75, fontWeight: 400 }}>({r.articles.length})</span>
                </span>
                {r.dansCommande > 0 && (
                  <span style={stylePastilleBarre(couleurRayon(r.code))}>{r.dansCommande}</span>
                )}
                <span style={styleChevronBarre(couleurRayon(r.code), ouvert)}>▼</span>
              </button>
              </div>
              {ouvert && <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>{tableau(r.articles, couleurRayon(r.code))}</div>}
            </div>
          );
        })
      )}
      {aEnvoyer && onEnvoyer && (
        <button type="button" onClick={() => onEnvoyer(data.session!.id)}
          style={{ width: "100%", minHeight: 56, marginTop: 8, borderRadius: 14, border: "none", background: ACCENT, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer" }}>
          Envoyer la précommande
        </button>
      )}
      {resume.prixInconnu && <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>* un ou plusieurs prix inconnus, non comptés dans le total</div>}
    </div>
  );
}
