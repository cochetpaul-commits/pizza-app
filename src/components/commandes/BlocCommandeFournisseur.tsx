"use client";

import React, { useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useProfile } from "@/lib/ProfileContext";
import {
  libelleColisage, libelleElement, nomUnite, validerConditionnement,
  type CommandeArticle, type UniteCommande, type UniteTaille,
} from "@/lib/commandeArticles";

/**
 * Fiche produit ouverte depuis l'écran de commande : conditionnement de commande chez ce fournisseur
 * (commande_articles : unité de commande, contenu, élément, taille, commande à l'élément).
 * Modifiable par les admins et les managers ; enregistré à part de la fiche (bouton du bloc).
 */

type Form = { unite_commande: string; contenu_nb: string; element: string; element_qte: string; element_unite: string; commande_element_permise: boolean };
type Reponse = { fournisseur: { id: string; nom: string }; article: (CommandeArticle & { ingredient_id: string }) | null; unites: UniteCommande[]; unites_taille: UniteTaille[] };

const ACCENT = "#D4775A";
const champ: React.CSSProperties = { width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 10px", fontSize: 15, background: "#fff", boxSizing: "border-box", fontFamily: "inherit" };
const etiquette: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "#6f6656", marginBottom: 4, display: "block" };

const versForm = (a: CommandeArticle): Form => ({
  unite_commande: a.unite_commande, contenu_nb: String(Number(a.contenu_nb)).replace(".", ","), element: a.element ?? "",
  element_qte: a.element_qte != null ? String(Number(a.element_qte)).replace(".", ",") : "", element_unite: a.element_unite ?? "",
  commande_element_permise: a.commande_element_permise,
});
const nombre = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));

export function BlocCommandeFournisseur({ supplierId, ingredientId }: { supplierId: string; ingredientId: string }) {
  const { canWrite } = useProfile();
  const [donnees, setDonnees] = useState<Reponse | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let annule = false;
    (async () => {
      const res = await fetchApi(`/api/commandes/articles?supplier_id=${encodeURIComponent(supplierId)}&ingredient_id=${encodeURIComponent(ingredientId)}`);
      const json = await res.json().catch(() => ({}));
      if (annule) return;
      if (!res.ok) { setErreur(json.error ?? "Chargement impossible"); return; }
      setDonnees(json as Reponse);
      if (json.article) setForm(versForm(json.article));
    })();
    return () => { annule = true; };
  }, [supplierId, ingredientId]);

  const saisie = useMemo(() => form && ({
    unite_commande: form.unite_commande, contenu_nb: nombre(form.contenu_nb), element: form.element || null,
    element_qte: nombre(form.element_qte), element_unite: form.element_unite || null, commande_element_permise: form.commande_element_permise,
  }), [form]);
  const verif = useMemo(() => (saisie ? validerConditionnement(saisie) : null), [saisie]);
  const apercu = verif?.ok ? { ...verif.valeur, precommande: false } : null;
  const modifie = !!(donnees?.article && form && JSON.stringify(versForm(donnees.article)) !== JSON.stringify(form));

  if (!canWrite) return null;
  const cadre: React.CSSProperties = { background: "#fff8ee", border: `1.5px solid ${ACCENT}55`, borderRadius: 14, padding: 14, margin: "8px 0 14px" };
  if (erreur) return <div style={cadre}><div style={{ fontSize: 13, color: "#8a2b2b" }}>{erreur}</div></div>;
  if (!donnees) return <div style={cadre}><div style={{ fontSize: 13, color: "#999" }}>Conditionnement de commande…</div></div>;
  if (!donnees.article || !form) {
    return <div style={cadre}><div style={{ fontSize: 13, color: "#6f6656" }}>Pas de conditionnement de commande pour ce produit chez {donnees.fournisseur.nom}.</div></div>;
  }

  const auPoids = form.unite_commande === "kg" || form.unite_commande === "litre";
  const maj = (p: Partial<Form>) => { setForm((f) => (f ? { ...f, ...p } : f)); setMessage(null); };

  const enregistrer = async () => {
    if (!saisie || !verif?.ok) return;
    setEnvoi(true); setMessage(null);
    try {
      const res = await fetchApi("/api/commandes/articles", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplier_id: supplierId, ingredient_id: ingredientId, ...saisie }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? "Enregistrement impossible"); return; }
      setDonnees((d) => (d && d.article ? { ...d, article: { ...d.article, ...verif.valeur } } : d));
      setMessage(`Enregistré : ${json.libelle}${json.libelle_element ? ` · à l'élément : ${json.libelle_element}` : ""}`);
    } finally { setEnvoi(false); }
  };

  return (
    <div style={cadre}>
      <div style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.03em", color: "#1a1a1a", marginBottom: 10 }}>
        Commande chez {donnees.fournisseur.nom}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <label>
          <span style={etiquette}>Unité de commande</span>
          <select style={champ} value={form.unite_commande} onChange={(e) => maj({ unite_commande: e.target.value })}>
            {donnees.unites.map((u) => <option key={u} value={u}>{nomUnite(u)}</option>)}
          </select>
        </label>
        <label>
          <span style={etiquette}>Contenu (nombre d&apos;éléments)</span>
          <input style={{ ...champ, background: auPoids ? "#f3efe7" : "#fff" }} inputMode="decimal" value={auPoids ? "1" : form.contenu_nb}
            disabled={auPoids} onChange={(e) => maj({ contenu_nb: e.target.value })} />
        </label>
        <label>
          <span style={etiquette}>Élément</span>
          <select style={champ} value={auPoids ? "" : form.element} disabled={auPoids}
            onChange={(e) => maj({ element: e.target.value, ...(e.target.value ? {} : { commande_element_permise: false }) })}>
            <option value="">— aucun —</option>
            {donnees.unites.filter((u) => u !== "kg" && u !== "litre").map((u) => <option key={u} value={u}>{nomUnite(u)}</option>)}
          </select>
        </label>
        <div>
          <span style={etiquette}>Taille d&apos;un élément</span>
          <div style={{ display: "flex", gap: 6 }}>
            <input style={{ ...champ, flex: 1, minWidth: 0 }} inputMode="decimal" placeholder="ex. 75" value={auPoids ? "" : form.element_qte}
              disabled={auPoids} onChange={(e) => maj({ element_qte: e.target.value })} />
            <select style={{ ...champ, width: 70 }} value={auPoids ? "" : form.element_unite} disabled={auPoids} onChange={(e) => maj({ element_unite: e.target.value })}>
              <option value="">—</option>
              {donnees.unites_taille.map((u) => <option key={u} value={u}>{u === "l" ? "L" : u === "ml" ? "mL" : u}</option>)}
            </select>
          </div>
        </div>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, color: auPoids || !form.element ? "#b0a894" : "#1a1a1a" }}>
        <input type="checkbox" checked={form.commande_element_permise} disabled={auPoids || !form.element}
          onChange={(e) => maj({ commande_element_permise: e.target.checked })} style={{ width: 20, height: 20 }} />
        Commande possible à l&apos;élément{form.element ? ` (par ${nomUnite(form.element as UniteCommande)})` : ""}
      </label>

      <div style={{ marginTop: 12, fontSize: 13, color: "#6f6656" }}>
        {apercu ? <>Sur l&apos;écran de commande : <strong style={{ color: "#1a1a1a" }}>{libelleColisage(apercu)}</strong>
          {libelleElement(apercu) ? <> · à l&apos;élément : <strong style={{ color: "#1a1a1a" }}>{libelleElement(apercu)}</strong></> : null}</>
          : <span style={{ color: "#8a2b2b" }}>{verif && !verif.ok ? verif.erreur : ""}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
        <button type="button" onClick={enregistrer} disabled={!modifie || !verif?.ok || envoi}
          style={{
            height: 44, padding: "0 18px", borderRadius: 12, border: "none", fontSize: 14, fontWeight: 700, fontFamily: "inherit",
            background: !modifie || !verif?.ok ? "#e3dccf" : ACCENT, color: !modifie || !verif?.ok ? "#9a917f" : "#fff",
            cursor: !modifie || !verif?.ok ? "default" : "pointer",
          }}>
          {envoi ? "Enregistrement…" : "Enregistrer le conditionnement"}
        </button>
        {modifie && !message && <span style={{ fontSize: 12, color: "#b45309" }}>Modifié, pas encore enregistré</span>}
        {message && <span style={{ fontSize: 12.5, color: message.startsWith("Enregistré") ? "#2D6A4F" : "#8a2b2b" }}>{message}</span>}
      </div>
    </div>
  );
}
