"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { fetchApi } from "@/lib/fetchApi";
import { SEUIL_HABITUEL } from "@/lib/commandeHabituels";
import { libelleZone, nomUnite, quantiteAffichee, type UniteCommande, type UniteTaille } from "@/lib/commandeArticles";
import { CAT_COLORS, type Category } from "@/types/ingredients";

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

/** Couleur du titre de rayon : celle de sa catégorie dans les listes de produits (même couleur chez tous les fournisseurs) */
const CATEGORIE_DU_RAYON: Record<string, Category> = {
  cremerie: "cremerie_fromage", charcuterie: "charcuterie_viande", fruits_legumes: "legumes_herbes",
  base_pizza: "epicerie_salee", epicerie_cuisine: "epicerie_salee", epicerie_sucree: "epicerie_sucree",
  maree_surgeles: "maree", hygiene: "emballage",
  bar_softs: "soft", bar_sirops: "sirops", bar_bieres: "biere", bar_vins: "vins",
  bar_liqueurs: "liqueurs", bar_spiritueux: "spiritueux", bar_cafe: "cafeteria",
};
const couleurRayon = (code: string) => CAT_COLORS[CATEGORIE_DU_RAYON[code] ?? "autre"];

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
    // Précommande : les produits cochés, tous affichés (à 0 au départ) ; jour : habituels + déjà commandés
    const visibles = onglet === "precommande" ? duJour : duJour.filter((a) => estHabituel(a) || enCommande(a));
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
    // fournisseur : la fiche affiche aussi le conditionnement de commande chez lui (bloc « Commande chez … »)
    router.push(`/ingredients?edit=${a.ingredient_id}&fournisseur=${supplierId}&back=${encodeURIComponent(`/commandes?supplier_id=${supplierId}`)}`);
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

  function carte(a: Article) {
    const m = modeDe(a);
    const ligne = ligneDe(a, m);
    const total = ligne?.quantite ?? 0;
    const maPart = ligne?.apports.find((p) => p.user_id === data!.moi)?.quantite ?? 0;
    const pas = m === "uc" && a.au_poids ? 0.5 : 1;
    const prix = m === "element" ? a.prix_element : a.prix_uc;
    const unite = uniteDe(a, m);
    const autreMode: Mode = m === "uc" ? "element" : "uc";
    const autreLigne = a.unite_element ? ligneDe(a, autreMode) : undefined;
    const detail = ligne && ligne.apports.length > 0 && (ligne.apports.length > 1 || ligne.apports[0].user_id !== data!.moi)
      ? ligne.apports.map((p) => `${p.user_id === data!.moi ? "moi" : p.nom} ${qteTexte(p.quantite)}`).join(" · ")
      : null;
    const btn = (actif: boolean): React.CSSProperties => ({
      width: 48, height: 48, borderRadius: 24, border: "none", fontSize: 26, fontWeight: 700, lineHeight: 1,
      background: actif ? ACCENT : "#ece4d4", color: actif ? "#fff" : "#b8ad9a", cursor: actif ? "pointer" : "default",
      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, touchAction: "manipulation",
    });

    const texteIndication: React.CSSProperties = { fontSize: 12.5, color: ACCENT, marginTop: 6, whiteSpace: "normal", overflowWrap: "anywhere" };
    return (
      <div key={a.ingredient_id} style={{
        background: "#fff", borderRadius: 14, border: `1.5px solid ${total > 0 ? ACCENT : "#ddd6c8"}`,
        padding: "12px 12px 12px 14px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 4 }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", lineHeight: 1.25, minWidth: 0 }}>{a.nom}</div>
              {peutCorrigerFiche && (
                <button type="button" aria-label={`Ouvrir la fiche produit ${a.nom}`} title="Ouvrir la fiche produit"
                  onClick={() => void ouvrirFiche(a)}
                  style={{
                    flexShrink: 0, width: 28, height: 24, marginTop: -2, border: "none", background: "transparent", padding: 0,
                    display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#b0a894",
                  }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                  </svg>
                </button>
              )}
            </div>
            {a.zones.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                {a.zones.map((z) => (
                  <span key={z.nom} style={{
                    fontSize: 11, fontWeight: 600, lineHeight: 1.2, padding: "2px 7px", borderRadius: 8,
                    color: z.couleur ?? "#8a8378", background: `${z.couleur ?? "#8a8378"}14`, border: `1px solid ${z.couleur ?? "#8a8378"}33`,
                  }}>{libelleZone(z.nom)}</span>
                ))}
              </div>
            )}
            <div style={{ fontSize: 12, color: "#8a8378", marginTop: 3 }}>
              {unite}{prix != null ? ` · ${euros(prix)}` : ""}{a.ref ? ` · ${a.ref}` : ""}
            </div>
          </div>
          {brouillon && (total === 0 ? (
            <button type="button" aria-label={`Ajouter ${a.nom}`} 
              onClick={() => fixerMaPart(a, m, 1)}
              style={{ ...btn(true), width: "auto", minWidth: 64, padding: "0 16px", fontSize: 18 }}>
              + 1
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" aria-label="Moins" disabled={maPart <= 0}
                onClick={() => fixerMaPart(a, m, Math.max(0, Math.round((maPart - pas) * 2) / 2))} style={btn(maPart > 0)}>−</button>
              <div style={{ minWidth: 34, textAlign: "center", fontSize: 22, fontWeight: 700, fontFamily: OSWALD }}>{qteTexte(total)}</div>
              <button type="button" aria-label="Plus"
                onClick={() => fixerMaPart(a, m, Math.round((maPart + pas) * 2) / 2)} style={btn(true)}>+</button>
            </div>
          ))}
        </div>
        {/* Sous la ligne, sur toute la largeur de la carte : jamais coupé, passe à la ligne (iPhone) */}
        {data!.indication === "derniere_commande" ? (a.derniere && (
          <div style={texteIndication}>Dernière commande : {quantiteAffichee(a, a.derniere.quantite, a.derniere.mode)}</div>
        )) : (estHabituel(a) && a.habituel && (
          // Médiane par livraison
          <div style={texteIndication}>D&apos;habitude : {quantiteAffichee(a, a.habituel.quantite, a.habituel.mode)} par livraison</div>
        ))}
        {a.stock_objectif != null && (
          <div style={{ ...texteIndication, color: "#6f6656", marginTop: 2 }}>
            Stock idéal : {quantiteAffichee(a, a.stock_objectif, a.contenu_nb > 1 ? "element" : "uc")}
          </div>
        )}
        {total > 0 && !a.au_poids && a.contenu_nb > 1 && (
          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginTop: 2, whiteSpace: "normal", overflowWrap: "anywhere" }}>En cours : {quantiteAffichee(a, total, m)}</div>
        )}
        {a.unite_element && brouillon && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {(["uc", "element"] as Mode[]).map((x) => (
              <button key={x} type="button" onClick={() => setModes((s) => ({ ...s, [a.ingredient_id]: x }))}
                style={{
                  flex: 1, minHeight: 36, padding: "4px 8px", borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer", lineHeight: 1.2,
                  border: m === x ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8",
                  background: m === x ? "#FFF0EB" : "#f7f3ec", color: m === x ? ACCENT : "#8a8378",
                }}>
                {/* « Par carton de 6 » / « Par bouteille » : l'autre bouton dit déjà ce qu'il y a dans le carton */}
                Par {x === "element" ? a.unite_element : a.contenu_nb > 1 && a.element ? `${nomUnite(a.unite_commande)} de ${qteTexte(a.contenu_nb)}` : a.unite_uc}
              </button>
            ))}
          </div>
        )}
        {(detail || (autreLigne && autreLigne.quantite > 0)) && (
          <div style={{ fontSize: 12, color: "#6f6656", marginTop: 8 }}>
            {detail}
            {autreLigne && autreLigne.quantite > 0 && <>{detail ? " — " : ""}aussi {quantiteAffichee(a, autreLigne.quantite, autreMode)}</>}
          </div>
        )}
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
          {resultats.map(carte)}
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
              <div className={ouvert ? "rayon-collant" : undefined} style={{ background: "#f2ede4", paddingBottom: ouvert ? 8 : 0 }}>
              <button type="button" onClick={() => setBascules((s) => ({ ...s, [r.code]: !ouvert }))} aria-expanded={ouvert}
                style={{
                  width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
                  background: couleurRayon(r.code), border: "none", borderRadius: 14,
                  cursor: "pointer", textAlign: "left", touchAction: "manipulation",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}>
                <span style={{ flex: 1, fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.04em", color: "#fff" }}>
                  {r.libelle} <span style={{ opacity: 0.75, fontWeight: 400 }}>({r.articles.length})</span>
                </span>
                {r.dansCommande > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: couleurRayon(r.code), background: "#fff", borderRadius: 10, padding: "3px 8px" }}>{r.dansCommande}</span>
                )}
                <span style={{ color: "#fff", fontSize: 13, transform: ouvert ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
              </button>
              </div>
              {ouvert && r.articles.map(carte)}
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
