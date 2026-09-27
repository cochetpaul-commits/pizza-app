"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { SEUIL_HABITUEL } from "@/lib/commandeHabituels";
import { quantiteLisible, type UniteCommande } from "@/lib/commandeArticles";

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
  unite_uc: string;
  unite_element: string | null;
  prix_uc: number | null;
  prix_element: number | null;
  ref: string | null;
  habituel: Habituel | null;
};
type Apport = { user_id: string; nom: string; quantite: number };
type Ligne = { ingredient_id: string; unite: string | null; quantite: number; apports: Apport[] };
type Donnees = {
  fournisseur: { id: string; nom: string };
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


export function CommandeSimplifiee({ supplierId, onChange }: { supplierId: string; onChange?: () => void }) {
  const [data, setData] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
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
  const [bascules, setBascules] = useState<Record<string, boolean>>({});

  const charger = useCallback(async (): Promise<Donnees | null> => {
    try {
      const res = await fetchApi(`/api/commandes/simplifiee?supplier_id=${encodeURIComponent(supplierId)}`);
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
  }, [supplierId]);

  useEffect(() => { void charger(); }, [charger]);

  const uniteDe = (a: Article, m: Mode) => (m === "element" ? a.unite_element ?? a.unite_uc : a.unite_uc);
  const modeDe = (a: Article): Mode => modes[a.ingredient_id] ?? (a.unite_element && a.habituel?.mode === "element" ? "element" : "uc");
  const ligneDe = useCallback((a: Article, m: Mode) => data?.lignes.find((l) => l.ingredient_id === a.ingredient_id && l.unite === (m === "element" ? a.unite_element : a.unite_uc)), [data]);

  const duJour = useMemo(() => data?.articles ?? [], [data]);
  const estHabituel = (a: Article) => (a.habituel?.nb_achats ?? 0) >= SEUIL_HABITUEL;
  const enCommande = useCallback((a: Article) => (data?.lignes ?? []).some((l) => l.ingredient_id === a.ingredient_id && l.quantite > 0), [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    const visibles = duJour.filter((a) => estHabituel(a) || enCommande(a));
    return data.rayons
      .map((r) => ({
        ...r,
        articles: visibles
          .filter((a) => a.rayon === r.code)
          // Ordre alphabétique sans accents ni casse (« Crème » / « Creme » ensemble, « Œuf » avec les O), comme le mail et le PDF
          .sort((x, y) => x.nom.localeCompare(y.nom, "fr", { sensitivity: "base" })),
      }))
      .filter((r) => r.articles.length > 0)
      .map((r) => ({ ...r, dansCommande: r.articles.filter(enCommande).length }));
  }, [data, duJour, enCommande]);

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
    enVol.current.add(cle);
    let ok = false;
    try {
      const res = await fetchApi("/api/commandes/simplifiee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, ingredient_id: v.a.ingredient_id, mode: v.m, quantite: v.qte }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Refus du serveur (commande validée entre-temps…) : on revient à la valeur enregistrée
        setAlerte(json.error ?? "Pas enregistré, réessaie");
      } else {
        ok = true;
        confirmees.current.set(`${v.a.ingredient_id}|${unite}`, v.qte);
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
  }, [supplierId, onChange]);

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

  // En quittant l'écran, les appuis en attente partent tout de suite (jamais perdus)
  useEffect(() => () => {
    for (const [cle, t] of minuteries.current) { clearTimeout(t); void envoyer(cle); }
    minuteries.current.clear();
  }, [envoyer]);

  if (erreur) return <div style={{ padding: 16, color: "#8a2b2b", background: "#fbeaea", borderRadius: 12, fontSize: 14 }}>{erreur}</div>;
  if (!data) return <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14 }}>Chargement des produits…</div>;

  const brouillon = !data.session || data.session.status === "brouillon";

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

    return (
      <div key={a.ingredient_id} style={{
        background: "#fff", borderRadius: 14, border: `1.5px solid ${total > 0 ? ACCENT : "#ddd6c8"}`,
        padding: "12px 12px 12px 14px", marginBottom: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", lineHeight: 1.25 }}>{a.nom}</div>
            <div style={{ fontSize: 12, color: "#8a8378", marginTop: 3 }}>
              {unite}{prix != null ? ` · ${euros(prix)}` : ""}{a.ref ? ` · ${a.ref}` : ""}
            </div>
            {estHabituel(a) && a.habituel && (
              <div style={{ fontSize: 12, color: ACCENT, marginTop: 2 }}>
                {/* Médiane par livraison */}
                D&apos;habitude : {quantiteLisible(a, a.habituel.quantite, a.habituel.mode)} par livraison
              </div>
            )}
            {total > 0 && !a.au_poids && a.contenu_nb > 1 && (
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginTop: 2 }}>En cours : {quantiteLisible(a, total, m)}</div>
            )}
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
        {a.unite_element && brouillon && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {(["uc", "element"] as Mode[]).map((x) => (
              <button key={x} type="button" onClick={() => setModes((s) => ({ ...s, [a.ingredient_id]: x }))}
                style={{
                  flex: 1, height: 36, borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: "pointer",
                  border: m === x ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8",
                  background: m === x ? "#FFF0EB" : "#f7f3ec", color: m === x ? ACCENT : "#8a8378",
                }}>
                Par {x === "uc" ? a.unite_uc : a.unite_element}
              </button>
            ))}
          </div>
        )}
        {(detail || (autreLigne && autreLigne.quantite > 0)) && (
          <div style={{ fontSize: 12, color: "#6f6656", marginTop: 8 }}>
            {detail}
            {autreLigne && autreLigne.quantite > 0 && <>{detail ? " — " : ""}aussi {quantiteLisible(a, autreLigne.quantite, autreMode)}</>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 110 }}>
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
          <strong style={{ fontFamily: OSWALD, fontSize: 18 }}>{resume.nb}</strong> produit{resume.nb > 1 ? "s" : ""} dans la commande
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

      <input
        type="search"
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder={`Autre produit ${data.fournisseur.nom}…`}
        style={{
          width: "100%", height: 48, borderRadius: 12, border: "1.5px solid #ddd6c8", padding: "0 14px",
          fontSize: 16, background: "#fff", boxSizing: "border-box", marginBottom: 14, outline: "none",
        }}
      />

      {recherche.trim().length >= 2 ? (
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
          const ouvert = bascules[r.code] ?? r.dansCommande > 0;
          return (
            <div key={r.code} style={{ marginBottom: 10 }}>
              {/* Titre de rayon : fond plein, texte blanc ; collé en haut de l'écran tant que le rayon ouvert défile */}
              <div className={ouvert ? "rayon-collant" : undefined} style={{ background: "#f2ede4", paddingBottom: ouvert ? 8 : 0 }}>
              <button type="button" onClick={() => setBascules((s) => ({ ...s, [r.code]: !ouvert }))} aria-expanded={ouvert}
                style={{
                  width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
                  background: ouvert ? "#5a3a2a" : ACCENT, border: "none", borderRadius: 14,
                  cursor: "pointer", textAlign: "left", touchAction: "manipulation",
                  boxShadow: "0 2px 6px rgba(0,0,0,0.12)",
                }}>
                <span style={{ flex: 1, fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.04em", color: "#fff" }}>
                  {r.libelle} <span style={{ opacity: 0.75, fontWeight: 400 }}>({r.articles.length})</span>
                </span>
                {r.dansCommande > 0 && (
                  <span style={{ fontSize: 12, fontWeight: 700, color: ouvert ? "#5a3a2a" : ACCENT, background: "#fff", borderRadius: 10, padding: "3px 8px" }}>{r.dansCommande}</span>
                )}
                <span style={{ color: "#fff", fontSize: 13, transform: ouvert ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
              </button>
              </div>
              {ouvert && r.articles.map(carte)}
            </div>
          );
        })
      )}
      {resume.prixInconnu && <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>* un ou plusieurs prix inconnus, non comptés dans le total</div>}
    </div>
  );
}
