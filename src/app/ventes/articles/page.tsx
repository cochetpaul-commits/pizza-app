"use client";

import { useEffect, useState, useMemo, type CSSProperties } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ── */
type Article = {
  id: string;
  etablissement_id: string;
  nom_vente: string;
  categorie_vente: string | null;
  source: string;
  recette_type: string | null;
  recette_id: string | null;
  ingredient_id: string | null;
  prix_achat: number | null;
  conditionnement: string | null;
  unite_conditionnement: string | null;
  nb_portions: number | null;
  cout_unitaire: number | null;
  prix_vente_ttc: number | null;
  prix_vente_ht: number | null;
  marge_pct: number | null;
  food_cost_pct: number | null;
  notes: string | null;
};

type UnmatchedProduct = {
  nom_vente: string;
  categorie: string;
  qty: number;
  ca_ttc: number;
  prix_unit_ttc: number;
};

type RecipeOption = { id: string; name: string; type: "pizza" | "kitchen" | "cocktail"; cost: number };
type IngredientOption = { id: string; name: string; category: string; purchase_price: number | null; cost_per_unit: number | null; default_unit: string | null };

type Tab = "non-lies" | "lies" | "simulateur";
type SortCol = "nom_vente" | "source" | "cout_unitaire" | "prix_vente_ttc" | "marge_pct" | "food_cost_pct";

/* ── Helpers ── */
const fmt = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "\u20AC";
const fmtPct = (v: number | null) => (v !== null ? v.toFixed(1) + "%" : "-");

const COLORS = {
  green: "#3a7d44",
  orange: "#d4a03c",
  red: "#c0392b",
  accent: "#D4775A",
  bg: "#f2ede4",
  border: "#e0d8ce",
  card: "#fff",
  dark: "#1a1a1a",
  muted: "#999",
};

function foodCostColor(fc: number | null): string {
  if (fc === null) return COLORS.muted;
  if (fc < 30) return COLORS.green;
  if (fc <= 35) return COLORS.orange;
  return COLORS.red;
}

/* ── Styles ── */
const S = {
  page: {
    maxWidth: 960,
    margin: "0 auto",
    padding: "24px 16px 60px",
    fontFamily: "var(--font-dm-sans), DM Sans, sans-serif",
  } as CSSProperties,
  heading: {
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    fontSize: 28,
    fontWeight: 700,
    color: COLORS.dark,
    margin: 0,
  } as CSSProperties,
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
    margin: "4px 0 20px",
  } as CSSProperties,
  card: {
    background: COLORS.card,
    borderRadius: 12,
    padding: "18px 20px",
    border: `1px solid ${COLORS.border}`,
    marginBottom: 14,
  } as CSSProperties,
  statsBar: {
    display: "flex",
    gap: 12,
    marginBottom: 20,
    flexWrap: "wrap" as const,
  } as CSSProperties,
  statCard: {
    background: COLORS.card,
    borderRadius: 12,
    padding: "14px 18px",
    border: `1px solid ${COLORS.border}`,
    flex: "1 1 180px",
    minWidth: 150,
  } as CSSProperties,
  statLabel: {
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: COLORS.muted,
    fontWeight: 500,
    marginBottom: 4,
  } as CSSProperties,
  statValue: {
    fontFamily: "var(--font-oswald), Oswald, sans-serif",
    fontSize: 24,
    fontWeight: 700,
    color: COLORS.dark,
    lineHeight: 1.2,
  } as CSSProperties,
  tabs: {
    display: "flex",
    gap: 0,
    marginBottom: 20,
    borderBottom: `2px solid ${COLORS.border}`,
  } as CSSProperties,
  th: {
    padding: "10px 8px",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: COLORS.muted,
    fontWeight: 600,
    textAlign: "left" as const,
    borderBottom: `2px solid ${COLORS.border}`,
    whiteSpace: "nowrap" as const,
    cursor: "pointer",
  } as CSSProperties,
  thR: {
    padding: "10px 8px",
    fontSize: 10,
    textTransform: "uppercase" as const,
    letterSpacing: ".08em",
    color: COLORS.muted,
    fontWeight: 600,
    textAlign: "right" as const,
    borderBottom: `2px solid ${COLORS.border}`,
    whiteSpace: "nowrap" as const,
    cursor: "pointer",
  } as CSSProperties,
  td: {
    padding: "8px 8px",
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.dark,
  } as CSSProperties,
  tdR: {
    padding: "8px 8px",
    fontSize: 13,
    borderBottom: `1px solid ${COLORS.border}`,
    color: COLORS.dark,
    textAlign: "right" as const,
    fontVariantNumeric: "tabular-nums",
  } as CSSProperties,
  btn: (bg: string) =>
    ({
      padding: "7px 16px",
      borderRadius: 20,
      border: "none",
      background: bg,
      color: "#fff",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
    }) as CSSProperties,
  btnOutline: {
    padding: "7px 16px",
    borderRadius: 20,
    border: `1px solid ${COLORS.border}`,
    background: "transparent",
    color: COLORS.dark,
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
  } as CSSProperties,
  input: {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box" as const,
  } as CSSProperties,
  select: {
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    fontSize: 13,
    fontFamily: "inherit",
    width: "100%",
    boxSizing: "border-box" as const,
    background: "#fff",
  } as CSSProperties,
};

const PER_PAGE = 20;

/* ══════════════════════════════════════════════════════
   COMPONENT
   ══════════════════════════════════════════════════════ */

export default function ArticlesVentePage() {
  const { current: etab } = useEtablissement();
  const accent = etab?.couleur ?? COLORS.accent;

  const [tab, setTab] = useState<Tab>("non-lies");
  const [articles, setArticles] = useState<Article[]>([]);
  const [unmatched, setUnmatched] = useState<UnmatchedProduct[]>([]);
  const [recipes, setRecipes] = useState<RecipeOption[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Linked table state
  const [sortCol, setSortCol] = useState<SortCol>("nom_vente");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [linkedPage, setLinkedPage] = useState(0);
  const [searchLinked, setSearchLinked] = useState("");

  // Linking state
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [linkMode, setLinkMode] = useState<"recette" | "achat" | "manuel" | null>(null);
  const [linkRecipeId, setLinkRecipeId] = useState("");
  const [linkRecipeType, setLinkRecipeType] = useState("");
  const [linkIngredientId, setLinkIngredientId] = useState("");
  const [linkNbPortions, setLinkNbPortions] = useState("");
  const [linkPrixAchat, setLinkPrixAchat] = useState("");
  const [linkPrixVente, setLinkPrixVente] = useState("");
  const [linkConditionnement, setLinkConditionnement] = useState("");
  const [linkNotes, setLinkNotes] = useState("");
  const [recipeSearch, setRecipeSearch] = useState("");
  const [ingredientSearch, setIngredientSearch] = useState("");

  // Simulateur
  const [simPrixAchat, setSimPrixAchat] = useState("");
  const [simVolume, setSimVolume] = useState("");
  const [simUnite, setSimUnite] = useState("cl");
  const [simVolDose, setSimVolDose] = useState("");
  const [simTva, setSimTva] = useState("10");
  const [simCoeff, setSimCoeff] = useState("");
  const [simPvTtc, setSimPvTtc] = useState("");
  const [simLastEdited, setSimLastEdited] = useState<"coeff" | "pv" | null>(null);

  /* ── Fetch data ── */
  const fetchData = async () => {
    if (!etab?.id) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/ventes/articles?etablissement_id=${etab.id}`);
      const json = await res.json();
      if (json.error) {
        console.error(json.error);
        return;
      }
      setArticles(json.articles ?? []);
      setUnmatched(json.unmatched ?? []);
      setRecipes(json.recipes ?? []);
      setIngredients(json.ingredients ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etab?.id]);

  /* ── Stats ── */
  const totalVendu = unmatched.length + articles.length;
  const nbLies = articles.length;
  const couverture = totalVendu > 0 ? Math.round((nbLies / totalVendu) * 100) : 0;

  /* ── Save article (link or update) ── */
  const saveArticle = async (nomVente: string, categorieVente?: string) => {
    if (!etab?.id) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        etablissement_id: etab.id,
        nom_vente: nomVente,
        categorie_vente: categorieVente || null,
        prix_vente_ttc: linkPrixVente ? Number(linkPrixVente) : null,
        notes: linkNotes || null,
        conditionnement: linkConditionnement || null,
      };

      if (linkMode === "recette" && linkRecipeId) {
        const recipe = recipes.find((r) => r.id === linkRecipeId);
        body.recette_id = linkRecipeId;
        body.recette_type = recipe?.type || linkRecipeType;
      } else if (linkMode === "achat" && linkIngredientId) {
        body.ingredient_id = linkIngredientId;
        body.nb_portions = linkNbPortions ? Number(linkNbPortions) : 1;
        if (linkPrixAchat) body.prix_achat = Number(linkPrixAchat);
      } else if (linkMode === "manuel") {
        body.prix_achat = linkPrixAchat ? Number(linkPrixAchat) : null;
        body.nb_portions = linkNbPortions ? Number(linkNbPortions) : 1;
      }

      const res = await fetch("/api/ventes/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.error) {
        alert("Erreur: " + json.error);
        return;
      }

      // Reset form
      resetLinkForm();
      await fetchData();
    } catch (e) {
      alert("Erreur: " + String(e));
    } finally {
      setSaving(false);
    }
  };

  const resetLinkForm = () => {
    setExpandedRow(null);
    setLinkMode(null);
    setLinkRecipeId("");
    setLinkRecipeType("");
    setLinkIngredientId("");
    setLinkNbPortions("");
    setLinkPrixAchat("");
    setLinkPrixVente("");
    setLinkConditionnement("");
    setLinkNotes("");
    setRecipeSearch("");
    setIngredientSearch("");
  };

  /* ── Delete article ── */
  const deleteArticle = async (id: string) => {
    if (!confirm("Supprimer cet article ?")) return;
    await fetch(`/api/ventes/articles?id=${id}`, { method: "DELETE" });
    await fetchData();
  };

  /* ── Linked table sort/filter/paginate ── */
  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "nom_vente" ? "asc" : "desc");
    }
    setLinkedPage(0);
  };

  const filteredLinked = useMemo(() => {
    let list = [...articles];
    if (searchLinked) {
      const s = searchLinked.toLowerCase();
      list = list.filter((a) => a.nom_vente.toLowerCase().includes(s));
    }
    list.sort((a, b) => {
      const av = a[sortCol] ?? 0;
      const bv = b[sortCol] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv, "fr") : bv.localeCompare(av, "fr");
      }
      return sortDir === "asc" ? Number(av) - Number(bv) : Number(bv) - Number(av);
    });
    return list;
  }, [articles, searchLinked, sortCol, sortDir]);

  const pagedLinked = filteredLinked.slice(linkedPage * PER_PAGE, (linkedPage + 1) * PER_PAGE);
  const totalPages = Math.ceil(filteredLinked.length / PER_PAGE);

  /* ── Simulateur calculations ── */
  const simPrixAchatN = Number(simPrixAchat) || 0;
  const simVolumeN = Number(simVolume) || 0;
  const simDoseN = Number(simVolDose) || 0;
  const simTvaN = Number(simTva) || 10;
  const simNbPortions = simVolumeN > 0 && simDoseN > 0 ? Math.floor(simVolumeN / simDoseN) : 0;
  const simCoutDose = simNbPortions > 0 ? simPrixAchatN / simNbPortions : 0;

  // Derived from coeff or PV TTC (bidirectional)
  const simCoeffN = Number(simCoeff) || 0;
  const simPvTtcN = Number(simPvTtc) || 0;

  let simCalcPvTtc = 0;
  let simCalcCoeff = 0;
  let simCalcPvHt = 0;
  let simCalcMarge = 0;
  let simCalcFoodCost: number | null = null;

  if (simCoutDose > 0) {
    if (simLastEdited === "pv" && simPvTtcN > 0) {
      simCalcPvTtc = simPvTtcN;
      simCalcPvHt = simPvTtcN / (1 + simTvaN / 100);
      simCalcCoeff = simPvTtcN / simCoutDose;
      simCalcMarge = simCalcPvHt - simCoutDose;
      simCalcFoodCost = (simCoutDose / simCalcPvHt) * 100;
    } else if (simLastEdited === "coeff" && simCoeffN > 0) {
      simCalcCoeff = simCoeffN;
      simCalcPvTtc = simCoutDose * simCoeffN;
      simCalcPvHt = simCalcPvTtc / (1 + simTvaN / 100);
      simCalcMarge = simCalcPvHt - simCoutDose;
      simCalcFoodCost = (simCoutDose / simCalcPvHt) * 100;
    }
  }

  const simSetFromPreset = (targetFc: number) => {
    if (simCoutDose <= 0) return;
    // FC = coutDose / pvHT * 100 => pvHT = coutDose / (targetFc/100)
    const pvHt = simCoutDose / (targetFc / 100);
    const pvTtc = pvHt * (1 + simTvaN / 100);
    const coeff = pvTtc / simCoutDose;
    setSimCoeff(coeff.toFixed(2));
    setSimPvTtc(pvTtc.toFixed(2));
    setSimLastEdited("coeff");
  };

  const simPresetPvTtc = (targetFc: number) => {
    if (simCoutDose <= 0) return 0;
    const pvHt = simCoutDose / (targetFc / 100);
    return pvHt * (1 + simTvaN / 100);
  };

  /* ── Filtered recipes/ingredients for search ── */
  const filteredRecipes = useMemo(() => {
    if (!recipeSearch) return recipes;
    const s = recipeSearch.toLowerCase();
    return recipes.filter((r) => r.name.toLowerCase().includes(s));
  }, [recipes, recipeSearch]);

  const filteredIngredients = useMemo(() => {
    if (!ingredientSearch) return ingredients;
    const s = ingredientSearch.toLowerCase();
    return ingredients.filter((i) => i.name.toLowerCase().includes(s));
  }, [ingredients, ingredientSearch]);

  /* ── Source label helper ── */
  const sourceLabel = (a: Article) => {
    if (a.source === "recette") {
      const typeLabel = a.recette_type === "pizza" ? "Pizza" : a.recette_type === "kitchen" ? "Cuisine" : a.recette_type === "cocktail" ? "Cocktail" : "Recette";
      return typeLabel;
    }
    if (a.source === "achat") return "Achat";
    return "Manuel";
  };

  /* ── Tab button style ── */
  const tabBtn = (t: Tab): CSSProperties => ({
    padding: "10px 20px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    color: tab === t ? accent : COLORS.muted,
    borderBottom: tab === t ? `3px solid ${accent}` : "3px solid transparent",
    transition: "all .15s",
  });

  /* ── Linking inline form ── */
  const renderLinkForm = (product: UnmatchedProduct) => {
    if (expandedRow !== product.nom_vente) return null;

    return (
      <tr>
        <td colSpan={5} style={{ padding: "16px 8px", background: "#faf7f2", borderBottom: `1px solid ${COLORS.border}` }}>
          <div style={{ maxWidth: 600 }}>
            {/* Link mode selector */}
            <div className="ventes-link-modes" style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
              {(["recette", "achat", "manuel"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setLinkMode(m); setLinkRecipeId(""); setLinkIngredientId(""); }}
                  style={{
                    ...S.btnOutline,
                    background: linkMode === m ? accent : "transparent",
                    color: linkMode === m ? "#fff" : COLORS.dark,
                    borderColor: linkMode === m ? accent : COLORS.border,
                  }}
                >
                  {m === "recette" ? "Lier a une recette" : m === "achat" ? "Lier a un produit d'achat" : "Saisir un cout manuellement"}
                </button>
              ))}
            </div>

            {/* Recipe linking */}
            {linkMode === "recette" && (
              <div>
                <input
                  style={{ ...S.input, marginBottom: 8 }}
                  placeholder="Rechercher une recette..."
                  value={recipeSearch}
                  onChange={(e) => setRecipeSearch(e.target.value)}
                />
                <select
                  style={S.select}
                  value={linkRecipeId}
                  onChange={(e) => {
                    setLinkRecipeId(e.target.value);
                    const r = recipes.find((r) => r.id === e.target.value);
                    if (r) setLinkRecipeType(r.type);
                  }}
                >
                  <option value="">-- Choisir une recette --</option>
                  {filteredRecipes.map((r) => (
                    <option key={r.id} value={r.id}>
                      [{r.type === "pizza" ? "Pizza" : r.type === "kitchen" ? "Cuisine" : "Cocktail"}] {r.name} ({fmt(r.cost)})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Ingredient linking */}
            {linkMode === "achat" && (
              <div>
                <input
                  style={{ ...S.input, marginBottom: 8 }}
                  placeholder="Rechercher un ingredient..."
                  value={ingredientSearch}
                  onChange={(e) => setIngredientSearch(e.target.value)}
                />
                <select
                  style={{ ...S.select, marginBottom: 8 }}
                  value={linkIngredientId}
                  onChange={(e) => setLinkIngredientId(e.target.value)}
                >
                  <option value="">-- Choisir un produit --</option>
                  {filteredIngredients.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} {i.purchase_price ? `(${fmt(i.purchase_price)})` : ""}
                    </option>
                  ))}
                </select>
                <div style={{ display: "flex", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: COLORS.muted }}>Nb portions / bouteille</label>
                    <input
                      style={S.input}
                      type="number"
                      min="1"
                      step="1"
                      placeholder="Ex: 6"
                      value={linkNbPortions}
                      onChange={(e) => setLinkNbPortions(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: COLORS.muted }}>Prix achat (optionnel)</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="Surcharger le prix"
                      value={linkPrixAchat}
                      onChange={(e) => setLinkPrixAchat(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Manual cost */}
            {linkMode === "manuel" && (
              <div style={{ display: "flex", gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: COLORS.muted }}>Prix d&apos;achat</label>
                  <input
                    style={S.input}
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Ex: 12.50"
                    value={linkPrixAchat}
                    onChange={(e) => setLinkPrixAchat(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: COLORS.muted }}>Nb portions</label>
                  <input
                    style={S.input}
                    type="number"
                    min="1"
                    step="1"
                    placeholder="Ex: 1"
                    value={linkNbPortions}
                    onChange={(e) => setLinkNbPortions(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Common fields */}
            {linkMode && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: COLORS.muted }}>Prix vente TTC</label>
                    <input
                      style={S.input}
                      type="number"
                      min="0"
                      step="0.5"
                      placeholder="Ex: 9.00"
                      value={linkPrixVente}
                      onChange={(e) => setLinkPrixVente(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: COLORS.muted }}>Conditionnement</label>
                    <input
                      style={S.input}
                      placeholder="Ex: bouteille 75cL"
                      value={linkConditionnement}
                      onChange={(e) => setLinkConditionnement(e.target.value)}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: COLORS.muted }}>Notes</label>
                  <input
                    style={S.input}
                    placeholder="Notes optionnelles"
                    value={linkNotes}
                    onChange={(e) => setLinkNotes(e.target.value)}
                  />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    style={S.btn(accent)}
                    disabled={saving}
                    onClick={() => saveArticle(product.nom_vente, product.categorie)}
                  >
                    {saving ? "Enregistrement..." : "Enregistrer"}
                  </button>
                  <button style={S.btnOutline} onClick={resetLinkForm}>
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </td>
      </tr>
    );
  };

  /* ── Sort indicator ── */
  const sortArrow = (col: SortCol) => {
    if (sortCol !== col) return "";
    return sortDir === "asc" ? " \u25B2" : " \u25BC";
  };

  /* ══════════════════ RENDER ══════════════════ */

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div className="ventes-articles-container" style={S.page}>
        <h1 style={S.heading}>Articles de vente</h1>
        <p style={S.subtitle}>{etab?.nom ?? "Chargement..."}</p>

        {/* Stats bar */}
        <div className="ventes-articles-stats" style={S.statsBar}>
          <div style={S.statCard}>
            <div style={S.statLabel}>Articles lies</div>
            <div style={S.statValue}>{nbLies}</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Produits vendus</div>
            <div style={S.statValue}>{totalVendu}</div>
          </div>
          <div style={S.statCard}>
            <div style={S.statLabel}>Couverture</div>
            <div style={{ ...S.statValue, color: couverture >= 80 ? COLORS.green : couverture >= 50 ? COLORS.orange : COLORS.red }}>
              {couverture}%
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div style={S.tabs}>
          <button style={tabBtn("non-lies")} onClick={() => setTab("non-lies")}>
            Non lies ({unmatched.length})
          </button>
          <button style={tabBtn("lies")} onClick={() => setTab("lies")}>
            Lies ({articles.length})
          </button>
          <button style={tabBtn("simulateur")} onClick={() => setTab("simulateur")}>
            Simulateur
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: "center", padding: 40, color: COLORS.muted }}>Chargement...</div>
        )}

        {/* ── TAB: Non lies ── */}
        {!loading && tab === "non-lies" && (
          <div style={S.card}>
            {unmatched.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: COLORS.muted }}>
                Tous les produits vendus sont lies.
              </div>
            ) : (
              <div className="ventes-table-scroll" style={{ overflowX: "auto" }}>
              <table className="ventes-articles-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Produit</th>
                    <th style={S.th}>Categorie</th>
                    <th style={{ ...S.thR, cursor: "default" }}>Qty vendues</th>
                    <th style={{ ...S.thR, cursor: "default" }}>CA TTC</th>
                    <th style={{ ...S.thR, cursor: "default" }}>Prix unit.</th>
                    <th style={{ ...S.th, textAlign: "center", cursor: "default" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {unmatched.map((p) => (
                    <>
                      <tr key={p.nom_vente} style={{ background: expandedRow === p.nom_vente ? "#faf7f2" : "transparent" }}>
                        <td style={S.td}>{p.nom_vente}</td>
                        <td style={S.td}>
                          <span style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 8,
                            background: "#f0ece4",
                            color: COLORS.dark,
                          }}>{p.categorie}</span>
                        </td>
                        <td style={S.tdR}>{p.qty}</td>
                        <td style={S.tdR}>{fmt(p.ca_ttc)}</td>
                        <td style={{ ...S.tdR, color: accent, fontWeight: 600 }}>{p.prix_unit_ttc ? p.prix_unit_ttc.toFixed(2) + "\u20AC" : "\u2014"}</td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          {expandedRow === p.nom_vente ? (
                            <button style={S.btnOutline} onClick={resetLinkForm}>Fermer</button>
                          ) : (
                            <button
                              style={S.btn(accent)}
                              onClick={() => {
                                resetLinkForm();
                                setExpandedRow(p.nom_vente);
                                if (p.prix_unit_ttc) setLinkPrixVente(String(p.prix_unit_ttc));
                              }}
                            >
                              Lier
                            </button>
                          )}
                        </td>
                      </tr>
                      {renderLinkForm(p)}
                    </>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: Lies ── */}
        {!loading && tab === "lies" && (
          <div style={S.card}>
            <div style={{ marginBottom: 12 }}>
              <input
                style={{ ...S.input, maxWidth: 300 }}
                placeholder="Rechercher un article..."
                value={searchLinked}
                onChange={(e) => { setSearchLinked(e.target.value); setLinkedPage(0); }}
              />
            </div>
            {filteredLinked.length === 0 ? (
              <div style={{ textAlign: "center", padding: 20, color: COLORS.muted }}>
                Aucun article lie.
              </div>
            ) : (
              <>
                <div className="ventes-table-scroll" style={{ overflowX: "auto" }}>
                <table className="ventes-articles-linked-table" style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
                  <thead>
                    <tr>
                      <th style={S.th} onClick={() => handleSort("nom_vente")}>Produit{sortArrow("nom_vente")}</th>
                      <th style={S.th} onClick={() => handleSort("source")}>Source{sortArrow("source")}</th>
                      <th style={S.thR} onClick={() => handleSort("cout_unitaire")}>Cout unit.{sortArrow("cout_unitaire")}</th>
                      <th style={S.thR} onClick={() => handleSort("prix_vente_ttc")}>Prix vente{sortArrow("prix_vente_ttc")}</th>
                      <th style={S.thR} onClick={() => handleSort("marge_pct")}>Marge{sortArrow("marge_pct")}</th>
                      <th style={S.thR} onClick={() => handleSort("food_cost_pct")}>Food cost{sortArrow("food_cost_pct")}</th>
                      <th style={{ ...S.th, textAlign: "center", cursor: "default" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedLinked.map((a) => (
                      <tr key={a.id} style={{ cursor: "default" }}>
                        <td style={S.td}>
                          <div style={{ fontWeight: 600 }}>{a.nom_vente}</div>
                          {a.categorie_vente && (
                            <span style={{ fontSize: 11, color: COLORS.muted }}>{a.categorie_vente}</span>
                          )}
                        </td>
                        <td style={S.td}>
                          <span style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 8,
                            background: a.source === "recette" ? "#e8f5e9" : a.source === "achat" ? "#e3f2fd" : "#fff3e0",
                            color: a.source === "recette" ? "#2e7d32" : a.source === "achat" ? "#1565c0" : "#e65100",
                          }}>
                            {sourceLabel(a)}
                          </span>
                        </td>
                        <td style={S.tdR}>{a.cout_unitaire !== null ? fmt(a.cout_unitaire) : "-"}</td>
                        <td style={S.tdR}>{a.prix_vente_ttc !== null ? fmt(a.prix_vente_ttc) : "-"}</td>
                        <td style={{ ...S.tdR, color: a.marge_pct !== null ? (a.marge_pct >= 70 ? COLORS.green : a.marge_pct >= 65 ? COLORS.orange : COLORS.red) : COLORS.muted }}>
                          {fmtPct(a.marge_pct)}
                        </td>
                        <td style={{ ...S.tdR, fontWeight: 600, color: foodCostColor(a.food_cost_pct) }}>
                          {fmtPct(a.food_cost_pct)}
                        </td>
                        <td style={{ ...S.td, textAlign: "center" }}>
                          <button
                            onClick={() => deleteArticle(a.id)}
                            style={{ border: "none", background: "transparent", color: COLORS.red, cursor: "pointer", fontSize: 13, fontWeight: 500 }}
                          >
                            Supprimer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div style={{ display: "flex", justifyContent: "center", gap: 8, marginTop: 14 }}>
                    <button
                      style={S.btnOutline}
                      disabled={linkedPage === 0}
                      onClick={() => setLinkedPage((p) => Math.max(0, p - 1))}
                    >
                      Precedent
                    </button>
                    <span style={{ padding: "7px 12px", fontSize: 13, color: COLORS.muted }}>
                      {linkedPage + 1} / {totalPages}
                    </span>
                    <button
                      style={S.btnOutline}
                      disabled={linkedPage >= totalPages - 1}
                      onClick={() => setLinkedPage((p) => Math.min(totalPages - 1, p + 1))}
                    >
                      Suivant
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── TAB: Simulateur ── */}
        {!loading && tab === "simulateur" && (
          <div style={S.card}>
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color: COLORS.dark, margin: "0 0 16px" }}>
              Simulateur de prix
            </h2>
            <p style={{ fontSize: 13, color: COLORS.muted, marginBottom: 16 }}>
              Calculez le nombre de portions, le cout par dose, et simulez vos prix de vente.
            </p>

            {/* Row 1: prix achat, volume, unite, dose */}
            <div className="ventes-sim-inputs" style={{ display: "flex", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Prix d&apos;achat (EUR)</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 18.50"
                  value={simPrixAchat}
                  onChange={(e) => setSimPrixAchat(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Volume / Conditionnement</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 75"
                  value={simVolume}
                  onChange={(e) => setSimVolume(e.target.value)}
                />
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Unite</label>
                <select
                  style={S.select}
                  value={simUnite}
                  onChange={(e) => setSimUnite(e.target.value)}
                >
                  <option value="cl">cl</option>
                  <option value="L">L</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="unit">unit</option>
                </select>
              </div>
              <div style={{ flex: "1 1 140px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Volume dose / portion</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Ex: 12"
                  value={simVolDose}
                  onChange={(e) => setSimVolDose(e.target.value)}
                />
              </div>
            </div>

            {/* Row 2: TVA, Coeff, PV TTC */}
            <div className="ventes-sim-inputs" style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 120px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>TVA (%)</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.5"
                  value={simTva}
                  onChange={(e) => setSimTva(e.target.value)}
                />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Coefficient multiplicateur</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.1"
                  placeholder={simCalcCoeff > 0 && simLastEdited === "pv" ? simCalcCoeff.toFixed(2) : "Ex: 3.5"}
                  value={simCoeff}
                  onChange={(e) => {
                    setSimCoeff(e.target.value);
                    setSimLastEdited("coeff");
                    // Sync PV TTC from coeff
                    const c = Number(e.target.value);
                    if (c > 0 && simCoutDose > 0) {
                      setSimPvTtc((simCoutDose * c).toFixed(2));
                    }
                  }}
                />
              </div>
              <div style={{ flex: "1 1 160px" }}>
                <label style={{ fontSize: 11, color: COLORS.muted, display: "block", marginBottom: 4 }}>Prix de vente TTC (EUR)</label>
                <input
                  style={S.input}
                  type="number"
                  min="0"
                  step="0.5"
                  placeholder={simCalcPvTtc > 0 && simLastEdited === "coeff" ? simCalcPvTtc.toFixed(2) : "Ex: 9.00"}
                  value={simPvTtc}
                  onChange={(e) => {
                    setSimPvTtc(e.target.value);
                    setSimLastEdited("pv");
                    // Sync coeff from PV TTC
                    const pv = Number(e.target.value);
                    if (pv > 0 && simCoutDose > 0) {
                      setSimCoeff((pv / simCoutDose).toFixed(2));
                    }
                  }}
                />
              </div>
            </div>

            {/* Quick presets */}
            {simCoutDose > 0 && (
              <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
                {[25, 30, 35].map((fc) => (
                  <button
                    key={fc}
                    style={{
                      ...S.btnOutline,
                      borderColor: simCalcFoodCost !== null && Math.abs(simCalcFoodCost - fc) < 0.5 ? accent : COLORS.border,
                      color: simCalcFoodCost !== null && Math.abs(simCalcFoodCost - fc) < 0.5 ? accent : COLORS.dark,
                    }}
                    onClick={() => simSetFromPreset(fc)}
                  >
                    Objectif {fc}% FC → {fmt(simPresetPvTtc(fc))}
                  </button>
                ))}
              </div>
            )}

            {/* Results card */}
            {simCoutDose > 0 && (
              <div style={{ background: "#faf7f2", borderRadius: 12, padding: 20, border: `1px solid ${COLORS.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
                  <div style={S.statCard}>
                    <div style={S.statLabel}>Nb portions</div>
                    <div style={S.statValue}>{simNbPortions}</div>
                  </div>
                  <div style={S.statCard}>
                    <div style={S.statLabel}>Cout par dose</div>
                    <div style={S.statValue}>{fmt(simCoutDose)}</div>
                  </div>
                  {simCalcPvHt > 0 && (
                    <>
                      <div style={S.statCard}>
                        <div style={S.statLabel}>Prix de vente HT</div>
                        <div style={S.statValue}>{fmt(simCalcPvHt)}</div>
                      </div>
                      <div style={S.statCard}>
                        <div style={S.statLabel}>Prix de vente TTC</div>
                        <div style={S.statValue}>{fmt(simCalcPvTtc)}</div>
                      </div>
                      <div style={S.statCard}>
                        <div style={S.statLabel}>Coefficient</div>
                        <div style={S.statValue}>{simCalcCoeff.toFixed(2)}x</div>
                      </div>
                      <div style={S.statCard}>
                        <div style={S.statLabel}>Marge brute</div>
                        <div style={{ ...S.statValue, color: simCalcMarge >= 0 ? COLORS.green : COLORS.red }}>{fmt(simCalcMarge)}</div>
                      </div>
                      <div style={S.statCard}>
                        <div style={S.statLabel}>Food cost</div>
                        <div style={{
                          ...S.statValue,
                          color: simCalcFoodCost !== null
                            ? simCalcFoodCost < 30 ? COLORS.green : simCalcFoodCost <= 35 ? COLORS.orange : COLORS.red
                            : COLORS.muted,
                        }}>
                          {simCalcFoodCost !== null ? simCalcFoodCost.toFixed(1) + "%" : "-"}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </RequireRole>
  );
}
