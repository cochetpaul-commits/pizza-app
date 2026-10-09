"use client";

import React, { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { CAT_COLORS, CAT_LABELS, type Category, type Ingredient, type IngredientStatus, type LatestOffer, type Supplier, type Tab } from "@/types/ingredients";
import type { StorageZoneOption } from "@/components/IngredientRow";
import type { PriceAlert } from "@/lib/priceAlerts";
import { formatIngredientPrice } from "@/lib/formatPrice";
import { legacyHasPrice, offerHasPrice } from "@/lib/offers";
import { cachedSupplierColor } from "@/lib/supplierColors";
import { couleurTexte, couleurTexteSur, styleBarreCategorie, styleSousCategorie } from "@/lib/styleCategories";
import { OSWALD } from "@/components/TuileProduit";
import { Tuile } from "@/components/ui/Tuile";
import Link from "next/link";
import { dateInventaire, fmtQte, type StockItem } from "@/lib/stockTypes";
import { EtatVide } from "@/components/ui/EtatVide";
import { articleDeFiche, type FicheConditionnement } from "@/lib/inventaire";
import { libelleColisage } from "@/lib/commandeArticles";

/**
 * Base produits (étape 3 de la refonte inspirée de ComandR, 08/10/2026), bureau et téléphone.
 * Liste plate de A à Z colorée par catégorie, tuiles qui changent de vue, filtres en menus déroulants,
 * et volet (à droite sur bureau, plein écran sur téléphone) pour paramétrer la fiche avec le
 * formulaire de l'application. Deux affichages : A → Z (liste plate) ou par catégorie (volets de
 * catégorie et de sous-catégorie, repliés sauf pendant une recherche). Sur téléphone (comme ComandR mobile) : tuiles sur deux colonnes,
 * filtres en petits menus alignés, même tableau que le bureau en trois colonnes (nom, prix + stock, chevron), fiche
 * en feuille qui monte du bas.
 */

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const ATTENTION = "#b7791f";
const MAUVAIS = "#b4443a";
const INFO = "#2563EB";
const BON = "#4a6741";

function Chip({ fond, couleur, children, title }: { fond: string; couleur: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", background: fond, color: couleur }}>
      {children}
    </span>
  );
}

const TH: CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, padding: "10px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 700, whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "9px 14px", borderBottom: `1px solid #ece6db`, verticalAlign: "middle", fontSize: 13 };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const FILTRE: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, height: 36, padding: "0 6px 0 12px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 12.5, color: MUTED };
const SELECT: CSSProperties = { border: "none", background: "transparent", fontWeight: 600, fontSize: 12.5, fontFamily: "inherit", color: "#1a1a1a", outline: "none", cursor: "pointer", maxWidth: 220 };

const nombre = (n: number) => n.toLocaleString("fr-FR");

// Affichage A → Z ou par catégorie, mémorisé sur l'appareil (store externe : pas de décalage à l'hydratation)
const CLE_AFFICHAGE = "produits:affichage";
const abonnesAffichage = new Set<() => void>();
// Par défaut : tableau plat de A à Z (décision du 09/10/2026) ; les accordéons par catégorie et sous-catégorie restent au choix
const lireAffichage = (): "az" | "cat" => { try { return localStorage.getItem(CLE_AFFICHAGE) === "cat" ? "cat" : "az"; } catch { return "az"; } };
const ecrireAffichage = (v: "az" | "cat") => { try { localStorage.setItem(CLE_AFFICHAGE, v); } catch { /* navigation privée */ } abonnesAffichage.forEach((f) => f()); };
const abonnerAffichage = (f: () => void) => { abonnesAffichage.add(f); return () => { abonnesAffichage.delete(f); }; };

function dateCourte(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/** Pastille d'état : seulement les exceptions (un produit en ordre n'en a pas ; 94 % des fiches sont validées) */
function etatFiche(x: Ingredient, aUnPrix: boolean): { libelle: string; fond: string; couleur: string } | null {
  if (x.is_active === false) return { libelle: "Désactivée", fond: "rgba(0,0,0,0.06)", couleur: "#999" };
  if (!aUnPrix) return { libelle: "Sans prix", fond: "rgba(180,68,58,0.12)", couleur: MAUVAIS };
  if (((x.status ?? "to_check") as IngredientStatus) !== "validated") return { libelle: "À contrôler", fond: "rgba(183,121,31,0.12)", couleur: ATTENTION };
  return null;
}

type LigneProps = {
  x: Ingredient;
  offer: LatestOffer | undefined;
  fournisseur: Supplier | null;
  alerte: PriceAlert | undefined;
  selectionnee: boolean;
  enEdition: boolean;
  peutEcrire: boolean;
  onOuvrir: (x: Ingredient) => void;
  onToggleSelect: (id: string) => void;
  onOpenSupplier: (id: string) => void;
  /** Vue par catégorie : la colonne Catégorie est portée par la barre au-dessus */
  sansCategorie?: boolean;
  stock?: StockItem | null;
  /** Interrupteur actif / inactif (bureau) : un produit inactif sort des listes, des commandes et du prochain inventaire */
  onToggleActif?: (x: Ingredient) => void;
};

function Interrupteur({ actif, onChange, titre }: { actif: boolean; onChange: () => void; titre: string }) {
  return (
    <button type="button" role="switch" aria-checked={actif} title={titre} onClick={(e) => { e.stopPropagation(); onChange(); }}
      style={{ width: 34, height: 20, borderRadius: 10, border: "none", padding: 2, background: actif ? "#4a6741" : "#d6d0c4", cursor: "pointer", position: "relative", transition: "background .15s", flexShrink: 0 }}>
      <span style={{ display: "block", width: 16, height: 16, borderRadius: "50%", background: "#fff", transform: actif ? "translateX(14px)" : "none", transition: "transform .15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
    </button>
  );
}

/** Cellule / pastille de stock : quantité et unité, rouge sous le minimum */
function Stock({ s, compact }: { s: StockItem | null | undefined; compact?: boolean }) {
  if (!s) return <span style={{ color: FAIBLE }}>—</span>;
  return (
    <span style={{ fontWeight: 700, color: s.alerte ? MAUVAIS : "#1a1a1a", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
      {fmtQte(s.stock)} <span style={{ fontWeight: 500, color: MUTED, fontSize: compact ? 11.5 : 12 }}>{s.unit ?? ""}</span>
      {!compact && s.stock_min != null && <div style={{ fontSize: 11.5, fontWeight: 500, color: s.alerte ? MAUVAIS : MUTED }}>{s.alerte ? "sous le minimum" : `min ${fmtQte(s.stock_min)}`}</div>}
    </span>
  );
}

/** Ce qu'une ligne (tableau bureau) ou une carte (téléphone) affiche d'un produit */
function affichageProduit(x: Ingredient, offer: LatestOffer | undefined) {
  const couleurCat = CAT_COLORS[x.category] ?? "#939597";
  const aUnPrix = offerHasPrice(offer, { piece_volume_ml: x.piece_volume_ml }) || legacyHasPrice(x);
  const article = articleDeFiche(x as unknown as FicheConditionnement);
  return {
    couleurCat,
    texteCat: couleurTexte(couleurCat),
    inactive: x.is_active === false,
    aUnPrix,
    prix: aUnPrix ? formatIngredientPrice(x, offer ?? null) : "—",
    colisage: article ? libelleColisage(article) : null,
    maj: dateCourte(offer?.updated_at),
    etat: etatFiche(x, aUnPrix),
  };
}

/** Ligne produit sur téléphone (10/10/2026, même gabarit que le tableau bureau en trois colonnes) :
 * liseré de la catégorie, case, nom + catégorie · sous-catégorie · fournisseur · zone + état, prix + stock à droite, chevron */
const LigneMobile = React.memo(function LigneMobile({ x, offer, fournisseur, alerte, selectionnee, enEdition, peutEcrire, onOuvrir, onToggleSelect, sansCategorie, stock }: LigneProps) {
  const a = affichageProduit(x, offer);
  const sous = [x.sub_category, fournisseur?.name, x.storage_zone].filter(Boolean).join(" · ");
  return (
    <tr id={`ing-${x.id}`} className={`bp-ligne${enEdition ? " on" : ""}`} onClick={() => onOuvrir(x)} style={{ cursor: "pointer" }}>
      <td style={{ ...TD, padding: 0, width: 4, background: a.couleurCat }} />
      {peutEcrire && (
        <td style={{ ...TD, width: 30, padding: "9px 0 9px 10px" }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selectionnee} onChange={() => onToggleSelect(x.id)} style={{ width: 15, height: 15, accentColor: a.couleurCat, cursor: "pointer", display: "block" }} />
        </td>
      )}
      <td style={{ ...TD, padding: "9px 8px 9px 10px" }}>
        <div style={{ fontWeight: 600, fontSize: 13.5, color: a.inactive ? "#999" : "#1a1a1a", lineHeight: 1.25 }}>
          {x.name}{x.is_derived && <span style={{ marginLeft: 6, fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED", verticalAlign: "middle" }}>DÉRIVÉ</span>}
        </div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2, display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          {a.etat && <Chip fond={a.etat.fond} couleur={a.etat.couleur}>{a.etat.libelle}</Chip>}
          <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {!sansCategorie && <span style={{ color: a.texteCat, fontWeight: 700 }}>{CAT_LABELS[x.category] ?? x.category}</span>}{sous ? (sansCategorie ? sous : ` · ${sous}`) : ""}
          </span>
        </div>
      </td>
      <td style={{ ...TD, padding: "9px 4px 9px 0", textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontWeight: 700, fontSize: 13, color: a.aUnPrix ? "#1a1a1a" : FAIBLE }}>{a.aUnPrix ? a.prix : "Aucun prix"}</div>
        <div style={{ fontSize: 11.5, color: MUTED, marginTop: 2 }}>
          {alerte ? <span style={{ fontWeight: 700, color: alerte.direction === "up" ? "#DC2626" : "#16A34A" }}>{alerte.direction === "up" ? "+" : "-"}{(Math.abs(alerte.change_pct) * 100).toFixed(0)} %</span>
            : stock ? <>stock <Stock s={stock} compact /></> : a.colisage}
        </div>
      </td>
      <td style={{ ...TD, padding: "9px 10px 9px 2px", width: 18, color: FAIBLE, fontSize: 18, textAlign: "right" }} aria-hidden>›</td>
    </tr>
  );
});

/** Barre de catégorie (maquette du 09/10/2026) : titre, nombre en léger, chevron ; pas de pastille. Ouverte : coins du bas droits. */
function BarreCategorie({ cat, couleur, n, ouverte, onToggle }: { cat: Category; couleur: string; n: number; ouverte: boolean; onToggle: (c: Category) => void }) {
  const texte = couleurTexteSur(couleur);
  return (
    <button type="button" onClick={() => onToggle(cat)} aria-expanded={ouverte} className={`barre-categorie${ouverte ? " ouverte" : ""}`}
      style={{ ...styleBarreCategorie(couleur), minHeight: 46, gap: 12, padding: "0 16px", boxShadow: "none", borderRadius: ouverte ? "14px 14px 0 0" : 14 }}>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: texte }}>{CAT_LABELS[cat] ?? cat}</span>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, color: texte, opacity: 0.7, marginLeft: -4, flex: 1 }}>{n}</span>
      <span style={{ color: texte, fontSize: 12, opacity: 0.85, transform: ouverte ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▼</span>
    </button>
  );
}

const LigneProduit = React.memo(function LigneProduit({ x, offer, fournisseur, alerte, selectionnee, enEdition, peutEcrire, onOuvrir, onToggleSelect, onOpenSupplier, sansCategorie, stock, onToggleActif }: LigneProps) {
  const { couleurCat, texteCat, inactive, aUnPrix, prix, colisage, maj, etat } = affichageProduit(x, offer);
  const sousProduit = [x.sub_category, maj ? `mis à jour le ${maj}` : null].filter(Boolean).join(" · ");

  return (
    <tr id={`ing-${x.id}`} className={`bp-ligne${enEdition ? " on" : ""}`} onClick={() => onOuvrir(x)} style={{ cursor: "pointer" }}>
      <td style={{ ...TD, padding: 0, width: 6, background: couleurCat }} />
      {peutEcrire && (
        <td style={{ ...TD, width: 36, paddingRight: 0 }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selectionnee} onChange={() => onToggleSelect(x.id)} title="Sélectionner (actions groupées)"
            style={{ width: 15, height: 15, accentColor: couleurCat, cursor: "pointer", display: "block" }} />
        </td>
      )}
      <td style={{ ...TD, minWidth: 200 }}>
        <div style={{ fontWeight: 600, color: inactive ? "#999" : "#1a1a1a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{x.name}</span>
          {x.is_derived && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED" }}>DÉRIVÉ</span>}
          {etat && <span className="bp-etat-inline"><Chip fond={etat.fond} couleur={etat.couleur}>{etat.libelle}</Chip></span>}
        </div>
        <div style={{ fontSize: 11.5, color: MUTED }}>
          {!sansCategorie && <span className="bp-cat-inline" style={{ color: texteCat, fontWeight: 700 }}>{CAT_LABELS[x.category] ?? x.category}{sousProduit ? " · " : ""}</span>}{sousProduit}
        </div>
      </td>
      {!sansCategorie && (
        <td className="bp-col-cat" style={{ ...TD, whiteSpace: "nowrap" }}>
          <Chip fond={`${couleurCat}24`} couleur={texteCat}>{CAT_LABELS[x.category] ?? x.category}</Chip>
        </td>
      )}
      <td style={{ ...TD, whiteSpace: "nowrap" }}>
        {fournisseur ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpenSupplier(fournisseur.id); }} title="Fiche fournisseur"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "transparent", padding: 0, fontFamily: "inherit", fontSize: 13, color: "#1a1a1a", cursor: "pointer" }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: cachedSupplierColor(fournisseur.name), flexShrink: 0 }} />
            {fournisseur.name}
          </button>
        ) : <span style={{ color: FAIBLE }}>—</span>}
      </td>
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <div style={{ fontWeight: 700, color: aUnPrix ? "#1a1a1a" : FAIBLE }}>{prix}</div>
        {alerte ? (
          <div style={{ fontSize: 11.5, fontWeight: 700, color: alerte.direction === "up" ? "#DC2626" : "#16A34A", whiteSpace: "normal", maxWidth: 150, marginLeft: "auto" }}>
            {alerte.direction === "up" ? "+" : "-"}{(Math.abs(alerte.change_pct) * 100).toFixed(0)} % sur la dernière facture
          </div>
        ) : colisage ? (
          <div style={{ fontSize: 11.5, color: MUTED }}>{colisage}</div>
        ) : !aUnPrix && !inactive ? (
          <div style={{ fontSize: 11.5, color: MUTED }}>aucune offre active</div>
        ) : null}
      </td>
      <td style={{ ...TD, textAlign: "right" }}><Stock s={stock} /></td>
      <td className="bp-col-zone" style={{ ...TD, color: x.storage_zone ? "#1a1a1a" : FAIBLE }}>{x.storage_zone ?? "—"}</td>
      <td className="bp-col-etat" style={TD}>{etat && <Chip fond={etat.fond} couleur={etat.couleur}>{etat.libelle}</Chip>}</td>
      {onToggleActif && (
        <td style={{ ...TD, width: 44 }} onClick={(e) => e.stopPropagation()}>
          <Interrupteur actif={!inactive} onChange={() => onToggleActif(x)} titre={inactive ? "Inactif : cliquer pour réactiver (listes, commandes, inventaire)" : "Actif : cliquer pour désactiver (sort des listes, des commandes et du prochain inventaire)"} />
        </td>
      )}
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <a href={`/ingredients/${x.id}`} title="Fiche détaillée (historique des prix, recettes)"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: "rgba(26,26,26,0.06)", color: "#1a1a1a", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>→</a>
      </td>
    </tr>
  );
});

export type BaseProduitsProps = {
  /** Ordinateur ou tablette (tableau, volet à droite) ; sinon téléphone (cartes, feuille de filtres) */
  bureau: boolean;
  accent: string;
  peutEcrire: boolean;
  /** Produits déjà filtrés par la page (onglet, catégorie, fournisseur, zone, recherche) ; triés ici de A à Z */
  produits: Ingredient[];
  loading: boolean;
  erreur: string | null;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => void;
  offersByIngredientId: Map<string, LatestOffer>;
  suppliersMap: Map<string, Supplier>;
  suppliers: Supplier[];
  zones: StorageZoneOption[];
  alertMap: Map<string, PriceAlert>;
  tab: Tab;
  setTab: (t: Tab) => void;
  total: number;
  aControler: number;
  /** Produits sans offre fournisseur active (compté en base) */
  sansPrix: number;
  nbDoublons: number;
  onDoublons: () => void;
  /** Stock théorique par produit (dernier inventaire + réceptions − ventes), vide tant qu'aucun inventaire n'est clôturé */
  stockMap: Map<string, StockItem>;
  inventaireDate: string | null;
  aCommander: number;
  onToggleActif?: (x: Ingredient) => void;
  q: string;
  setQ: (v: string) => void;
  categorie: "all" | Category;
  setCategorie: (c: "all" | Category) => void;
  categories: Category[];
  fournisseur: "all" | string;
  setFournisseur: (f: "all" | string) => void;
  zone: "all" | string;
  setZone: (z: "all" | string) => void;
  showInactive: boolean;
  setShowInactive: (v: boolean) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
  onToutSelectionner: () => void;
  onToutDecocher: () => void;
  editingId: string | null;
  onOuvrir: (x: Ingredient) => void;
  onOpenSupplier: (id: string) => void;
  onAjouter: () => void;
  onImportExport: () => void;
  onRecuperer: () => void;
};

export function BaseProduits(p: BaseProduitsProps) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  // A → Z ou par catégorie (mémorisé sur l'appareil) ; volets repliés par défaut, tous ouverts pendant une recherche
  const affichage = useSyncExternalStore(abonnerAffichage, lireAffichage, () => "az" as const);
  const changerAffichage = ecrireAffichage;
  const [ouvertes, setOuvertes] = useState<Set<string>>(new Set());
  const [sousFermees, setSousFermees] = useState<Set<string>>(new Set());
  const recherche = p.q.trim() !== "";
  const estOuverte = (cat: string) => recherche || ouvertes.has(cat);
  const basculerCat = (cat: Category) => setOuvertes((prev) => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; });
  const basculerSous = (cle: string) => setSousFermees((prev) => { const n = new Set(prev); if (n.has(cle)) n.delete(cle); else n.add(cle); return n; });
  const tries = useMemo(
    () => [...p.produits].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" })),
    [p.produits],
  );
  const nbCategories = useMemo(() => new Set(p.produits.map((x) => x.category)).size, [p.produits]);
  const toutCoche = tries.length > 0 && p.selectedIds.size === tries.length;
  const filtresActifs = p.categorie !== "all" || p.fournisseur !== "all" || p.zone !== "all" || p.q.trim() !== "";
  const compteur = `${nombre(tries.length)} produit${tries.length > 1 ? "s" : ""}${p.hasMore ? " chargés" : filtresActifs ? " trouvés" : ""}`;

  const selectCategorie = (style: CSSProperties) => (
    <select value={p.categorie} onChange={(e) => p.setCategorie(e.target.value as "all" | Category)} style={style} aria-label="Catégorie">
      <option value="all">{p.bureau ? "Toutes" : "Toutes catégories"}</option>
      {p.categories.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
    </select>
  );
  const selectFournisseur = (style: CSSProperties) => (
    <select value={p.fournisseur} onChange={(e) => p.setFournisseur(e.target.value)} style={style} aria-label="Fournisseur">
      <option value="all">{p.bureau ? "Tous" : "Tous fournisseurs"}</option>
      {p.suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  );
  const selectZone = (style: CSSProperties) => (
    <select value={p.zone} onChange={(e) => p.setZone(e.target.value)} style={style} aria-label="Zone de stockage">
      <option value="all">{p.bureau ? "Toutes" : "Toutes zones"}</option>
      {p.zones.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
    </select>
  );
  const caseInactives = (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: p.showInactive ? "#1a1a1a" : MUTED, cursor: "pointer", whiteSpace: "nowrap" }}>
      <input type="checkbox" checked={p.showInactive} onChange={(e) => p.setShowInactive(e.target.checked)} style={{ accentColor: "#D4775A", cursor: "pointer" }} />
      Afficher les désactivées
    </label>
  );
  const boutonTout = p.peutEcrire && tries.length > 0 && (
    <button type="button" onClick={toutCoche ? p.onToutDecocher : p.onToutSelectionner}
      title="Coche toutes les fiches affichées (filtres et recherche compris) pour une action groupée"
      style={{ ...BTN, height: 32, padding: "0 10px", fontSize: 12, color: "#D4775A", borderColor: "#D4775A", background: "transparent" }}>
      {toutCoche ? "Tout décocher" : `Tout sélectionner (${tries.length})`}
    </button>
  );
  const champRecherche = (
    <div style={{ flex: "1 1 220px", position: "relative", minWidth: 0 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
        <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
      </svg>
      <input placeholder={p.bureau ? "Rechercher un produit, une référence…" : "Rechercher un produit…"} value={p.q} onChange={(e) => p.setQ(e.target.value)}
        style={{ width: "100%", height: p.bureau ? 36 : 40, borderRadius: 10, border: `1px solid ${BORD}`, padding: "0 12px 0 32px", fontSize: p.bureau ? 13 : 16, background: "#fff", outline: "none", color: "#1a1a1a", boxSizing: "border-box", fontFamily: "inherit" }} />
    </div>
  );
  const lignes = useMemo(() => tries.map((x) => {
    const offer = p.offersByIngredientId.get(x.id);
    const idFournisseur = offer?.supplier_id ?? x.supplier_id ?? null;
    return { x, offer, fournisseur: idFournisseur ? p.suppliersMap.get(idFournisseur) ?? null : null };
  }), [tries, p.offersByIngredientId, p.suppliersMap]);
  type Ligne = (typeof lignes)[number];
  /** Vue par catégorie : catégories dans l'ordre des libellés, sous-catégories triées, « sans sous-catégorie » en dernier */
  const groupes = useMemo(() => {
    if (affichage !== "cat") return [];
    const parCat = new Map<Category, Ligne[]>();
    for (const l of lignes) { const liste = parCat.get(l.x.category); if (liste) liste.push(l); else parCat.set(l.x.category, [l]); }
    const ordre = [...p.categories, ...[...parCat.keys()].filter((c) => !p.categories.includes(c))];
    return ordre.filter((c) => parCat.has(c)).map((cat) => {
      const items = [...parCat.get(cat)!].sort((a, b) =>
        (a.x.sub_category ?? "\uffff").localeCompare(b.x.sub_category ?? "\uffff", "fr") || (a.x.name ?? "").localeCompare(b.x.name ?? "", "fr"));
      const aDesSous = items.some((l) => l.x.sub_category);
      const sous: { nom: string | null; cle: string; items: Ligne[] }[] = [];
      for (const l of items) {
        const nom = aDesSous ? (l.x.sub_category ?? "Sans sous-catégorie") : null;
        const dernier = sous[sous.length - 1];
        if (dernier && dernier.nom === nom) dernier.items.push(l); else sous.push({ nom, cle: `${cat}|${nom ?? ""}`, items: [l] });
      }
      return { cat, couleur: CAT_COLORS[cat] ?? "#939597", items, sous };
    });
  }, [affichage, lignes, p.categories]);
  const bascule = (
    <span style={{ display: "inline-flex", background: "#ece4d4", borderRadius: 10, padding: 3, gap: 3, flexShrink: 0 }}>
      {(["az", "cat"] as const).map((v) => (
        <button key={v} type="button" onClick={() => changerAffichage(v)} aria-pressed={affichage === v} style={{
          border: "none", borderRadius: 8, padding: "5px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
          background: affichage === v ? "#fff" : "transparent", color: affichage === v ? "#1a1a1a" : MUTED, boxShadow: affichage === v ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
        }}>{v === "az" ? "A → Z" : "Par catégorie"}</button>
      ))}
    </span>
  );
  const boutonSous = (couleur: string, nom: string, cle: string, n: number, style?: CSSProperties) => {
    const ouverte = !sousFermees.has(cle) || recherche;
    return (
      <button type="button" onClick={() => basculerSous(cle)} aria-expanded={ouverte} style={{ ...styleSousCategorie(couleur, ouverte), ...style }}>
        <span>{nom} <span style={{ fontWeight: 500, opacity: 0.8 }}>({n})</span></span>
        <span style={{ fontSize: 10, transition: "transform 0.2s", transform: ouverte ? "rotate(0)" : "rotate(-90deg)" }}>▼</span>
      </button>
    );
  };
  const ligneMobile = (l: Ligne, sansCategorie = false) => (
    <LigneMobile key={l.x.id} x={l.x} offer={l.offer} fournisseur={l.fournisseur} alerte={p.alertMap.get(l.x.id)} stock={p.stockMap.get(l.x.id) ?? null}
      selectionnee={p.selectedIds.has(l.x.id)} enEdition={p.editingId === l.x.id} peutEcrire={p.peutEcrire} sansCategorie={sansCategorie}
      onOuvrir={p.onOuvrir} onToggleSelect={p.onToggleSelect} onOpenSupplier={p.onOpenSupplier} />
  );
  const nbColonnesMobile = 4 + (p.peutEcrire ? 1 : 0);
  /** Cadre blanc du tableau téléphone : accroché sous une barre de catégorie (coins du haut droits) ou autonome */
  const tableauMobile = (corps: ReactNode, enSection: boolean) => (
    <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: enSection ? 0 : `1px solid ${BORD}`, borderRadius: enSection ? "0 0 14px 14px" : 14, overflow: "hidden" }}>
      <table style={{ borderCollapse: "collapse", width: "100%", tableLayout: "fixed" }}>
        <colgroup>
          <col style={{ width: 4 }} />
          {p.peutEcrire && <col style={{ width: 30 }} />}
          <col />
          <col style={{ width: 112 }} />
          <col style={{ width: 22 }} />
        </colgroup>
        <tbody>{corps}</tbody>
      </table>
    </div>
  );
  const ligne = (l: Ligne, sansCategorie = false) => (
    <LigneProduit key={l.x.id} x={l.x} offer={l.offer} fournisseur={l.fournisseur} alerte={p.alertMap.get(l.x.id)} stock={p.stockMap.get(l.x.id) ?? null} onToggleActif={p.peutEcrire ? p.onToggleActif : undefined}
      selectionnee={p.selectedIds.has(l.x.id)} enEdition={p.editingId === l.x.id} peutEcrire={p.peutEcrire} sansCategorie={sansCategorie}
      onOuvrir={p.onOuvrir} onToggleSelect={p.onToggleSelect} onOpenSupplier={p.onOpenSupplier} />
  );
  const nbColonnes = (sansCategorie: boolean) => 9 + (p.peutEcrire ? 1 : 0) + (p.peutEcrire && p.onToggleActif ? 1 : 0) - (sansCategorie ? 1 : 0);
  const enTete = (sansCategorie: boolean) => (
    <thead>
      <tr>
        <th style={{ ...TH, width: 6, padding: 0 }} />
        {p.peutEcrire && <th style={{ ...TH, width: 36, paddingRight: 0 }} />}
        <th style={TH}>Produit</th>
        {!sansCategorie && <th className="bp-col-cat" style={TH}>Catégorie</th>}
        <th style={TH}>Fournisseur</th>
        <th style={{ ...TH, textAlign: "right" }}>Prix d&apos;achat</th>
        <th style={{ ...TH, textAlign: "right" }}>Stock</th>
        <th className="bp-col-zone" style={TH}>Zone</th>
        <th className="bp-col-etat" style={TH}>État</th>
        {p.peutEcrire && p.onToggleActif && <th style={{ ...TH, width: 44 }}>Actif</th>}
        <th style={TH} />
      </tr>
    </thead>
  );
  const vide = !p.loading && tries.length === 0;
  const dateInv = dateInventaire(p.inventaireDate);
  const ligneInventaire = (
    <span style={{ color: MUTED, fontSize: 12.5 }}>
      {dateInv ? <>Stock théorique depuis l&apos;inventaire du <b style={{ color: "#1a1a1a" }}>{dateInv}</b></> : "Aucun inventaire clôturé : pas encore de stock théorique"}
      {" · "}<Link href="/inventaire" style={{ color: "#D4775A", fontWeight: 600, textDecoration: "none" }}>Faire l&apos;inventaire →</Link>
      {p.aCommander > 0 && <>{" · "}<Link href="/commandes/theoriques" style={{ color: "#D4775A", fontWeight: 600, textDecoration: "none" }}>Proposition de commande →</Link></>}
    </span>
  );
  const tuileCommander = (compacte: boolean) => (
    <Tuile compacte={compacte} icone="camion" couleur={p.aCommander ? MAUVAIS : BON} libelle="À commander" valeur={nombre(p.aCommander)} sous={p.aCommander ? "sous le minimum de stock" : "stock au-dessus des minimums"} active={p.tab === "a_commander"} onClick={() => p.setTab(p.tab === "a_commander" ? "all" : "a_commander")} />
  );
  const boutonPlus = p.hasMore && (
    <button type="button" onClick={p.loadMore} disabled={p.loadingMore} style={{ ...BTN, height: 32, padding: "0 12px", fontSize: 12.5, opacity: p.loadingMore ? 0.6 : 1 }}>
      {p.loadingMore ? "Chargement…" : "Afficher plus de produits"}
    </button>
  );

  if (!p.bureau) {
    const SELECT_MOBILE: CSSProperties = { height: 36, maxWidth: "100%", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", padding: "0 10px", fontSize: 14, fontFamily: "inherit", color: "#1a1a1a", fontWeight: 600 };
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, color: "#1a1a1a" }}>Base produits</h1>
          {p.peutEcrire && (
            <div style={{ display: "flex", gap: 6, position: "relative" }}>
              <button type="button" onClick={() => setMenuOuvert((v) => !v)} aria-label="Outils" aria-expanded={menuOuvert}
                style={{ ...BTN, width: 38, padding: 0, fontSize: 18, lineHeight: 1, background: menuOuvert ? "#f0ebe2" : "#fff" }}>⋯</button>
              <button type="button" onClick={p.onAjouter} aria-label="Ajouter un produit"
                style={{ ...BTN, width: 38, padding: 0, background: p.accent, color: "#fff", border: "none", fontSize: 20, lineHeight: 1 }}>+</button>
              {menuOuvert && (
                <>
                  <div onClick={() => setMenuOuvert(false)} style={{ position: "fixed", inset: 0, zIndex: 45 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 46, background: "#fff", border: `1px solid ${BORD}`, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.14)", minWidth: 230, padding: 6 }}>
                    {[{ libelle: "Import / Export Excel", act: p.onImportExport }, { libelle: "Récupérer un produit supprimé", act: p.onRecuperer }].map((o) => (
                      <button key={o.libelle} type="button" onClick={() => { setMenuOuvert(false); o.act(); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "10px 10px", border: "none", background: "transparent", borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: "pointer", color: "#1a1a1a", fontFamily: "inherit" }}>
                        {o.libelle}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
          <Tuile compacte couleur="#1a1a1a" icone="produit" libelle="Produits actifs" valeur={nombre(p.total)} sous="" active={p.tab === "all"} onClick={() => p.setTab("all")} />
          <Tuile compacte icone="alerte" libelle="À contrôler" valeur={nombre(p.aControler)} sous="" active={p.tab === "to_check"} couleur={ATTENTION} onClick={() => p.setTab("to_check")} />
          <Tuile compacte icone="sans" libelle="Sans prix" valeur={nombre(p.sansPrix)} sous="" active={p.tab === "sans_prix"} couleur={MAUVAIS} onClick={() => p.setTab("sans_prix")} />
          {tuileCommander(true)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {ligneInventaire}
          <button type="button" onClick={p.onDoublons} style={{ border: "none", background: "transparent", padding: 0, fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, color: INFO, cursor: "pointer" }}>{nombre(p.nbDoublons)} doublons probables →</button>
        </div>

        <div style={{ display: "grid", gap: 8 }}>
          {champRecherche}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {selectCategorie({ ...SELECT_MOBILE, color: p.categorie !== "all" ? "#D4775A" : "#1a1a1a", borderColor: p.categorie !== "all" ? "#D4775A" : BORD })}
            {selectFournisseur({ ...SELECT_MOBILE, color: p.fournisseur !== "all" ? "#D4775A" : "#1a1a1a", borderColor: p.fournisseur !== "all" ? "#D4775A" : BORD })}
            {selectZone({ ...SELECT_MOBILE, color: p.zone !== "all" ? "#D4775A" : "#1a1a1a", borderColor: p.zone !== "all" ? "#D4775A" : BORD })}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, color: MUTED, fontSize: 12.5, flexWrap: "wrap" }}>
            <span>{p.loading ? "Chargement…" : compteur}</span>
            {bascule}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>{caseInactives}{boutonTout}</div>
        </div>

        {p.erreur && (
          <div style={{ padding: "14px 16px", background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
            Erreur de chargement : {p.erreur}
          </div>
        )}
        {!p.erreur && (
          <div style={{ display: "grid", gap: 10 }}>
            <style>{`
              .bp-ligne:hover td { background: #f7f3ec; }
              .bp-ligne.on td { background: rgba(212,119,90,0.08); }
              .bp-ligne:last-child td { border-bottom: 0; }
            `}</style>
            {p.loading && tableauMobile([0, 1, 2, 3, 4].map((i) => (
              <tr key={i}>
                <td style={{ ...TD, padding: 0, background: "#e5ddd0" }} />
                <td style={{ ...TD, padding: "11px 10px" }} colSpan={nbColonnesMobile - 1}>
                  <div style={{ height: 13, borderRadius: 4, background: "#e5ddd0", width: `${45 + (i % 3) * 15}%`, marginBottom: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
                  <div style={{ height: 10, borderRadius: 3, background: "#ede6d9", width: "35%", animation: "pulse 1.5s ease-in-out infinite" }} />
                </td>
              </tr>
            )), false)}
            {!p.loading && affichage === "az" && tries.length > 0 && tableauMobile(lignes.map((l) => ligneMobile(l)), false)}
            {!p.loading && affichage === "cat" && groupes.map((g) => (
              <div key={g.cat}>
                <BarreCategorie cat={g.cat} couleur={g.couleur} n={g.items.length} ouverte={estOuverte(g.cat)} onToggle={basculerCat} />
                {estOuverte(g.cat) && tableauMobile(g.sous.map((sg) => (
                  <React.Fragment key={sg.cle}>
                    {sg.nom != null && (
                      <tr><td colSpan={nbColonnesMobile} style={{ padding: "4px 8px 2px", background: "#f2ede4", borderBottom: "none" }}>
                        {boutonSous(g.couleur, sg.nom, sg.cle, sg.items.length, { margin: "2px 0" })}
                      </td></tr>
                    )}
                    {(sg.nom == null || !sousFermees.has(sg.cle) || recherche) && sg.items.map((l) => ligneMobile(l, true))}
                  </React.Fragment>
                )), true)}
              </div>
            ))}
            {vide && (
              <EtatVide compact icone="recherche" titre="Aucun produit ne correspond" texte="Modifiez la recherche ou les filtres, ou affichez les fiches désactivées." />
            )}
            {!p.loading && tries.length > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 2px", color: MUTED, fontSize: 12.5 }}>
                <span>{compteur}, de A à Z</span>
                {boutonPlus}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{`
        .bp-ligne:hover td { background: #f7f3ec; }
        .bp-ligne.on td { background: rgba(212,119,90,0.08); }
        .bp-ligne:last-child td { border-bottom: 0; }
        .bp-etat-inline, .bp-cat-inline { display: none; }
        /* Tablette (iPad) : le tableau tient dans la largeur ; la catégorie et l'état passent sous et à côté du nom, Zone disparaît */
        @media (max-width: 1100px) {
          .bp-table { min-width: 0 !important; }
          .bp-col-zone, .bp-col-etat, .bp-col-cat { display: none; }
          .bp-etat-inline, .bp-cat-inline { display: inline; }
        }
      `}</style>

      {/* En-tête */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Base produits</h1>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Vos produits achetés : prix d&apos;achat, conditionnements, fournisseurs, stock. Les fiches techniques s&apos;appuient dessus.</div>
          <div style={{ marginTop: 4 }}>{ligneInventaire}</div>
        </div>
        {p.peutEcrire && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={p.onRecuperer} style={BTN} title="Retrouver un produit supprimé par erreur">Récupérer</button>
            <button type="button" onClick={p.onImportExport} style={BTN} title="Import / Export Excel de la base produits">⇅ Excel</button>
            <button type="button" onClick={p.onAjouter} style={{ ...BTN, background: p.accent, color: "#fff", border: "none", fontWeight: 700 }}>+ Ajouter un produit</button>
          </div>
        )}
      </div>

      {/* Tuiles : elles changent la vue (Tous / À contrôler / Sans prix / À commander) ; la dernière ouvre les doublons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
        <Tuile couleur="#1a1a1a" icone="produit" libelle="Produits actifs" valeur={nombre(p.total)} sous={`dans ${nbCategories} catégorie${nbCategories > 1 ? "s" : ""} affichée${nbCategories > 1 ? "s" : ""}`} active={p.tab === "all"} onClick={() => p.setTab("all")} />
        <Tuile icone="alerte" libelle="À contrôler" valeur={nombre(p.aControler)} sous="unité, contenance ou prix à vérifier" active={p.tab === "to_check"} couleur={ATTENTION} onClick={() => p.setTab("to_check")} />
        <Tuile icone="sans" libelle="Sans prix d'achat" valeur={nombre(p.sansPrix)} sous="aucune offre fournisseur active" active={p.tab === "sans_prix"} couleur={MAUVAIS} onClick={() => p.setTab("sans_prix")} />
        {tuileCommander(false)}
        <Tuile icone="doublon" libelle="Doublons probables" valeur={nombre(p.nbDoublons)} sous="paires détectées dans les fiches chargées" couleur={INFO} onClick={p.onDoublons} />
      </div>

      {/* Filtres : recherche + menus déroulants, pas de pastilles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        {champRecherche}
        <label style={FILTRE}>Catégorie :{selectCategorie(SELECT)}</label>
        <label style={FILTRE}>Fournisseur :{selectFournisseur(SELECT)}</label>
        <label style={FILTRE}>Zone :{selectZone(SELECT)}</label>
        {caseInactives}
        <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12.5, whiteSpace: "nowrap" }}>{compteur}</span>
        {boutonTout}
        {bascule}
      </div>

      {/* Liste A → Z */}
      {p.erreur && (
        <div style={{ padding: "14px 16px", background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          Erreur de chargement : {p.erreur}
        </div>
      )}
      {!p.erreur && affichage === "cat" && !p.loading && (
        <div style={{ display: "grid", gap: 10 }}>
          {groupes.map((g) => (
            <div key={g.cat}>
              <BarreCategorie cat={g.cat} couleur={g.couleur} n={g.items.length} ouverte={estOuverte(g.cat)} onToggle={basculerCat} />
              {estOuverte(g.cat) && (
                <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderTop: "none", borderRadius: "0 0 14px 14px", overflow: "hidden" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table className="bp-table" style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
                      {enTete(true)}
                      <tbody>
                        {g.sous.map((sg) => (
                          <React.Fragment key={sg.cle}>
                            {sg.nom != null && (
                              <tr><td colSpan={nbColonnes(true)} style={{ padding: "6px 10px 4px", background: "#f2ede4", borderBottom: "none" }}>
                                {boutonSous(g.couleur, sg.nom, sg.cle, sg.items.length, { margin: "2px 0" })}
                              </td></tr>
                            )}
                            {(sg.nom == null || !sousFermees.has(sg.cle) || recherche) && sg.items.map((l) => ligne(l, true))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
          {vide && <EtatVide compact icone="recherche" titre="Aucun produit ne correspond" texte="Modifiez la recherche ou les filtres, ou affichez les fiches désactivées." />}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 4px", color: MUTED, fontSize: 12.5 }}>
            <span>{`${nombre(tries.length)} produit${tries.length > 1 ? "s" : ""} dans ${groupes.length} catégorie${groupes.length > 1 ? "s" : ""}`}</span>
            {boutonPlus}
          </div>
        </div>
      )}
      {!p.erreur && (affichage === "az" || p.loading) && (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table className="bp-table" style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
              {enTete(false)}
              <tbody>
                {p.loading && [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td style={{ ...TD, padding: 0, width: 6, background: "#e5ddd0" }} />
                    <td style={TD} colSpan={nbColonnes(false) - 1}>
                      <div style={{ height: 13, borderRadius: 4, background: "#e5ddd0", width: `${35 + (i % 3) * 15}%`, marginBottom: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ height: 10, borderRadius: 3, background: "#ede6d9", width: "25%", animation: "pulse 1.5s ease-in-out infinite" }} />
                    </td>
                  </tr>
                ))}
                {!p.loading && lignes.map((l) => ligne(l))}
                {vide && (
                  <tr><td style={{ ...TD, padding: 0 }} colSpan={nbColonnes(false)}><EtatVide compact icone="recherche" titre="Aucun produit ne correspond" texte="Modifiez la recherche ou les filtres, ou affichez les fiches désactivées." /></td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", color: MUTED, fontSize: 12.5, borderTop: `1px solid ${BORD}` }}>
            <span>{p.loading ? "Chargement…" : `${nombre(tries.length)} produit${tries.length > 1 ? "s" : ""} affiché${tries.length > 1 ? "s" : ""}, de A à Z`}</span>
            {boutonPlus}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Volet de droite (comme ComandR) : par-dessus la liste, sous la barre du haut, à droite de la barre latérale ;
 * plein écran sur téléphone. Échap ou clic à côté : `onFermer`. Le pied reçoit les boutons d'action de l'écran appelant.
 */
export function VoletDroit({ titre, sousTitre, onFermer, pied, largeur = 640, children }: {
  titre: ReactNode;
  sousTitre?: ReactNode;
  onFermer: () => void;
  pied?: ReactNode;
  largeur?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onFermer(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onFermer]);

  return (
    <>
      <div onClick={onFermer} className="volet-fond" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,26,26,0.18)" }} />
      <style>{`
        /* Téléphone : tiroir qui monte du bas, au-dessus de l'en-tête (110) et de la barre d'onglets (100),
           comme la feuille du bas de l'application (200). Les boutons du pied restent visibles. */
        @media (max-width: 767px) {
          .volet-fond { z-index: 200 !important; background: rgba(26,26,26,0.45) !important; }
          .volet-droit { z-index: 201 !important; top: 48px !important; right: 0 !important; bottom: 0 !important; left: 0; width: auto !important; border-radius: 20px 20px 0 0 !important; border: none !important; box-shadow: 0 -8px 40px rgba(0,0,0,0.25) !important; animation: voletMonte .3s cubic-bezier(.2,.8,.2,1); }
          .volet-droit > div { padding-left: 16px !important; padding-right: 16px !important; }
          .volet-droit > div:last-child { padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px)) !important; }
          /* Les boutons du pied passent à la ligne au lieu de déborder */
          .volet-pied { flex-wrap: wrap; justify-content: flex-end; }
          .volet-pied > * { margin-left: 0 !important; }
        }
        @keyframes voletMonte { from { transform: translateY(100%); } to { transform: none; } }
      `}</style>
      <aside role="dialog" aria-modal="true" className="volet-droit" style={{
        position: "fixed", top: "calc(var(--topbar-desktop-height, 0px) + 12px)", right: 12, bottom: 12,
        width: `min(${largeur}px, calc(100vw - var(--sidebar-width, 240px) - 48px))`,
        background: "#fff", border: `1px solid ${BORD}`, borderRadius: 16, boxShadow: "-12px 0 40px rgba(0,0,0,0.16)",
        display: "flex", flexDirection: "column", zIndex: 61, overflow: "hidden",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: "16px 20px 12px", borderBottom: `1px solid ${BORD}` }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 18, textTransform: "uppercase", letterSpacing: ".02em", color: "#1a1a1a", lineHeight: 1.15 }}>{titre}</div>
            {sousTitre && <div style={{ color: MUTED, fontSize: 12.5, marginTop: 2 }}>{sousTitre}</div>}
          </div>
          <button type="button" onClick={onFermer} aria-label="Fermer" style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, color: MUTED, cursor: "pointer", padding: "0 4px", fontFamily: "inherit" }}>×</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px 24px" }}>{children}</div>
        {pied && (
          <div className="volet-pied" style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 20px", borderTop: `1px solid ${BORD}` }}>{pied}</div>
        )}
      </aside>
    </>
  );
}
