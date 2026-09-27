"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";

/**
 * Écran de commande simplifié (fournisseurs avec suppliers.commande_simplifiee, Maël d'abord).
 * Pensé pour le téléphone : les habituels de l'établissement rangés par rayon, un appui
 * propose la quantité habituelle, − / + ajustent la part de la personne connectée.
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
const qteTexte = (n: number) => String(n).replace(".", ",");

export function CommandeSimplifiee({ supplierId, onChange }: { supplierId: string; onChange?: () => void }) {
  const [data, setData] = useState<Donnees | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [modes, setModes] = useState<Record<string, Mode>>({});
  const [enCours, setEnCours] = useState<Set<string>>(new Set());

  const charger = useCallback(async (): Promise<Donnees | null> => {
    try {
      const res = await fetchApi(`/api/commandes/simplifiee?supplier_id=${encodeURIComponent(supplierId)}`);
      const json = await res.json();
      if (!res.ok) { setErreur(json.error ?? "Erreur de chargement"); return null; }
      setErreur(null);
      setData(json as Donnees);
      return json as Donnees;
    } catch {
      setErreur("Erreur de chargement");
      return null;
    }
  }, [supplierId]);

  useEffect(() => { void charger(); }, [charger]);

  const uniteDe = (a: Article, m: Mode) => (m === "element" ? a.unite_element ?? a.unite_uc : a.unite_uc);
  const modeDe = (a: Article): Mode => modes[a.ingredient_id] ?? (a.unite_element && a.habituel?.mode === "element" ? "element" : "uc");
  const ligneDe = useCallback((a: Article, m: Mode) => data?.lignes.find((l) => l.ingredient_id === a.ingredient_id && l.unite === (m === "element" ? a.unite_element : a.unite_uc)), [data]);

  // Articles de la commande du jour (jamais la précommande)
  const duJour = useMemo(() => (data?.articles ?? []).filter((a) => !a.precommande), [data]);
  const enCommande = useCallback((a: Article) => (data?.lignes ?? []).some((l) => l.ingredient_id === a.ingredient_id && l.quantite > 0), [data]);

  const sections = useMemo(() => {
    if (!data) return [];
    const visibles = duJour.filter((a) => a.habituel || enCommande(a));
    return data.rayons
      .map((r) => ({
        ...r,
        articles: visibles
          .filter((a) => a.rayon === r.code)
          .sort((x, y) => (y.habituel?.nb_achats ?? 0) - (x.habituel?.nb_achats ?? 0) || x.nom.localeCompare(y.nom, "fr")),
      }))
      .filter((r) => r.articles.length > 0);
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

  /** Fixe la part de la personne connectée (mise à jour immédiate à l'écran, puis enregistrement) */
  async function fixerMaPart(a: Article, m: Mode, nouvelle: number) {
    if (!data) return;
    const cle = `${a.ingredient_id}|${m}`;
    const unite = uniteDe(a, m);
    const avant = data;
    // Optimiste : on recalcule la ligne localement
    const lignes = data.lignes.map((l) => ({ ...l, apports: [...l.apports] }));
    let l = lignes.find((x) => x.ingredient_id === a.ingredient_id && x.unite === unite);
    if (!l) { l = { ingredient_id: a.ingredient_id, unite, quantite: 0, apports: [] }; lignes.push(l); }
    const autres = l.apports.filter((p) => p.user_id !== data.moi);
    l.apports = nouvelle > 0 ? [...autres, { user_id: data.moi, nom: "Moi", quantite: nouvelle }] : autres;
    l.quantite = l.apports.reduce((s, p) => s + p.quantite, 0);
    setData({ ...data, lignes: lignes.filter((x) => x.quantite > 0) });
    setEnCours((s) => new Set(s).add(cle));
    try {
      const res = await fetchApi("/api/commandes/simplifiee", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, ingredient_id: a.ingredient_id, mode: m, quantite: nouvelle }),
      });
      const json = await res.json();
      if (!res.ok) { setData(avant); alert(json.error ?? "Enregistrement impossible"); return; }
      const apres = await charger();
      // La page parente (boutons Valider / Envoyer) n'est rechargée que quand le brouillon apparaît ou se vide
      const vide = (d: Donnees | null) => !d?.session || !(d.lignes ?? []).some((x) => x.quantite > 0);
      if (vide(avant) !== vide(apres)) onChange?.();
    } catch {
      setData(avant);
      alert("Enregistrement impossible, vérifie la connexion");
    } finally {
      setEnCours((s) => { const n = new Set(s); n.delete(cle); return n; });
    }
  }

  if (erreur) return <div style={{ padding: 16, color: "#8a2b2b", background: "#fbeaea", borderRadius: 12, fontSize: 14 }}>{erreur}</div>;
  if (!data) return <div style={{ padding: 24, textAlign: "center", color: "#999", fontSize: 14 }}>Chargement des produits…</div>;

  const brouillon = !data.session || data.session.status === "brouillon";

  function carte(a: Article) {
    const m = modeDe(a);
    const ligne = ligneDe(a, m);
    const total = ligne?.quantite ?? 0;
    const maPart = ligne?.apports.find((p) => p.user_id === data!.moi)?.quantite ?? 0;
    const pas = m === "uc" && a.au_poids ? 0.5 : 1;
    const habituelIci = a.habituel && a.habituel.mode === m ? a.habituel.quantite : 1;
    const prix = m === "element" ? a.prix_element : a.prix_uc;
    const unite = uniteDe(a, m);
    const autreMode: Mode = m === "uc" ? "element" : "uc";
    const autreLigne = a.unite_element ? ligneDe(a, autreMode) : undefined;
    const occupe = enCours.has(`${a.ingredient_id}|${m}`);
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
        padding: "12px 12px 12px 14px", marginBottom: 8, opacity: occupe ? 0.7 : 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#1a1a1a", lineHeight: 1.25 }}>{a.nom}</div>
            <div style={{ fontSize: 12, color: "#8a8378", marginTop: 3 }}>
              {unite}{prix != null ? ` · ${euros(prix)}` : ""}{a.ref ? ` · ${a.ref}` : ""}
            </div>
            {a.habituel && total === 0 && (
              <div style={{ fontSize: 12, color: ACCENT, marginTop: 2 }}>Habituel : {qteTexte(a.habituel.quantite)} × {uniteDe(a, a.habituel.mode)}</div>
            )}
          </div>
          {brouillon && (total === 0 ? (
            <button type="button" aria-label={`Ajouter ${a.nom}`} disabled={occupe}
              onClick={() => fixerMaPart(a, m, habituelIci)}
              style={{ ...btn(true), width: "auto", minWidth: 64, padding: "0 16px", fontSize: 18 }}>
              + {qteTexte(habituelIci)}
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" aria-label="Moins" disabled={occupe || maPart <= 0}
                onClick={() => fixerMaPart(a, m, Math.max(0, Math.round((maPart - pas) * 2) / 2))} style={btn(maPart > 0)}>−</button>
              <div style={{ minWidth: 34, textAlign: "center", fontSize: 22, fontWeight: 700, fontFamily: OSWALD }}>{qteTexte(total)}</div>
              <button type="button" aria-label="Plus" disabled={occupe}
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
            {autreLigne && autreLigne.quantite > 0 && <>{detail ? " — " : ""}aussi {qteTexte(autreLigne.quantite)} × {uniteDe(a, autreMode)}</>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: 110 }}>
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
          Aucun produit habituel ces 90 derniers jours. Utilise la recherche pour ajouter un produit.
        </div>
      ) : (
        sections.map((r) => (
          <div key={r.code} style={{ marginBottom: 18 }}>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: "0.04em", color: "#1a1a1a", margin: "4px 2px 8px" }}>
              {r.libelle} <span style={{ color: "#999", fontWeight: 400 }}>({r.articles.length})</span>
            </div>
            {r.articles.map(carte)}
          </div>
        ))
      )}
      {resume.prixInconnu && <div style={{ fontSize: 11, color: "#999", marginTop: 8 }}>* un ou plusieurs prix inconnus, non comptés dans le total</div>}
    </div>
  );
}
