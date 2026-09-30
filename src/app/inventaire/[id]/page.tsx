"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi, openApiFile } from "@/lib/fetchApi";
import { inChunks } from "@/lib/supabaseChunks";
import { useProfile } from "@/lib/ProfileContext";
import { libelleZone } from "@/lib/commandeArticles";
import { categorieDeFamille, choisirConditionnement, totalLigne, type ArticleFournisseur, type Conditionnement, type OffreActive } from "@/lib/inventaire";
import { coutUniteComptee, type OffreValo } from "@/lib/inventaireValorisation";
import { cleEtab } from "@/lib/zonesEtablissement";
import { CATEGORIES, CAT_COLORS, CAT_LABELS, type Category } from "@/types/ingredients";

/** Couleur du titre de famille : celle de sa catégorie (même charte que les rayons de l'écran de commande) */
const couleurFamille = (famille: string | null) => CAT_COLORS[categorieDeFamille(famille) as Category] ?? CAT_COLORS.autre ?? "#8a8378";

/**
 * Inventaire « feuille » : saisie zone par zone, dans l'ordre de la feuille papier (famille, puis produit).
 * Deux champs par produit, colis et unités ; total = colis × contenu + unités. Chaque ligne se compte à l'unité
 * ou par colis (conditionnement de commande de la fiche), affiche le détail du conditionnement et le coût
 * unitaire, s'ouvre sur la fiche produit (crayon), se retire de la liste (et se remet), change de zone.
 * Zones : ajout depuis l'écran. Produits : ajout par recherche ou par catégorie, création rapide d'une fiche.
 * Enregistrement au fil de la saisie ; clôturé = lecture seule (un admin peut rouvrir). Admins et managers.
 */

type Inventaire = { id: string; etablissement_id: string; date: string; type: "fin_exercice" | "mensuel"; statut: string; saisie: string };
type Ligne = {
  id: string; ingredient_id: string; zone: string; ordre: number | null; famille: string | null;
  colis: number | null; unites: number | null; quantite: number; unite: string | null;
  cond_contenu: number | null; cond_libelle: string | null; retiree: boolean; nom: string;
  nom_feuille: string | null; rattachement: string | null; aVerifier: boolean; inactive: boolean;
};
type Fiche = {
  id: string; name: string; status: string | null; is_active: boolean; category: string | null; sub_category: string | null; default_unit: string | null; default_supplier_id: string | null;
  purchase_price: number | null; purchase_unit: number | null; purchase_unit_label: string | null; piece_weight_g: number | null; piece_volume_ml: number | null; density_g_per_ml: number | null;
};
type Saisie = { colis: string; unites: string };

const ACCENT = "#D4775A";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(",", ".")));
const txt = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));
const eur = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
const normNom = (x: string) => x.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const fmtDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
const pluriel = (u: string | null, n: number) => {
  const m = u ?? "";
  if (n <= 1 || !m || ["kg", "g", "l", "ml", "cl", "pc", "colis"].includes(m)) return m;
  return m.endsWith("s") || m.endsWith("x") ? m : m === "plateau" ? "plateaux" : m === "seau" ? "seaux" : `${m}s`;
};
const uniteFiche = (u: string | null | undefined) => (u === "kg" ? "kg" : u === "l" ? "litre" : u === "g" ? "kg" : u === "ml" ? "litre" : "pièce");

export default function InventaireFeuillePage() {
  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <Feuille />
    </RequireRole>
  );
}

function Feuille() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isGroupAdmin } = useProfile();
  const [inv, setInv] = useState<Inventaire | null>(null);
  const [etabNom, setEtabNom] = useState("");
  const [etabSlug, setEtabSlug] = useState("");
  const [zones, setZones] = useState<string[]>([]);
  const [lignes, setLignes] = useState<Ligne[]>([]);
  const [fiches, setFiches] = useState<Record<string, Fiche>>({});
  const [articles, setArticles] = useState<Record<string, ArticleFournisseur[]>>({});
  const [offres, setOffres] = useState<Record<string, (OffreValo & OffreActive)[]>>({});
  const [saisies, setSaisies] = useState<Record<string, Saisie>>({});
  const [zone, setZone] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [enCours, setEnCours] = useState<string | null>(null);
  const [etatLigne, setEtatLigne] = useState<Record<string, "attente" | "ok" | "erreur">>({});
  const [voirRetirees, setVoirRetirees] = useState(false);
  const [modaleAjout, setModaleAjout] = useState(false);
  /** Familles ouvertes ou fermées à la main, clé « zone|famille » (sinon : ouvertes si elles ont déjà des lignes comptées, comme les rayons de la commande) */
  const [bascules, setBascules] = useState<Record<string, boolean>>({});
  const cleFamille = (z: string, fam: string | null) => `${z}|${fam ?? ""}`;
  const minuteries = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const fichierRef = useRef<HTMLInputElement | null>(null);

  const charger = useCallback(async () => {
    const { data: i, error } = await supabase.from("inventaires").select("id, etablissement_id, date, type, statut, saisie").eq("id", id).maybeSingle();
    if (error || !i) { setErreur("Inventaire introuvable ou accès refusé"); return; }
    const invRow = i as Inventaire;
    const [{ data: z }, { data: e }, { data: ls }] = await Promise.all([
      supabase.from("storage_zones").select("name, display_order").eq("etablissement_id", invRow.etablissement_id).order("display_order"),
      supabase.from("etablissements").select("nom, slug").eq("id", invRow.etablissement_id).maybeSingle(),
      supabase.from("inventaire_lignes").select("id, ingredient_id, zone, ordre, famille, colis, unites, quantite, unite, cond_contenu, cond_libelle, retiree, nom_feuille, rattachement")
        .eq("inventaire_id", id).order("ordre", { ascending: true, nullsFirst: false }).limit(5000),
    ]);
    const ids = [...new Set((ls ?? []).map((l) => l.ingredient_id as string))];
    const [{ data: ings }, { data: arts }, { data: offs }] = await Promise.all([
      inChunks<Fiche>(ids, (b) => supabase.from("ingredients").select("id, name, status, is_active, category, sub_category, default_unit, default_supplier_id, purchase_price, purchase_unit, purchase_unit_label, piece_weight_g, piece_volume_ml, density_g_per_ml").in("id", b)),
      inChunks<ArticleFournisseur & { ingredient_id: string }>(ids, (b) => supabase.from("commande_articles").select("ingredient_id, supplier_id, unite_commande, contenu_nb, element, element_qte, element_unite, commande_element_permise, precommande").in("ingredient_id", b)),
      inChunks<OffreValo & OffreActive & { ingredient_id: string }>(ids, (b) => supabase.from("supplier_offers").select("ingredient_id, supplier_id, is_active, valid_from, valid_to, created_at, unit, unit_price, pack_price, pack_count, pack_each_qty, pack_each_unit, pack_total_qty, pack_unit, price_kind, piece_weight_g, density_kg_per_l").in("ingredient_id", b)),
    ]);
    const ficheDe: Record<string, Fiche> = {};
    for (const f of ings) ficheDe[f.id] = f;
    const artDe: Record<string, ArticleFournisseur[]> = {};
    for (const a of arts) (artDe[a.ingredient_id] ??= []).push(a);
    const offDe: Record<string, (OffreValo & OffreActive)[]> = {};
    for (const o of offs) (offDe[o.ingredient_id] ??= []).push(o);
    const liste = ((ls ?? []) as Omit<Ligne, "nom" | "aVerifier" | "inactive">[]).map((l) => {
      const f = ficheDe[l.ingredient_id];
      return { ...l, nom: f?.name ?? l.nom_feuille ?? "?", aVerifier: f?.status === "to_check", inactive: !f || f.is_active === false };
    });
    setInv(invRow);
    setEtabNom((e?.nom as string | undefined) ?? "");
    setEtabSlug((e?.slug as string | undefined) ?? "");
    const nomsZones = (z ?? []).map((x) => x.name as string);
    setZones(nomsZones);
    setLignes(liste);
    setFiches(ficheDe); setArticles(artDe); setOffres(offDe);
    // Colis unique (contenu 1) : un seul champ, « colis » ; sans conditionnement : un seul champ, « unités ».
    // Une quantité déjà enregistrée ailleurs (ancien inventaire) est reportée dans le champ affiché.
    setSaisies(Object.fromEntries(liste.map((l) => {
      const ancienne = l.colis == null && l.unites == null && l.quantite > 0 ? l.quantite : null;
      if (l.cond_contenu != null && l.cond_contenu <= 1) return [l.id, { colis: txt(l.colis ?? l.unites ?? ancienne), unites: "" }];
      if (l.cond_contenu == null) return [l.id, { colis: "", unites: txt(l.unites ?? l.colis ?? ancienne) }];
      return [l.id, { colis: txt(l.colis), unites: txt(l.unites ?? ancienne) }];
    })));
    setZone((cur) => cur ?? nomsZones.find((n) => liste.some((l) => l.zone === n)) ?? nomsZones[0] ?? null);
  }, [id]);

  useEffect(() => { void charger(); }, [charger]);

  const lectureSeule = !inv || inv.statut === "cloture";

  const parZone = useMemo(() => {
    const m = new Map<string, Ligne[]>();
    for (const l of lignes) { const a = m.get(l.zone) ?? []; a.push(l); m.set(l.zone, a); }
    return m;
  }, [lignes]);
  const compte = (l: Ligne) => { const s = saisies[l.id]; return !!s && (s.colis.trim() !== "" || s.unites.trim() !== ""); };

  /** Conditionnement de commande de la fiche (pour compter par colis) et coût d'une unité comptée */
  const condProduit = useCallback((l: Ligne): Conditionnement | null => {
    const f = fiches[l.ingredient_id];
    if (!f) return null;
    return choisirConditionnement(f.default_supplier_id, articles[l.ingredient_id] ?? [], offres[l.ingredient_id] ?? []);
  }, [fiches, articles, offres]);
  const coutDe = useCallback((l: Ligne) => {
    const f = fiches[l.ingredient_id];
    if (!f) return { cout: null, source: null, raison: "fiche supprimée" };
    return coutUniteComptee(l.unite, f, offres[l.ingredient_id] ?? []);
  }, [fiches, offres]);

  /** Enregistre une ligne 500 ms après la dernière frappe */
  function saisir(l: Ligne, champ: keyof Saisie, valeur: string) {
    if (lectureSeule) return;
    const v = valeur.replace(/[^0-9.,]/g, "");
    setSaisies((s) => ({ ...s, [l.id]: { ...(s[l.id] ?? { colis: "", unites: "" }), [champ]: v } }));
    setEtatLigne((e) => ({ ...e, [l.id]: "attente" }));
    const t = minuteries.current.get(l.id);
    if (t) clearTimeout(t);
    minuteries.current.set(l.id, setTimeout(() => void enregistrer(l.id), 500));
  }
  const saisiesRef = useRef(saisies);
  useEffect(() => { saisiesRef.current = saisies; }, [saisies]);
  const lignesRef = useRef(lignes);
  useEffect(() => { lignesRef.current = lignes; }, [lignes]);

  async function enregistrer(ligneId: string) {
    minuteries.current.delete(ligneId);
    const l = lignesRef.current.find((x) => x.id === ligneId);
    const s = saisiesRef.current[ligneId];
    if (!l || !s) return;
    const colis = num(s.colis), unites = num(s.unites);
    if ((colis != null && !(colis >= 0)) || (unites != null && !(unites >= 0))) { setEtatLigne((e) => ({ ...e, [ligneId]: "erreur" })); return; }
    const total = totalLigne(colis, unites, l.cond_contenu);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("inventaire_lignes").update({
      colis, unites, quantite: total ?? 0, saisi_par: u.user?.id ?? null, updated_at: new Date().toISOString(),
    }).eq("id", ligneId);
    setEtatLigne((e) => ({ ...e, [ligneId]: error ? "erreur" : "ok" }));
    if (error) setMessage(`Pas enregistré : ${error.message}`);
  }

  // En quittant la page : ce qui attend part tout de suite
  useEffect(() => () => { for (const [lid, t] of minuteries.current) { clearTimeout(t); void enregistrer(lid); } }, []);

  async function action(nom: string, corps: Record<string, unknown>, succes: (j: Record<string, unknown>) => string) {
    setEnCours(nom); setMessage(null);
    try {
      const res = await fetchApi(`/api/inventaires/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setMessage(json.error ?? `Erreur ${res.status}`); return json; }
      setMessage(succes(json));
      await charger();
      return json;
    } finally { setEnCours(null); }
  }

  async function importer(f: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
    const tableau = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: "" });
    const json = await action("import", { action: "importer", tableau }, (j) =>
      `${j.lignes} lignes importées${Number(j.sans_conditionnement) ? `, dont ${j.sans_conditionnement} sans conditionnement (unités seulement)` : ""}.`);
    const errs = (json?.erreurs as string[] | undefined) ?? [];
    if (errs.length) setMessage((m) => `${m ?? ""} ${errs.length} remarque(s) : ${errs.slice(0, 5).join(" ; ")}${errs.length > 5 ? " ; …" : ""}`);
  }

  async function cloturer() {
    const restant = lignes.filter((l) => !l.retiree && !compte(l)).length;
    for (const [lid, t] of minuteries.current) { clearTimeout(t); await enregistrer(lid); }
    if (!confirm(`Clôturer l'inventaire ?${restant ? `\n${restant} ligne(s) non comptée(s) : elles resteront vides.` : ""}\nIl ne sera plus modifiable (sauf réouverture par un admin).`)) return;
    await action("cloture", { action: "cloturer" }, (j) => j.avertissement ? String(j.avertissement)
      : `Inventaire clôturé : ${Number(j.total ?? 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} € HT${Number(j.sans_prix) ? `, ${j.sans_prix} ligne(s) sans prix` : ""} (${j.mouvements} produits dans les mouvements de stock).`);
  }

  /** Compter par colis (conditionnement de la fiche) ou à l'unité ; les quantités déjà saisies sont converties */
  async function basculerComptage(l: Ligne) {
    if (lectureSeule) return;
    const t = minuteries.current.get(l.id);
    if (t) { clearTimeout(t); await enregistrer(l.id); }
    const s = saisiesRef.current[l.id] ?? { colis: "", unites: "" };
    const totalActuel = totalLigne(num(s.colis), num(s.unites), l.cond_contenu);
    const c = condProduit(l);
    const parColis = !(l.cond_contenu != null && l.cond_contenu > 1);
    let maj: Partial<Ligne>;
    if (parColis) {
      if (!c || c.contenu <= 1) return;
      maj = { cond_contenu: c.contenu, cond_libelle: c.libelle, unite: c.unite, colis: null, unites: totalActuel };
    } else {
      const f = fiches[l.ingredient_id];
      maj = { cond_contenu: null, cond_libelle: null, unite: uniteFiche(f?.default_unit), colis: null, unites: totalActuel };
    }
    const { error } = await supabase.from("inventaire_lignes").update({ ...maj, quantite: totalActuel ?? 0, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, ...maj } : x)));
    setSaisies((prev) => ({ ...prev, [l.id]: maj.cond_contenu != null && maj.cond_contenu > 1 ? { colis: "", unites: txt(totalActuel) } : { colis: "", unites: txt(totalActuel) } }));
  }

  async function retirer(l: Ligne, remettre = false) {
    if (lectureSeule) return;
    const { error } = await supabase.from("inventaire_lignes").update({ retiree: !remettre, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, retiree: !remettre } : x)));
  }

  /** Retire (ou remet) toutes les lignes d'une famille dans la zone, sans toucher aux fiches */
  async function retirerFamille(z: string, fam: string | null, remettre = false) {
    if (lectureSeule) return;
    const cibles = lignes.filter((l) => l.zone === z && (l.famille ?? null) === fam && l.retiree === remettre);
    if (!cibles.length) return;
    if (!remettre && !confirm(`Retirer les ${cibles.length} produits de « ${fam ?? "Sans famille"} » de la zone ${libelleZone(z)} ?\nIls restent dans « retirés » et peuvent être remis.`)) return;
    const ids = cibles.map((l) => l.id);
    const { error } = await supabase.from("inventaire_lignes").update({ retiree: !remettre, updated_at: new Date().toISOString() }).in("id", ids);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (ids.includes(x.id) ? { ...x, retiree: !remettre } : x)));
    setMessage(`${cibles.length} produit(s) ${remettre ? "remis" : "retiré(s)"} (${fam ?? "Sans famille"}).`);
  }

  async function changerZone(l: Ligne, nouvelle: string) {
    if (lectureSeule || nouvelle === l.zone) return;
    const { error } = await supabase.from("inventaire_lignes").update({ zone: nouvelle, updated_at: new Date().toISOString() }).eq("id", l.id);
    if (error) { setMessage(`Pas enregistré : ${error.message}`); return; }
    setLignes((prev) => prev.map((x) => (x.id === l.id ? { ...x, zone: nouvelle } : x)));
  }

  async function ajouterZone() {
    if (!inv) return;
    const nom = prompt("Nom de la nouvelle zone (ex. RÉSERVE, FRIGO BAR) :")?.trim().toUpperCase();
    if (!nom) return;
    if (zones.some((z) => normNom(z) === normNom(nom))) { setMessage("Cette zone existe déjà."); return; }
    const { error } = await supabase.from("storage_zones").insert({ name: nom, etablissement_id: inv.etablissement_id, display_order: zones.length + 1, supplier_ids: [], category_slugs: [] });
    if (error) { setMessage(error.message); return; }
    setZones((z) => [...z, nom]);
    setZone(nom);
    setMessage(`Zone « ${libelleZone(nom)} » ajoutée.`);
  }

  /** Carte d'une ligne : nom, détail du conditionnement et du prix, champs de saisie */
  const carte = (l: Ligne) => {
    const s = saisies[l.id] ?? { colis: "", unites: "" };
    const contenu = l.cond_contenu;
    const deuxChamps = contenu != null && contenu > 1;
    const total = totalLigne(num(s.colis), num(s.unites), contenu);
    const etat = etatLigne[l.id];
    const c = condProduit(l);
    const peutColis = !!c && c.contenu > 1;
    const valo = coutDe(l);
    const f = fiches[l.ingredient_id];
    const detailPiece = f?.piece_weight_g ? `${f.piece_weight_g >= 1000 ? `${txt(f.piece_weight_g / 1000)} kg` : `${txt(f.piece_weight_g)} g`} la pièce` : f?.piece_volume_ml ? `${f.piece_volume_ml >= 1000 ? `${txt(f.piece_volume_ml / 1000)} L` : `${txt(f.piece_volume_ml)} mL`} la pièce` : null;
    return (
      <React.Fragment key={l.id}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", marginBottom: 4, borderRadius: 10,
                  background: "#fff", border: `1px solid ${compte(l) ? "#cfe3d6" : "#ece6db"}`,
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", lineHeight: 1.25, display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "#b0a894", fontWeight: 500, fontSize: 12 }}>{l.ordre ?? ""}</span>
                      <span style={{ minWidth: 0 }}>{l.nom_feuille ?? l.nom}</span>
                      {f && (
                        <a href={`/ingredients?edit=${l.ingredient_id}&back=${encodeURIComponent(`/inventaire/${id}`)}`} title="Modifier la fiche produit (prix, conditionnement, zone)"
                          onClick={(e) => e.stopPropagation()} style={{ fontSize: 12, color: "#8a8378", textDecoration: "none", border: "1px solid #ddd6c8", borderRadius: 6, padding: "0 5px", lineHeight: "18px", flexShrink: 0 }}>✎</a>
                      )}
                    </div>
                    {l.nom_feuille && normNom(l.nom_feuille) !== normNom(l.nom) && (
                      <div style={{ fontSize: 11.5, color: "#a79f90", marginTop: 1 }}>fiche : {l.nom}</div>
                    )}
                    {(l.rattachement === "approché" || l.rattachement === "rattaché par ressemblance" || l.aVerifier || l.inactive) && (
                      <span style={{
                        display: "inline-block", marginTop: 3, marginRight: 4, fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
                        background: l.inactive ? "#fde7e7" : l.aVerifier ? "#fde7ef" : "#fdf3d4", color: l.inactive ? "#a12b2b" : l.aVerifier ? "#b0306a" : "#8a6a12",
                      }}>{l.inactive ? (f ? "fiche désactivée" : "fiche supprimée") : l.aVerifier ? "fiche à vérifier" : "rattaché par ressemblance"}</span>
                    )}
                    <div style={{ fontSize: 12, color: "#8a8378", marginTop: 2 }}>
                      {deuxChamps ? l.cond_libelle : `compté en ${l.cond_libelle ?? l.unite ?? "unités"}`}
                      {total != null && <> · <strong style={{ color: "#1a1a1a" }}>{txt(total)} {pluriel(l.unite, total)}</strong></>}
                      {total != null && valo.cout != null && <span style={{ color: "#6f6656" }}> · {eur(total * valo.cout)}</span>}
                    </div>
                    {/* Détail du conditionnement et du prix : pour ne pas se tromper de comptage */}
                    <div style={{ fontSize: 11, color: "#8a8378", marginTop: 2, display: "flex", flexWrap: "wrap", gap: "2px 8px", alignItems: "center" }}>
                      {c && <span>fiche : <strong style={{ color: "#6f6656" }}>{c.libelle}</strong></span>}
                      {detailPiece && <span>{detailPiece}</span>}
                      <span style={{ color: valo.cout == null ? "#b45309" : "#6f6656" }}>
                        {valo.cout == null ? `sans prix${valo.raison ? ` (${valo.raison})` : ""}` : `${eur(valo.cout)} / ${l.unite ?? "unité"}${valo.source === "ancienne_offre" ? " (ancien prix)" : ""}`}
                      </span>
                      {!lectureSeule && (
                        <>
                          {peutColis && (
                            <button type="button" onClick={() => void basculerComptage(l)} style={lien}>
                              {deuxChamps ? "compter à l'unité" : `compter par ${c!.libelle.split(" ")[0]}`}
                            </button>
                          )}
                          <select value={l.zone} onChange={(e) => void changerZone(l, e.target.value)} title="Déplacer vers une autre zone"
                            style={{ fontSize: 11, border: "none", background: "transparent", color: "#8a8378", cursor: "pointer", padding: 0 }}>
                            {zones.map((z) => <option key={z} value={z}>→ {libelleZone(z)}</option>)}
                          </select>
                          <button type="button" onClick={() => void retirer(l)} title="Retirer de la liste (la fiche n'est pas touchée)" style={{ ...lien, color: "#a12b2b" }}>retirer</button>
                        </>
                      )}
                    </div>
                  </div>
                  {contenu != null && (
                    <Champ etiquette={deuxChamps ? "colis" : l.unite ?? "colis"} valeur={s.colis} desactive={lectureSeule}
                      onChange={(v) => saisir(l, "colis", v)} />
                  )}
                  {(deuxChamps || contenu == null) && (
                    <Champ etiquette={contenu == null ? l.unite ?? "unités" : "unités"} valeur={s.unites} desactive={lectureSeule}
                      onChange={(v) => saisir(l, "unites", v)} />
                  )}
                  <span title={etat === "erreur" ? "Pas enregistré" : etat === "attente" ? "Enregistrement…" : "Enregistré"} style={{
                    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
                    background: etat === "erreur" ? "#DC2626" : etat === "attente" ? "#e0b44c" : etat === "ok" ? "#2D6A4F" : "transparent",
                  }} />
                </div>
      </React.Fragment>
    );
  };

  if (erreur) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#8a2b2b" }}>{erreur}</div>;
  if (!inv) return <div style={{ maxWidth: 900, margin: "0 auto", padding: 24, color: "#999" }}>Chargement…</div>;

  const lignesZoneToutes = zone ? parZone.get(zone) ?? [] : [];
  const lignesZone = lignesZoneToutes.filter((l) => !l.retiree);
  const retireesZone = lignesZoneToutes.filter((l) => l.retiree);
  const actives = lignes.filter((l) => !l.retiree);
  const totalComptees = actives.filter(compte).length;
  const aDesSaisies = totalComptees > 0;
  const valeurZone = lignesZone.reduce((t, l) => {
    const s = saisies[l.id]; const q = s ? totalLigne(num(s.colis), num(s.unites), l.cond_contenu) : null;
    const c = coutDe(l).cout;
    return t + (q != null && c != null ? q * c : 0);
  }, 0);

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "16px 12px 80px" }}>
      <button type="button" onClick={() => router.push("/inventaire")} style={{ border: "none", background: "none", color: "#8a8378", fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 8 }}>
        ← Inventaires
      </button>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontSize: 22, margin: 0 }}>Inventaire au {fmtDate(inv.date)}</h1>
          <div style={{ fontSize: 13, color: "#6f6656", marginTop: 2 }}>
            {etabNom} · {inv.type === "fin_exercice" ? "Fin d'exercice" : "Mensuel"} ·{" "}
            <span style={{ fontWeight: 700, color: inv.statut === "cloture" ? "#2D6A4F" : ACCENT }}>{inv.statut === "cloture" ? "Clôturé" : "En cours"}</span>
            {" "}· {totalComptees} / {actives.length} lignes comptées
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {!lectureSeule && !aDesSaisies && (
            <>
              <input ref={fichierRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void importer(f); }} />
              <button type="button" disabled={!!enCours} onClick={() => fichierRef.current?.click()} style={bouton("#fff", "#1a1a1a")}>
                {enCours === "import" ? "Import…" : lignes.length ? "Remplacer par la feuille (fichier)" : "Importer la feuille (fichier)"}
              </button>
            </>
          )}
          {lignes.length > 0 && (
            <button type="button" onClick={() => openApiFile(`/api/inventaire/pdf?id=${id}`)} style={bouton("#fff", "#1a1a1a")} title="Export comptable : valorisation HT par zone, famille et catégorie">
              PDF comptable
            </button>
          )}
          {!lectureSeule && lignes.length > 0 && (
            <button type="button" disabled={!!enCours} onClick={() => void cloturer()} style={bouton(ACCENT, "#fff")}>
              {enCours === "cloture" ? "Clôture…" : "Clôturer"}
            </button>
          )}
          {inv.statut === "cloture" && isGroupAdmin && (
            <button type="button" disabled={!!enCours} onClick={() => { if (confirm("Rouvrir cet inventaire ? Il redevient modifiable ; les mouvements de stock seront refaits à la prochaine clôture.")) void action("rouvrir", { action: "rouvrir" }, () => "Inventaire rouvert."); }}
              style={bouton("#fff", "#b45309")}>Rouvrir (admin)</button>
          )}
        </div>
      </div>

      {message && <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 10, background: "#fff", border: "1px solid #ddd6c8", fontSize: 13 }}>{message}</div>}

      {lignes.length === 0 ? (
        <div style={{ marginTop: 20, padding: 20, background: "#fff", borderRadius: 14, border: "1px solid #ddd6c8", fontSize: 14, color: "#6f6656" }}>
          Pas encore de lignes. Importe le fichier de la feuille (colonnes : zone, famille, nom, identifiant de la fiche), ou ajoute des produits zone par zone.
        </div>
      ) : null}

      {/* Zones, dans l'ordre des feuilles */}
      <div className="inventaire-zones" style={{ display: "flex", gap: 6, overflowX: "auto", scrollbarWidth: "none", margin: "14px 0 10px", padding: "6px 0", position: "sticky", top: 0, zIndex: 5, background: "#f2ede4" }}>
        {zones.map((z) => {
          const ls = (parZone.get(z) ?? []).filter((l) => !l.retiree);
          const n = ls.filter(compte).length;
          const actif = z === zone;
          return (
            <button key={z} type="button" onClick={() => setZone(z)} style={{
              flexShrink: 0, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
              border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#fff", color: actif ? ACCENT : "#1a1a1a",
            }}>
              {libelleZone(z)} <span style={{ fontWeight: 500, color: n === ls.length && ls.length ? "#2D6A4F" : "#999" }}>{n}/{ls.length}</span>
            </button>
          );
        })}
        {!lectureSeule && (
          <button type="button" onClick={() => void ajouterZone()} title="Ajouter une zone de stockage" style={{
            flexShrink: 0, padding: "8px 12px", borderRadius: 999, cursor: "pointer", fontSize: 13, fontWeight: 700, border: "1px dashed #b0a894", background: "#fff", color: "#6f6656",
          }}>+ zone</button>
        )}
      </div>

      {zone && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "0 4px 6px" }}>
            <span style={{ fontSize: 12.5, color: "#6f6656" }}>
              {lignesZone.length} produit{lignesZone.length > 1 ? "s" : ""}{valeurZone > 0 ? <> · valeur comptée <strong style={{ color: "#1a1a1a" }}>{eur(valeurZone)}</strong> HT</> : null}
            </span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {(() => {
                const familles = [...new Set(lignesZone.map((l) => l.famille ?? null))];
                const estOuverte = (f: string | null) => bascules[cleFamille(zone, f)] ?? lignesZone.some((l) => (l.famille ?? null) === f && compte(l));
                const toutesFermees = familles.length > 0 && familles.every((f) => !estOuverte(f));
                return (
                  <button type="button" onClick={() => setBascules((b) => { const n = { ...b }; for (const f of familles) n[cleFamille(zone, f)] = toutesFermees; return n; })} style={lien}>
                    {toutesFermees ? "tout déplier" : "tout replier"}
                  </button>
                );
              })()}
              {!lectureSeule && (
                <button type="button" onClick={() => setModaleAjout(true)} style={{ ...bouton("#fff", ACCENT), height: 34, fontSize: 12.5 }}>+ Ajouter</button>
              )}
            </div>
          </div>

          {(() => {
            // Famille (ordre de la feuille) → sous-catégorie de la fiche (ordre de première apparition) → lignes
            const familles: { famille: string | null; sous: { nom: string | null; lignes: Ligne[] }[]; lignes: Ligne[] }[] = [];
            for (const l of lignesZone) {
              let fam = familles.find((x) => (x.famille ?? null) === (l.famille ?? null));
              if (!fam) { fam = { famille: l.famille ?? null, sous: [], lignes: [] }; familles.push(fam); }
              fam.lignes.push(l);
              const sc = fiches[l.ingredient_id]?.sub_category ?? null;
              let g = fam.sous.find((x) => (x.nom ?? null) === sc);
              if (!g) { g = { nom: sc, lignes: [] }; fam.sous.push(g); }
              g.lignes.push(l);
            }
            return familles.map((fam, i) => {
              const compteesFamille = fam.lignes.filter(compte).length;
              const ouverte = bascules[cleFamille(zone, fam.famille)] ?? compteesFamille > 0;
              const plusieursSous = fam.sous.length > 1 || (fam.sous.length === 1 && fam.sous[0].nom != null);
              return (
                <div key={fam.famille ?? "∅"} style={{ margin: `${i === 0 ? 4 : 10}px 0 6px` }}>
                  {/* Titre de famille : fond plein, texte blanc, même charte que les rayons de l'écran de commande */}
                  <button type="button" onClick={() => setBascules((b) => ({ ...b, [cleFamille(zone, fam.famille)]: !ouverte }))} aria-expanded={ouverte} style={{
                    width: "100%", minHeight: 52, display: "flex", alignItems: "center", gap: 10, padding: "0 14px",
                    background: couleurFamille(fam.famille), border: "none", borderRadius: 14, cursor: "pointer", textAlign: "left", touchAction: "manipulation",
                    boxShadow: "0 2px 6px rgba(0,0,0,0.12)", fontFamily: "inherit",
                  }}>
                    <span style={{ flex: 1, fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: "0.04em", color: "#fff" }}>
                      {fam.famille ?? "Sans famille"} <span style={{ opacity: 0.75, fontWeight: 400 }}>({fam.lignes.length})</span>
                    </span>
                    {compteesFamille > 0 && (
                      <span style={{ fontSize: 12, fontWeight: 700, color: couleurFamille(fam.famille), background: "#fff", borderRadius: 10, padding: "3px 8px" }}>{compteesFamille}{compteesFamille === fam.lignes.length ? " ✓" : ""}</span>
                    )}
                    <span style={{ color: "#fff", fontSize: 13, transform: ouverte ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
                  </button>
                  {ouverte && !lectureSeule && (
                    <div style={{ textAlign: "right", margin: "4px 6px 2px" }}>
                      <button type="button" onClick={() => void retirerFamille(zone, fam.famille)} title="Retirer toute la famille de cette zone" style={{ ...lien, color: "#a12b2b" }}>retirer la famille de cette zone</button>
                    </div>
                  )}
                  {ouverte && fam.sous.map((g) => {
                    const cleSous = `${cleFamille(zone, fam.famille)}|${g.nom ?? ""}`;
                    const sousOuverte = bascules[cleSous] ?? true;
                    const compteesSous = g.lignes.filter(compte).length;
                    return (
                      <div key={g.nom ?? "∅"} style={{ marginTop: 6 }}>
                        {plusieursSous && (
                          /* Sous-catégorie : accordéon clair, comme dans le menu produits */
                          <button type="button" onClick={() => setBascules((b) => ({ ...b, [cleSous]: !sousOuverte }))} aria-expanded={sousOuverte} style={{
                            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
                            padding: "9px 12px", background: sousOuverte ? "#f0ebe3" : "#fff", border: "1.5px solid #e5ddd0",
                            borderRadius: sousOuverte ? "8px 8px 0 0" : 8, cursor: "pointer", marginBottom: sousOuverte ? 0 : 4,
                            fontSize: 11, fontWeight: 700, color: "#8a7e6b", textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "inherit",
                          }}>
                            <span>{g.nom ?? "Autre"} <span style={{ fontWeight: 500, opacity: 0.8 }}>({g.lignes.length})</span></span>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              {compteesSous > 0 && <span style={{ fontSize: 10.5, color: compteesSous === g.lignes.length ? "#2D6A4F" : "#8a7e6b" }}>{compteesSous}/{g.lignes.length}</span>}
                              <span style={{ fontSize: 10, transition: "transform 0.2s", transform: sousOuverte ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
                            </span>
                          </button>
                        )}
                        {sousOuverte && (
                          <div style={plusieursSous ? { padding: "6px 6px 2px", background: "#fff", border: "1.5px solid #e5ddd0", borderTop: "none", borderRadius: "0 0 8px 8px", marginBottom: 4 } : undefined}>
                            {g.lignes.map((l) => carte(l))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            });
          })()}

          {retireesZone.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={() => setVoirRetirees((v) => !v)} style={{ ...lien, fontSize: 12.5 }}>
                {voirRetirees ? "▾" : "▸"} {retireesZone.length} produit{retireesZone.length > 1 ? "s" : ""} retiré{retireesZone.length > 1 ? "s" : ""} de la liste
              </button>
              {voirRetirees && !lectureSeule && (
                <button type="button" onClick={() => { for (const f of new Set(retireesZone.map((l) => l.famille ?? null))) void retirerFamille(zone, f, true); }} style={{ ...lien, color: "#2D6A4F", marginLeft: 10 }}>tout remettre</button>
              )}
              {voirRetirees && retireesZone.map((l) => (
                <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 13, color: "#8a8378", background: "#faf7f2", borderRadius: 8, marginTop: 4 }}>
                  <span style={{ flex: 1, textDecoration: "line-through" }}>{l.nom_feuille ?? l.nom}</span>
                  {!lectureSeule && <button type="button" onClick={() => void retirer(l, true)} style={{ ...lien, color: "#2D6A4F" }}>remettre</button>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {modaleAjout && zone && inv && (
        <ModaleAjout zone={zone} etabId={inv.etablissement_id} etabCle={cleEtab(etabSlug)} dejaLa={new Set(lignesZone.map((l) => l.ingredient_id))}
          enCours={!!enCours} onClose={() => setModaleAjout(false)}
          onAjouter={async (ids) => { await action("ajout", { action: "ajouter", ingredient_ids: ids, zone }, (j) => `${j.ajoutes} produit(s) ajouté(s) dans ${libelleZone(zone)}${Number(j.deja_la) ? `, ${j.deja_la} déjà présent(s)` : ""}.`); }}
          onCreer={async (nom, categorie) => { await action("creation", { action: "creer", nom, categorie, zone }, () => `Fiche « ${nom} » créée (à vérifier) et ajoutée dans ${libelleZone(zone)}.`); }}
        />
      )}
    </div>
  );
}

/** Ajout de produits dans la zone : recherche, filtre par catégorie, sélection multiple, création rapide */
function ModaleAjout({ zone, etabId, etabCle, dejaLa, enCours, onClose, onAjouter, onCreer }: {
  zone: string; etabId: string; etabCle: string | null; dejaLa: Set<string>; enCours: boolean; onClose: () => void;
  onAjouter: (ids: string[]) => Promise<void>; onCreer: (nom: string, categorie: string) => Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"" | Category>("");
  const [resultats, setResultats] = useState<{ id: string; name: string; category: string | null }[]>([]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [catCreation, setCatCreation] = useState<Category>("epicerie_salee");
  const [mode, setMode] = useState<"produits" | "categorie" | "fournisseur">("produits");
  const [fournisseurs, setFournisseurs] = useState<{ id: string; name: string }[]>([]);
  const [fournisseurId, setFournisseurId] = useState("");
  const [lot, setLot] = useState<{ id: string; name: string }[] | null>(null);

  // Fournisseurs de l'établissement (ajout d'un fournisseur entier dans la zone)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("suppliers").select("id, name").eq("etablissement_id", etabId).eq("is_active", true).order("name");
      setFournisseurs((data ?? []) as { id: string; name: string }[]);
    })();
  }, [etabId]);

  // Lot à ajouter : tous les produits d'une catégorie, ou tous les produits achetés chez un fournisseur (offres actives + fournisseur de la fiche)
  useEffect(() => {
    (async () => {
      setLot(null);
      if (mode === "categorie" && cat) {
        let req = supabase.from("ingredients").select("id, name").eq("is_active", true).eq("category", cat).order("name").limit(1000);
        if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
        const { data } = await req;
        setLot((data ?? []) as { id: string; name: string }[]);
      } else if (mode === "fournisseur" && fournisseurId) {
        const [{ data: offs }, { data: directs }] = await Promise.all([
          supabase.from("supplier_offers").select("ingredient_id").eq("supplier_id", fournisseurId).eq("is_active", true).limit(2000),
          supabase.from("ingredients").select("id").eq("supplier_id", fournisseurId).eq("is_active", true).limit(1000),
        ]);
        const ids = [...new Set([...(offs ?? []).map((o) => o.ingredient_id as string), ...(directs ?? []).map((d) => d.id as string)])];
        if (!ids.length) { setLot([]); return; }
        const { data: ings } = await inChunks<{ id: string; name: string }>(ids, (b) => {
          let req = supabase.from("ingredients").select("id, name").in("id", b).eq("is_active", true);
          if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
          return req;
        });
        setLot(ings.sort((a, b) => a.name.localeCompare(b.name, "fr")));
      }
    })();
  }, [mode, cat, fournisseurId, etabCle]);

  useEffect(() => {
    const t = setTimeout(async () => {
      let req = supabase.from("ingredients").select("id, name, category").eq("is_active", true).order("name").limit(80);
      if (etabCle) req = req.or(`establishments.cs.{"${etabCle}"},establishments.is.null`);
      if (q.trim().length >= 2) req = req.ilike("name", `%${q.trim()}%`);
      if (cat) req = req.eq("category", cat);
      if (q.trim().length < 2 && !cat) { setResultats([]); return; }
      const { data } = await req;
      setResultats((data ?? []) as { id: string; name: string; category: string | null }[]);
    }, 250);
    return () => clearTimeout(t);
  }, [q, cat, etabCle]);

  const exact = resultats.some((r) => normNom(r.name) === normNom(q));
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: "16px 16px 0 0", width: "100%", maxWidth: 900, maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 -8px 30px rgba(0,0,0,0.2)" }}>
        <div style={{ padding: "14px 16px 8px" }}>
          <div style={{ fontFamily: OSWALD, fontSize: 16, fontWeight: 700 }}>Ajouter dans « {libelleZone(zone)} »</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {([["produits", "Produits"], ["categorie", "Catégorie entière"], ["fournisseur", "Fournisseur entier"]] as const).map(([m, l]) => (
              <button key={m} type="button" onClick={() => setMode(m)} style={puce(mode === m)}>{l}</button>
            ))}
          </div>
          {mode === "produits" && (
            <input autoFocus type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans la base produits…"
              style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 12px", fontSize: 15, boxSizing: "border-box", marginTop: 8 }} />
          )}
          {mode !== "fournisseur" && (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", marginTop: 8, paddingBottom: 4 }}>
              {mode === "produits" && <button type="button" onClick={() => setCat("")} style={puce(cat === "")}>Toutes</button>}
              {CATEGORIES.map((c) => <button key={c} type="button" onClick={() => setCat(c === cat ? "" : c)} style={puce(cat === c)}>{CAT_LABELS[c]}</button>)}
            </div>
          )}
          {mode === "fournisseur" && (
            <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)} style={{ width: "100%", height: 42, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 10px", fontSize: 15, background: "#fff", marginTop: 8 }}>
              <option value="">— Choisir un fournisseur —</option>
              {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
          {mode !== "produits" && (
            lot == null ? <div style={{ fontSize: 13, color: "#999", padding: 12 }}>{(mode === "categorie" && !cat) || (mode === "fournisseur" && !fournisseurId) ? "Choisis une catégorie ou un fournisseur." : "Chargement…"}</div>
            : (() => {
              const nouveaux = lot.filter((x) => !dejaLa.has(x.id));
              return (
                <div style={{ padding: "8px 0" }}>
                  <div style={{ fontSize: 13, marginBottom: 8 }}>
                    <strong>{lot.length}</strong> produit{lot.length > 1 ? "s" : ""}, dont <strong>{nouveaux.length}</strong> pas encore dans la zone.
                  </div>
                  <button type="button" disabled={nouveaux.length === 0 || enCours} onClick={() => { void onAjouter(nouveaux.map((x) => x.id)).then(onClose); }}
                    style={{ ...bouton(ACCENT, "#fff"), opacity: nouveaux.length === 0 ? 0.5 : 1 }}>
                    Ajouter les {nouveaux.length} produits dans {libelleZone(zone)}
                  </button>
                  <div style={{ fontSize: 12, color: "#8a8378", marginTop: 10, lineHeight: 1.5 }}>{nouveaux.slice(0, 60).map((x) => x.name).join(" · ")}{nouveaux.length > 60 ? " · …" : ""}</div>
                </div>
              );
            })()
          )}
          {mode === "produits" && resultats.length === 0 && (q.trim().length >= 2 || cat) && <div style={{ fontSize: 13, color: "#999", padding: 12 }}>Aucun produit.</div>}
          {mode === "produits" && resultats.map((r) => {
            const present = dejaLa.has(r.id);
            return (
              <label key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px", borderBottom: "1px solid #f3efe7", opacity: present ? 0.5 : 1 }}>
                <input type="checkbox" disabled={present} checked={sel.has(r.id)} onChange={() => setSel((s) => { const n = new Set(s); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} style={{ width: 18, height: 18, accentColor: ACCENT }} />
                <span style={{ flex: 1, fontSize: 14 }}>{r.name}</span>
                <span style={{ fontSize: 11, color: "#999" }}>{present ? "déjà dans la zone" : CAT_LABELS[r.category as Category] ?? r.category}</span>
              </label>
            );
          })}
          {mode === "produits" && q.trim().length >= 2 && !exact && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, background: "rgba(45,106,79,0.06)", border: "1.5px dashed rgba(45,106,79,0.35)", margin: "8px 0", flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: 12.5 }}>Créer « <b>{q.trim()}</b> » (fiche à vérifier) dans</span>
              <select value={catCreation} onChange={(e) => setCatCreation(e.target.value as Category)} style={{ fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff" }}>
                {CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
              </select>
              <button type="button" disabled={enCours} onClick={() => { void onCreer(q.trim(), catCreation).then(onClose); }}
                style={{ padding: "7px 12px", borderRadius: 8, border: "none", background: "#2D6A4F", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Créer</button>
            </div>
          )}
        </div>
        <div style={{ padding: "10px 16px 16px", borderTop: "1px solid #f0ebe2", display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button type="button" onClick={onClose} style={bouton("#fff", "#1a1a1a")}>Fermer</button>
          {mode === "produits" && (
            <button type="button" disabled={sel.size === 0 || enCours} onClick={() => { void onAjouter([...sel]).then(onClose); }} style={{ ...bouton(ACCENT, "#fff"), opacity: sel.size === 0 ? 0.5 : 1 }}>
              Ajouter {sel.size > 0 ? `(${sel.size})` : ""}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Champ({ etiquette, valeur, desactive, onChange }: { etiquette: string; valeur: string; desactive: boolean; onChange: (v: string) => void }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, flexShrink: 0 }}>
      <input inputMode="decimal" value={valeur} disabled={desactive} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Entrée : champ suivant (saisie rapide de la feuille au clavier)
          if (e.key !== "Enter") return;
          e.preventDefault();
          const champs = [...document.querySelectorAll<HTMLInputElement>("input[inputmode=decimal]:not([disabled])")];
          champs[champs.indexOf(e.currentTarget) + 1]?.focus();
        }}
        style={{
          width: 64, height: 40, borderRadius: 10, border: "1.5px solid #ddd6c8", textAlign: "center", fontSize: 17, fontWeight: 700,
          background: desactive ? "#f3efe7" : "#fff", boxSizing: "border-box",
        }} />
      <span style={{ fontSize: 10.5, color: "#8a8378" }}>{etiquette}</span>
    </label>
  );
}

const lien: React.CSSProperties = { border: "none", background: "none", color: ACCENT, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "inherit" };
const puce = (actif: boolean): React.CSSProperties => ({
  flexShrink: 0, padding: "5px 10px", borderRadius: 999, fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  border: actif ? `1.5px solid ${ACCENT}` : "1px solid #ddd6c8", background: actif ? "#FFF0EB" : "#fff", color: actif ? ACCENT : "#6f6656",
});
const bouton = (bg: string, fg: string): React.CSSProperties => ({
  height: 40, padding: "0 14px", borderRadius: 10, border: bg === "#fff" ? "1px solid #ddd6c8" : "none", background: bg, color: fg,
  fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
});
