"use client";

import React, { useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { CAT_COLORS, CAT_LABELS, type Category, type Ingredient, type IngredientStatus, type LatestOffer, type Supplier, type Tab } from "@/types/ingredients";
import type { StorageZoneOption } from "@/components/IngredientRow";
import type { PriceAlert } from "@/lib/priceAlerts";
import { formatIngredientPrice } from "@/lib/formatPrice";
import { legacyHasPrice, offerHasPrice } from "@/lib/offers";
import { cachedSupplierColor } from "@/lib/supplierColors";
import { couleurTexte } from "@/lib/styleCategories";
import { OSWALD } from "@/components/TuileProduit";
import { articleDeFiche, type FicheConditionnement } from "@/lib/inventaire";
import { libelleColisage } from "@/lib/commandeArticles";

/**
 * Base produits, présentation bureau (étape 3 de la refonte inspirée de ComandR, 08/10/2026).
 * Liste plate de A à Z colorée par catégorie, tuiles qui changent de vue, filtres en menus déroulants,
 * et volet de droite pour paramétrer la fiche (le formulaire reste celui de l'application).
 * La version téléphone (accordéons par catégorie) n'est pas touchée : voir src/app/ingredients/page.tsx.
 */

const BORD = "#ddd6c8";
const MUTED = "#6f6a61";
const FAIBLE = "#a39d92";
const BON = "#4a6741";
const ATTENTION = "#b7791f";
const MAUVAIS = "#b4443a";
const INFO = "#2563EB";

function Chip({ fond, couleur, children, title }: { fond: string; couleur: string; children: ReactNode; title?: string }) {
  return (
    <span title={title} style={{ display: "inline-block", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, whiteSpace: "nowrap", background: fond, color: couleur }}>
      {children}
    </span>
  );
}

function Tuile({ libelle, valeur, sous, active, couleur, onClick }: {
  libelle: string; valeur: number | string; sous: string; active?: boolean; couleur?: string; onClick: () => void;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      background: "#fff", border: `1px solid ${active ? "#D4775A" : BORD}`, borderRadius: 12, padding: "12px 14px",
      display: "grid", gap: 2, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
      boxShadow: active ? "0 0 0 2px rgba(212,119,90,0.12)" : "none",
    }}>
      <span style={{ fontSize: 12, color: MUTED, fontWeight: 600 }}>{libelle}</span>
      <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 26, lineHeight: 1.1, color: couleur ?? "#1a1a1a", fontVariantNumeric: "tabular-nums" }}>{valeur}</span>
      <span style={{ fontSize: 11.5, color: MUTED }}>{sous}</span>
    </button>
  );
}

const TH: CSSProperties = { textAlign: "left", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", color: MUTED, padding: "10px 14px", borderBottom: `1px solid ${BORD}`, fontWeight: 700, whiteSpace: "nowrap" };
const TD: CSSProperties = { padding: "9px 14px", borderBottom: `1px solid #ece6db`, verticalAlign: "middle", fontSize: 13 };
const BTN: CSSProperties = { height: 36, padding: "0 14px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", color: "#1a1a1a", whiteSpace: "nowrap" };
const FILTRE: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 4, height: 36, padding: "0 6px 0 12px", borderRadius: 10, border: `1px solid ${BORD}`, background: "#fff", fontSize: 12.5, color: MUTED };
const SELECT: CSSProperties = { border: "none", background: "transparent", fontWeight: 600, fontSize: 12.5, fontFamily: "inherit", color: "#1a1a1a", outline: "none", cursor: "pointer", maxWidth: 220 };

const nombre = (n: number) => n.toLocaleString("fr-FR");

function dateCourte(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function etatFiche(x: Ingredient, aUnPrix: boolean): { libelle: string; fond: string; couleur: string } {
  if (x.is_active === false) return { libelle: "Désactivée", fond: "rgba(0,0,0,0.06)", couleur: "#999" };
  if (!aUnPrix) return { libelle: "Sans prix", fond: "rgba(180,68,58,0.12)", couleur: MAUVAIS };
  if (((x.status ?? "to_check") as IngredientStatus) === "validated") return { libelle: "Validé", fond: "rgba(74,103,65,0.12)", couleur: BON };
  return { libelle: "À contrôler", fond: "rgba(183,121,31,0.12)", couleur: ATTENTION };
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
};

const LigneProduit = React.memo(function LigneProduit({ x, offer, fournisseur, alerte, selectionnee, enEdition, peutEcrire, onOuvrir, onToggleSelect, onOpenSupplier }: LigneProps) {
  const couleurCat = CAT_COLORS[x.category] ?? "#939597";
  const texteCat = couleurTexte(couleurCat);
  const inactive = x.is_active === false;
  const aUnPrix = offerHasPrice(offer, { piece_volume_ml: x.piece_volume_ml }) || legacyHasPrice(x);
  const prix = aUnPrix ? formatIngredientPrice(x, offer ?? null) : "—";
  const article = articleDeFiche(x as unknown as FicheConditionnement);
  const colisage = article ? libelleColisage(article) : null;
  const maj = dateCourte(offer?.updated_at);
  const etat = etatFiche(x, aUnPrix);
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
      <td style={TD}>
        <div style={{ fontWeight: 600, color: inactive ? "#999" : "#1a1a1a", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span>{x.name}</span>
          {x.is_derived && <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 5px", borderRadius: 4, background: "rgba(124,58,237,0.10)", color: "#7C3AED" }}>DÉRIVÉ</span>}
        </div>
        {sousProduit && <div style={{ fontSize: 11.5, color: MUTED }}>{sousProduit}</div>}
      </td>
      <td style={TD}>
        <Chip fond={`${couleurCat}24`} couleur={texteCat}>{CAT_LABELS[x.category] ?? x.category}</Chip>
      </td>
      <td style={TD}>
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
          <div style={{ fontSize: 11.5, fontWeight: 700, color: alerte.direction === "up" ? "#DC2626" : "#16A34A" }}>
            {alerte.direction === "up" ? "+" : "-"}{(Math.abs(alerte.change_pct) * 100).toFixed(0)} % sur la dernière facture
          </div>
        ) : colisage ? (
          <div style={{ fontSize: 11.5, color: MUTED }}>{colisage}</div>
        ) : !aUnPrix && !inactive ? (
          <div style={{ fontSize: 11.5, color: MUTED }}>aucune offre active</div>
        ) : null}
      </td>
      <td style={{ ...TD, color: x.storage_zone ? "#1a1a1a" : FAIBLE }}>{x.storage_zone ?? "—"}</td>
      <td style={TD}><Chip fond={etat.fond} couleur={etat.couleur}>{etat.libelle}</Chip></td>
      <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
        <a href={`/ingredients/${x.id}`} title="Fiche détaillée (historique des prix, recettes)"
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: 8, background: "rgba(26,26,26,0.06)", color: "#1a1a1a", textDecoration: "none", fontWeight: 700, fontSize: 13 }}>→</a>
      </td>
    </tr>
  );
});

export type BaseProduitsBureauProps = {
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
  valides: number;
  aControler: number;
  nbDoublons: number;
  onDoublons: () => void;
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

export function BaseProduitsBureau(p: BaseProduitsBureauProps) {
  const tries = useMemo(
    () => [...p.produits].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "fr", { sensitivity: "base" })),
    [p.produits],
  );
  const nbCategories = useMemo(() => new Set(p.produits.map((x) => x.category)).size, [p.produits]);
  const toutCoche = tries.length > 0 && p.selectedIds.size === tries.length;
  const filtresActifs = p.categorie !== "all" || p.fournisseur !== "all" || p.zone !== "all" || p.q.trim() !== "";

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <style>{`
        .bp-ligne:hover td { background: #f7f3ec; }
        .bp-ligne.on td { background: rgba(212,119,90,0.08); }
      `}</style>

      {/* En-tête */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
        <div>
          <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 28, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Base produits</h1>
          <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Vos produits achetés : prix d&apos;achat, conditionnements, fournisseurs. Les fiches techniques s&apos;appuient dessus.</div>
        </div>
        {p.peutEcrire && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" onClick={p.onRecuperer} style={BTN} title="Retrouver un produit supprimé par erreur">Récupérer</button>
            <button type="button" onClick={p.onImportExport} style={BTN} title="Import / Export Excel de la base produits">⇅ Excel</button>
            <button type="button" onClick={p.onAjouter} style={{ ...BTN, background: p.accent, color: "#fff", border: "none", fontWeight: 700 }}>+ Ajouter un produit</button>
          </div>
        )}
      </div>

      {/* Tuiles : elles changent la vue (Tous / Validés / À contrôler) ; la quatrième ouvre les doublons */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <Tuile libelle="Produits actifs" valeur={nombre(p.total)} sous={`dans ${nbCategories} catégorie${nbCategories > 1 ? "s" : ""} affichée${nbCategories > 1 ? "s" : ""}`} active={p.tab === "all"} onClick={() => p.setTab("all")} />
        <Tuile libelle="Validés" valeur={nombre(p.valides)} sous="prix et fiche vérifiés" active={p.tab === "validated"} couleur={BON} onClick={() => p.setTab("validated")} />
        <Tuile libelle="À contrôler" valeur={nombre(p.aControler)} sous="prix à compléter ou à vérifier" active={p.tab === "to_check"} couleur={ATTENTION} onClick={() => p.setTab("to_check")} />
        <Tuile libelle="Doublons probables" valeur={nombre(p.nbDoublons)} sous="paires détectées dans les fiches chargées" couleur={INFO} onClick={p.onDoublons} />
      </div>

      {/* Filtres : recherche + menus déroulants, pas de pastilles */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", position: "relative" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}>
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input placeholder="Rechercher un produit, une référence…" value={p.q} onChange={(e) => p.setQ(e.target.value)}
            style={{ width: "100%", height: 36, borderRadius: 10, border: `1px solid ${BORD}`, padding: "0 12px 0 32px", fontSize: 13, background: "#fff", outline: "none", color: "#1a1a1a", boxSizing: "border-box", fontFamily: "inherit" }} />
        </div>
        <label style={FILTRE}>Catégorie :
          <select value={p.categorie} onChange={(e) => p.setCategorie(e.target.value as "all" | Category)} style={SELECT}>
            <option value="all">Toutes</option>
            {p.categories.map((c) => <option key={c} value={c}>{CAT_LABELS[c]}</option>)}
          </select>
        </label>
        <label style={FILTRE}>Fournisseur :
          <select value={p.fournisseur} onChange={(e) => p.setFournisseur(e.target.value)} style={SELECT}>
            <option value="all">Tous</option>
            {p.suppliers.filter((s) => s.is_active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label style={FILTRE}>Zone :
          <select value={p.zone} onChange={(e) => p.setZone(e.target.value)} style={SELECT}>
            <option value="all">Toutes</option>
            {p.zones.map((z) => <option key={z.id} value={z.name}>{z.name}</option>)}
          </select>
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: p.showInactive ? "#1a1a1a" : MUTED, cursor: "pointer", whiteSpace: "nowrap" }}>
          <input type="checkbox" checked={p.showInactive} onChange={(e) => p.setShowInactive(e.target.checked)} style={{ accentColor: "#D4775A", cursor: "pointer" }} />
          Afficher les désactivées
        </label>
        <span style={{ marginLeft: "auto", color: MUTED, fontSize: 12.5, whiteSpace: "nowrap" }}>
          {nombre(tries.length)} produit{tries.length > 1 ? "s" : ""}{p.hasMore ? " chargés" : filtresActifs ? " trouvés" : ""}
        </span>
        {p.peutEcrire && tries.length > 0 && (
          <button type="button" onClick={toutCoche ? p.onToutDecocher : p.onToutSelectionner}
            title="Coche toutes les fiches affichées (filtres et recherche compris) pour une action groupée"
            style={{ ...BTN, height: 32, padding: "0 10px", fontSize: 12, color: "#D4775A", borderColor: "#D4775A", background: "transparent" }}>
            {toutCoche ? "Tout décocher" : `Tout sélectionner (${tries.length})`}
          </button>
        )}
      </div>

      {/* Liste A → Z */}
      {p.erreur && (
        <div style={{ padding: "14px 16px", background: "#FEF2F2", border: "1px solid rgba(220,38,38,0.25)", borderRadius: 10, fontSize: 12, color: "#DC2626", fontWeight: 600 }}>
          Erreur de chargement : {p.erreur}
        </div>
      )}
      {!p.erreur && (
        <div style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, overflow: "hidden" }}>
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 860 }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 6, padding: 0 }} />
                  {p.peutEcrire && <th style={{ ...TH, width: 36, paddingRight: 0 }} />}
                  <th style={TH}>Produit</th>
                  <th style={TH}>Catégorie</th>
                  <th style={TH}>Fournisseur</th>
                  <th style={{ ...TH, textAlign: "right" }}>Prix d&apos;achat</th>
                  <th style={TH}>Zone</th>
                  <th style={TH}>État</th>
                  <th style={TH} />
                </tr>
              </thead>
              <tbody>
                {p.loading && [0, 1, 2, 3, 4, 5].map((i) => (
                  <tr key={i}>
                    <td style={{ ...TD, padding: 0, width: 6, background: "#e5ddd0" }} />
                    <td style={TD} colSpan={p.peutEcrire ? 7 : 6}>
                      <div style={{ height: 13, borderRadius: 4, background: "#e5ddd0", width: `${35 + (i % 3) * 15}%`, marginBottom: 6, animation: "pulse 1.5s ease-in-out infinite" }} />
                      <div style={{ height: 10, borderRadius: 3, background: "#ede6d9", width: "25%", animation: "pulse 1.5s ease-in-out infinite" }} />
                    </td>
                  </tr>
                ))}
                {!p.loading && tries.map((x) => {
                  const offer = p.offersByIngredientId.get(x.id);
                  const idFournisseur = offer?.supplier_id ?? x.supplier_id ?? null;
                  const fournisseur = idFournisseur ? p.suppliersMap.get(idFournisseur) ?? null : null;
                  return (
                    <LigneProduit key={x.id} x={x} offer={offer} fournisseur={fournisseur} alerte={p.alertMap.get(x.id)}
                      selectionnee={p.selectedIds.has(x.id)} enEdition={p.editingId === x.id} peutEcrire={p.peutEcrire}
                      onOuvrir={p.onOuvrir} onToggleSelect={p.onToggleSelect} onOpenSupplier={p.onOpenSupplier} />
                  );
                })}
                {!p.loading && tries.length === 0 && (
                  <tr><td style={{ ...TD, padding: "40px 20px", textAlign: "center", color: "#999", fontSize: 14 }} colSpan={p.peutEcrire ? 9 : 8}>Aucun produit ne correspond.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", color: MUTED, fontSize: 12.5, borderTop: `1px solid ${BORD}` }}>
            <span>{p.loading ? "Chargement…" : `${nombre(tries.length)} produit${tries.length > 1 ? "s" : ""} affiché${tries.length > 1 ? "s" : ""}, de A à Z`}</span>
            {p.hasMore && (
              <button type="button" onClick={p.loadMore} disabled={p.loadingMore} style={{ ...BTN, height: 32, padding: "0 12px", fontSize: 12.5, opacity: p.loadingMore ? 0.6 : 1 }}>
                {p.loadingMore ? "Chargement…" : "Afficher plus de produits"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Volet de droite (comme ComandR) : par-dessus la liste, sous la barre du haut, à droite de la barre latérale.
 * Échap ou clic à côté : `onFermer`. Le pied reçoit les boutons d'action de l'écran appelant.
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
      <div onClick={onFermer} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(26,26,26,0.18)" }} />
      <aside role="dialog" aria-modal="true" style={{
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
          <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 20px", borderTop: `1px solid ${BORD}` }}>{pied}</div>
        )}
      </aside>
    </>
  );
}
