"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { NavBar } from "@/components/NavBar";
import { TopNav } from "@/components/TopNav";
import { StepperInput } from "@/components/StepperInput";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { supabase } from "@/lib/supabaseClient";
import { CATEGORIES, CAT_LABELS, CAT_COLORS, type Category } from "@/types/ingredients";

/* ─── Types ─── */
type Fournisseur = "mael" | "metro";
type Statut = "brouillon" | "en_attente" | "valide" | "commande" | "recu";

interface Session {
  id: string;
  fournisseur: Fournisseur;
  statut: Statut;
  semaine: string;
  notes: string | null;
  created_by: string;
  validated_by: string | null;
  created_at: string;
  validated_at: string | null;
  commande_lignes: Ligne[];
}

interface Ligne {
  id: string;
  session_id: string;
  ingredient_id: string | null;
  nom_libre: string | null;
  categorie: string;
  quantite: number;
  unite: string;
  urgent: boolean;
  notes: string | null;
}

interface IngredientRow {
  id: string;
  name: string;
  category: Category;
  supplier_id: string | null;
  is_active: boolean;
  favori_commande: boolean;
  purchase_unit_label: string | null;
}

/* ─── Helpers ─── */
function currentWeek(): string {
  const d = new Date();
  const start = new Date(d.getFullYear(), 0, 1);
  const diff = d.getTime() - start.getTime();
  const week = Math.ceil((diff / 86400000 + start.getDay() + 1) / 7);
  return `${d.getFullYear()}-S${String(week).padStart(2, "0")}`;
}

async function authHeaders() {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    Authorization: token ? `Bearer ${token}` : "",
  };
}

const FOURNISSEUR_LABELS: Record<Fournisseur, string> = {
  mael: "Maël",
  metro: "Metro",
};

/* ─── Main Page ─── */
export default function CommandesPage() {
  const { current: etab } = useEtablissement();
  const { role, displayName, canWrite } = useProfile();

  const [fournisseur, setFournisseur] = useState<Fournisseur>("mael");
  const [session, setSession] = useState<Session | null>(null);
  const [ingredients, setIngredients] = useState<IngredientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Map ingredient_id -> quantite for quick access
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  // Track which lines exist (ingredient_id -> ligne.id)
  const [ligneIds, setLigneIds] = useState<Record<string, string>>({});

  // Accordion open state per category
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  // Confirmation banner
  const [confirmation, setConfirmation] = useState<string | null>(null);

  // Validator display name
  const [validatorName, setValidatorName] = useState<string | null>(null);

  /* ─── Load data ─── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Load ingredients for this fournisseur
      const { data: suppData } = await supabase
        .from("suppliers")
        .select("id")
        .ilike("name", `%${fournisseur}%`)
        .limit(1)
        .single();

      const supplierId = suppData?.id;

      let ingQuery = supabase
        .from("ingredients")
        .select("id, name, category, supplier_id, is_active, favori_commande, purchase_unit_label")
        .eq("is_active", true)
        .order("name");

      if (supplierId) {
        ingQuery = ingQuery.eq("supplier_id", supplierId);
      }

      if (etab?.id) {
        ingQuery = ingQuery.or(`etablissement_id.eq.${etab.id},shared.eq.true`);
      }

      const { data: ingData, error: ingErr } = await ingQuery;
      if (ingErr) throw new Error(ingErr.message);
      setIngredients((ingData ?? []) as IngredientRow[]);

      // 2. Load active session
      const headers = await authHeaders();
      const res = await fetch(
        `/api/commandes/active?fournisseur=${fournisseur}`,
        { headers }
      );
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);

      const sessions: Session[] = json.sessions ?? [];
      const active = sessions.find(
        (s) => s.statut === "brouillon" || s.statut === "en_attente"
      ) ?? null;

      setSession(active);

      // Build quantities map from existing lines
      if (active) {
        const qMap: Record<string, number> = {};
        const lMap: Record<string, string> = {};
        for (const l of active.commande_lignes) {
          if (l.ingredient_id) {
            qMap[l.ingredient_id] = l.quantite;
            lMap[l.ingredient_id] = l.id;
          }
        }
        setQuantities(qMap);
        setLigneIds(lMap);

        // Load validator name if en_attente
        if (active.statut === "en_attente" && active.created_by) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("display_name")
            .eq("id", active.created_by)
            .single();
          setValidatorName(profile?.display_name ?? null);
        }
      } else {
        setQuantities({});
        setLigneIds({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [fournisseur, etab?.id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ─── Accordion defaults: open if has favorites or selected items ─── */
  useEffect(() => {
    if (!ingredients.length) return;
    const opens: Record<string, boolean> = {};
    for (const cat of CATEGORIES) {
      const catIngs = ingredients.filter((i) => i.category === cat);
      const hasFavorite = catIngs.some((i) => i.favori_commande);
      const hasSelected = catIngs.some((i) => quantities[i.id] > 0);
      opens[cat] = hasFavorite || hasSelected;
    }
    setOpenCats(opens);
    // Only recalculate when ingredients or session change, not on every quantity update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingredients, session?.id]);

  /* ─── Session creation ─── */
  const createSession = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch("/api/commandes/session", {
      method: "POST",
      headers,
      body: JSON.stringify({
        fournisseur,
        semaine: currentWeek(),
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json.session as Session;
  }, [fournisseur]);

  /* ─── Quantity change handler ─── */
  const handleQuantityChange = useCallback(
    async (ingredientId: string, cat: string, newQty: number | "") => {
      const qty = newQty === "" ? 0 : Math.floor(newQty);

      // Optimistic update
      setQuantities((prev) => ({ ...prev, [ingredientId]: qty }));

      try {
        const headers = await authHeaders();
        let currentSession = session;

        // Create session if needed
        if (!currentSession) {
          currentSession = await createSession();
          currentSession.commande_lignes = [];
          setSession(currentSession);
        }

        const existingLigneId = ligneIds[ingredientId];

        if (qty === 0 && existingLigneId) {
          // Delete line
          await fetch(`/api/commandes/ligne/${existingLigneId}`, {
            method: "DELETE",
            headers,
          });
          setLigneIds((prev) => {
            const next = { ...prev };
            delete next[ingredientId];
            return next;
          });
        } else if (qty > 0 && existingLigneId) {
          // Update line
          await fetch(`/api/commandes/ligne/${existingLigneId}`, {
            method: "PATCH",
            headers,
            body: JSON.stringify({ quantite: qty }),
          });
        } else if (qty > 0 && !existingLigneId) {
          // Create line
          const res = await fetch("/api/commandes/ligne", {
            method: "POST",
            headers,
            body: JSON.stringify({
              session_id: currentSession.id,
              ingredient_id: ingredientId,
              categorie: cat,
              quantite: qty,
              unite: "pcs",
            }),
          });
          const json = await res.json();
          if (json.ok && json.ligne) {
            setLigneIds((prev) => ({ ...prev, [ingredientId]: json.ligne.id }));
          }
        }
      } catch {
        // Revert optimistic update on error
        loadData();
      }
    },
    [session, ligneIds, createSession, loadData]
  );

  /* ─── Send for validation ─── */
  const sendForValidation = useCallback(async () => {
    if (!session) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/commandes/session/${session.id}/statut`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ statut: "en_attente" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSession({ ...session, statut: "en_attente" });
      setConfirmation("Commande envoyée pour validation");
      setTimeout(() => setConfirmation(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  /* ─── Validate (Paul/admin) ─── */
  const validateOrder = useCallback(async () => {
    if (!session) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/commandes/session/${session.id}/statut`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ statut: "valide" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSession({ ...session, statut: "valide" as Statut });
      setConfirmation("Commande validée");
      setTimeout(() => setConfirmation(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  /* ─── Reject back to brouillon ─── */
  const rejectOrder = useCallback(async () => {
    if (!session) return;
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/commandes/session/${session.id}/statut`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ statut: "brouillon" }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setSession({ ...session, statut: "brouillon" });
      setConfirmation("Commande renvoyée en brouillon");
      setTimeout(() => setConfirmation(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [session]);

  /* ─── Toggle favorite ─── */
  const toggleFavori = useCallback(async (ingredientId: string, currentVal: boolean) => {
    // Optimistic
    setIngredients((prev) =>
      prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: !currentVal } : i))
    );
    try {
      const headers = await authHeaders();
      const res = await fetch("/api/commandes/favori", {
        method: "PATCH",
        headers,
        body: JSON.stringify({ ingredient_id: ingredientId, favori: !currentVal }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
    } catch {
      // Revert
      setIngredients((prev) =>
        prev.map((i) => (i.id === ingredientId ? { ...i, favori_commande: currentVal } : i))
      );
    }
  }, []);

  /* ─── Computed values ─── */
  const isReadOnly = session?.statut === "en_attente" || session?.statut === "valide" || session?.statut === "commande";
  const totalArticles = Object.values(quantities).filter((q) => q > 0).length;

  // Group ingredients by category
  const categorizedIngredients = useMemo(() => {
    const map: Record<string, { favoris: IngredientRow[]; others: IngredientRow[] }> = {};
    for (const cat of CATEGORIES) {
      const catIngs = ingredients
        .filter((i) => i.category === cat)
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
      map[cat] = {
        favoris: catIngs.filter((i) => i.favori_commande),
        others: catIngs.filter((i) => !i.favori_commande),
      };
    }
    return map;
  }, [ingredients]);

  // Categories that have ingredients
  const activeCategories = CATEGORIES.filter(
    (cat) =>
      (categorizedIngredients[cat]?.favoris.length ?? 0) +
        (categorizedIngredients[cat]?.others.length ?? 0) >
      0
  );

  /* ─── NavBar actions ─── */
  const navActions = useMemo(() => {
    if (!session) return undefined;
    if (session.statut === "brouillon" && totalArticles > 0) {
      return (
        <button
          className="btn btnPrimary"
          onClick={sendForValidation}
          style={{ fontSize: 12 }}
        >
          Envoyer pour validation
        </button>
      );
    }
    if (session.statut === "en_attente" && canWrite) {
      return (
        <div style={{ display: "flex", gap: 6 }}>
          <button className="btn btnDanger" onClick={rejectOrder} style={{ fontSize: 12 }}>
            Refuser
          </button>
          <button className="btn btnPrimary" onClick={validateOrder} style={{ fontSize: 12 }}>
            Valider
          </button>
        </div>
      );
    }
    return undefined;
  }, [session, totalArticles, canWrite, sendForValidation, validateOrder, rejectOrder]);

  /* ─── Render ─── */
  if (loading) {
    return (
      <>
        <NavBar backHref="/" backLabel="Accueil" />
        <main className="container safe-bottom">
          <div className="card" style={{ textAlign: "center", padding: 40 }}>
            Chargement…
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <NavBar backHref="/" backLabel="Accueil" primaryAction={navActions} />
      <main className="container safe-bottom">
        <TopNav
          title="Commandes"
          eyebrow="FOURNISSEURS"
          subtitle={session ? `Semaine ${session.semaine}` : currentWeek()}
        />

        {error && <div className="errorBox" style={{ marginBottom: 16 }}>{error}</div>}

        {/* ── Confirmation banner ── */}
        {confirmation && (
          <div style={confirmationStyle}>{confirmation}</div>
        )}

        {/* ── En attente banner ── */}
        {session?.statut === "en_attente" && (
          <div style={pendingBannerStyle}>
            En attente de validation — {validatorName ?? displayName ?? "…"}
          </div>
        )}

        {/* ── Validated banner ── */}
        {session?.statut === "valide" && (
          <div style={validatedBannerStyle}>
            Commande validée
            {session.validated_at && ` le ${new Date(session.validated_at).toLocaleDateString("fr-FR")}`}
          </div>
        )}

        {/* ── Fournisseur tabs ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {(["mael", "metro"] as Fournisseur[]).map((f) => (
            <button
              key={f}
              className="btn"
              onClick={() => setFournisseur(f)}
              style={{
                background: fournisseur === f ? "#D4775A" : "#fff",
                color: fournisseur === f ? "#fff" : "#1a1a1a",
                border: `1.5px solid ${fournisseur === f ? "#D4775A" : "#ddd6c8"}`,
                fontWeight: 700,
                fontSize: 14,
                padding: "8px 20px",
                borderRadius: 10,
              }}
            >
              {FOURNISSEUR_LABELS[f]}
            </button>
          ))}
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#999", alignSelf: "center" }}>
            {totalArticles} article{totalArticles !== 1 ? "s" : ""} sélectionné{totalArticles !== 1 ? "s" : ""}
          </div>
        </div>

        {/* ── Categories accordion ── */}
        {activeCategories.length === 0 && (
          <div className="card" style={{ textAlign: "center", color: "#999" }}>
            Aucun ingrédient trouvé pour {FOURNISSEUR_LABELS[fournisseur]}.
          </div>
        )}

        {activeCategories.map((cat) => {
          const { favoris, others } = categorizedIngredients[cat];
          const selectedCount = [...favoris, ...others].filter(
            (i) => (quantities[i.id] ?? 0) > 0
          ).length;
          const isOpen = openCats[cat] ?? false;

          return (
            <div key={cat} style={{ marginBottom: 8 }}>
              {/* Accordion header */}
              <button
                type="button"
                onClick={() => setOpenCats((prev) => ({ ...prev, [cat]: !isOpen }))}
                style={{
                  ...accordionHeaderStyle,
                  borderLeft: `4px solid ${CAT_COLORS[cat as Category]}`,
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontSize: 11,
                    transition: "transform 0.2s",
                    transform: isOpen ? "rotate(0deg)" : "rotate(-90deg)",
                    display: "inline-block",
                  }}>
                    ▾
                  </span>
                  <span style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {CAT_LABELS[cat as Category]}
                  </span>
                </span>
                {selectedCount > 0 && (
                  <span style={{
                    background: CAT_COLORS[cat as Category],
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "2px 8px",
                    borderRadius: 10,
                  }}>
                    {selectedCount}
                  </span>
                )}
              </button>

              {/* Accordion body */}
              <div style={{
                maxHeight: isOpen ? 2000 : 0,
                overflow: "hidden",
                transition: "max-height 0.3s ease",
              }}>
                {/* Favoris sub-group */}
                {favoris.length > 0 && (
                  <div style={favorisSectionStyle}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                      letterSpacing: 1.5, color: "#b8860b", marginBottom: 6,
                    }}>
                      Habituels
                    </div>
                    {favoris.map((ing) => (
                      <IngredientLine
                        key={ing.id}
                        ingredient={ing}
                        quantity={quantities[ing.id] ?? 0}
                        onQuantityChange={(q) => handleQuantityChange(ing.id, cat, q)}
                        onToggleFavori={() => toggleFavori(ing.id, ing.favori_commande)}
                        readOnly={isReadOnly}
                      />
                    ))}
                  </div>
                )}

                {/* Other ingredients */}
                <div style={{ background: "#fff", borderRadius: "0 0 12px 12px" }}>
                  {others.map((ing) => (
                    <IngredientLine
                      key={ing.id}
                      ingredient={ing}
                      quantity={quantities[ing.id] ?? 0}
                      onQuantityChange={(q) => handleQuantityChange(ing.id, cat, q)}
                      onToggleFavori={() => toggleFavori(ing.id, ing.favori_commande)}
                      readOnly={isReadOnly}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* Bottom spacer */}
        <div style={{ height: 60 }} />
      </main>
    </>
  );
}

/* ═══════════════════════════════════════════════════════
   IngredientLine — single row in the accordion
   ═══════════════════════════════════════════════════════ */

function IngredientLine({
  ingredient,
  quantity,
  onQuantityChange,
  onToggleFavori,
  readOnly,
}: {
  ingredient: IngredientRow;
  quantity: number;
  onQuantityChange: (q: number | "") => void;
  onToggleFavori: () => void;
  readOnly?: boolean;
}) {
  return (
    <div style={lineStyle}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}>
        <button
          type="button"
          onClick={onToggleFavori}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 16,
            padding: 0,
            lineHeight: 1,
            opacity: ingredient.favori_commande ? 1 : 0.3,
            filter: ingredient.favori_commande ? "none" : "grayscale(100%)",
          }}
          title={ingredient.favori_commande ? "Retirer des habituels" : "Ajouter aux habituels"}
        >
          ⭐
        </button>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontSize: 14,
            fontWeight: quantity > 0 ? 700 : 400,
            color: quantity > 0 ? "#1a1a1a" : "#666",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}>
            {ingredient.name}
          </div>
          {ingredient.purchase_unit_label && (
            <div style={{ fontSize: 11, color: "#999" }}>
              {ingredient.purchase_unit_label}
            </div>
          )}
        </div>
      </div>
      <div style={{ flexShrink: 0 }}>
        {readOnly ? (
          <div style={{
            width: 64,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 700,
            fontSize: 14,
            color: quantity > 0 ? "#1a1a1a" : "#ccc",
          }}>
            {quantity > 0 ? `× ${quantity}` : "—"}
          </div>
        ) : (
          <StepperInput
            value={quantity || ""}
            onChange={onQuantityChange}
            step={1}
            min={0}
            placeholder="0"
            disabled={readOnly}
          />
        )}
      </div>
    </div>
  );
}

/* ─── Styles ─── */
const confirmationStyle: React.CSSProperties = {
  background: "#e8ede6",
  color: "#4a6741",
  padding: "10px 16px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  textAlign: "center",
};

const pendingBannerStyle: React.CSSProperties = {
  background: "#FFF7ED",
  border: "1.5px solid #EA580C",
  color: "#EA580C",
  padding: "10px 16px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  textAlign: "center",
};

const validatedBannerStyle: React.CSSProperties = {
  background: "#e8ede6",
  border: "1.5px solid #4a6741",
  color: "#4a6741",
  padding: "10px 16px",
  borderRadius: 10,
  fontSize: 14,
  fontWeight: 600,
  marginBottom: 16,
  textAlign: "center",
};

const accordionHeaderStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  background: "#fff",
  border: "1px solid #e5ddd0",
  borderRadius: 10,
  cursor: "pointer",
  fontFamily: "inherit",
};

const favorisSectionStyle: React.CSSProperties = {
  background: "#FFFBF0",
  borderLeft: "3px solid #F59E0B",
  padding: "8px 0 4px 0",
  marginTop: 1,
};

const lineStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "8px 16px",
  borderBottom: "1px solid #f0ebe2",
  gap: 12,
};
