"use client";

import { useCallback, useEffect, useState } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { StepperInput } from "@/components/StepperInput";
import { supabase } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "mael" | "metro";

type Ligne = {
  id: string;
  ingredient_id: string | null;
  quantite: number;
  unite: string | null;
  prix_unitaire_ht: number | null;
  total_ligne_ht: number | null;
  ingredients?: { name: string; category: string | null; default_unit: string | null } | null;
};

type Session = {
  id: string;
  supplier_id: string;
  status: string;
  notes: string | null;
  total_ht: number;
  created_at: string;
  lignes: Ligne[];
};

type CatalogItem = {
  id: string;
  name: string;
  category: string | null;
  default_unit: string | null;
};

type HistItem = {
  id: string;
  status: string;
  created_at: string;
  total_ht: number;
  nb_articles: number;
};

type MetroFreeInput = { nom: string; quantite: number | ""; unite: string };

// ── Catégories ordonnées ─────────────────────────────────────────────────────

const CAT_ORDER = [
  "epicerie", "frais", "surgele", "boucherie", "charcuterie",
  "cremerie", "maree", "fruits_legumes", "boissons", "cave",
  "boulangerie", "patisserie", "emballage", "entretien", "autre",
];

function catLabel(cat: string | null): string {
  const map: Record<string, string> = {
    epicerie: "ÉPICERIE", frais: "FRAIS", surgele: "SURGELÉ",
    boucherie: "BOUCHERIE", charcuterie: "CHARCUTERIE", cremerie: "CRÉMERIE",
    maree: "MARÉE", fruits_legumes: "FRUITS & LÉGUMES", boissons: "BOISSONS",
    cave: "CAVE", boulangerie: "BOULANGERIE", patisserie: "PÂTISSERIE",
    emballage: "EMBALLAGE", entretien: "ENTRETIEN", autre: "AUTRE",
  };
  return map[cat ?? "autre"] ?? (cat?.toUpperCase() ?? "AUTRE");
}

function catIndex(cat: string | null): number {
  const idx = CAT_ORDER.indexOf(cat ?? "autre");
  return idx === -1 ? 999 : idx;
}

// ── Styles ───────────────────────────────────────────────────────────────────

const sectionLabel: React.CSSProperties = {
  margin: "18px 0 6px 4px",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 2.5,
  textTransform: "uppercase",
  color: "#b0a894",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const tile: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 12,
  padding: "10px 14px",
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 8,
};

const urgentBadge: React.CSSProperties = {
  fontSize: 9,
  fontWeight: 700,
  padding: "2px 7px",
  borderRadius: 6,
  background: "rgba(139,26,26,0.10)",
  color: "#8B1A1A",
  border: "1px solid rgba(139,26,26,0.20)",
  cursor: "pointer",
  userSelect: "none",
};

const floatingBtn: React.CSSProperties = {
  position: "fixed",
  bottom: 24,
  left: "50%",
  transform: "translateX(-50%)",
  background: "#D4775A",
  color: "#fff",
  border: "none",
  borderRadius: 16,
  padding: "14px 32px",
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 0.5,
  boxShadow: "0 6px 24px rgba(212,119,90,0.4)",
  cursor: "pointer",
  zIndex: 100,
  whiteSpace: "nowrap",
};

const TABS: { key: Tab; label: string }[] = [
  { key: "mael", label: "MAËL" },
  { key: "metro", label: "METRO" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function CommandesPage() {
  const [tab, setTab] = useState<Tab>("mael");

  // Session state per tab
  const [maelSession, setMaelSession] = useState<Session | null>(null);
  const [maelSupplierId, setMaelSupplierId] = useState<string | null>(null);
  const [metroSession, setMetroSession] = useState<Session | null>(null);
  const [metroSupplierId, setMetroSupplierId] = useState<string | null>(null);

  // Catalogue MAËL
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number | "">>({});
  const [urgents, setUrgents] = useState<Set<string>>(new Set());

  // METRO free input
  const [metroInputs, setMetroInputs] = useState<Record<string, MetroFreeInput>>({});
  const [metroNewCat, setMetroNewCat] = useState("epicerie");
  const [metroNewNom, setMetroNewNom] = useState("");
  const [metroNewQte, setMetroNewQte] = useState<number | "">("");
  const [metroNewUnite, setMetroNewUnite] = useState("kg");

  // Historique
  const [histOpen, setHistOpen] = useState(false);
  const [historique, setHistorique] = useState<HistItem[]>([]);

  // Loading
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Load active sessions ──────────────────────────────────────────────────

  const loadSession = useCallback(async (supplier: string) => {
    const res = await fetch(`/api/commandes/active?supplier=${supplier}`);
    const data = await res.json();
    return data;
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const [maelData, metroData] = await Promise.all([
        loadSession("mael"),
        loadSession("metro"),
      ]);

      setMaelSupplierId(maelData.supplier_id);
      setMaelSession(maelData.session);
      setMetroSupplierId(metroData.supplier_id);
      setMetroSession(metroData.session);

      // Pré-remplir quantités depuis session existante
      if (maelData.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of maelData.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setQuantities(q);
      }

      // Charger catalogue ingrédients liés à MAËL (via supplier_offers ou supplier_id)
      if (maelData.supplier_id) {
        // Ingrédients avec offres de ce fournisseur
        const { data: offerIngIds } = await supabase
          .from("supplier_offers")
          .select("ingredient_id")
          .eq("supplier_id", maelData.supplier_id)
          .eq("is_active", true);

        const ids = [...new Set((offerIngIds ?? []).map((o) => o.ingredient_id))];

        // Aussi ingrédients avec supplier_id direct
        const { data: directIngs } = await supabase
          .from("ingredients")
          .select("id, name, category, default_unit")
          .eq("supplier_id", maelData.supplier_id);

        const directIds = (directIngs ?? []).map((i) => i.id);
        const allIds = [...new Set([...ids, ...directIds])];

        if (allIds.length > 0) {
          const { data: items } = await supabase
            .from("ingredients")
            .select("id, name, category, default_unit")
            .in("id", allIds)
            .order("category")
            .order("name");
          setCatalog(items ?? []);
        }
      }

      setLoading(false);
    }
    init();
  }, [loadSession]);

  // ── Create session ────────────────────────────────────────────────────────

  async function createSession(supplierId: string, setSession: (s: Session) => void) {
    setSaving(true);
    const res = await fetch("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: supplierId }),
    });
    const data = await res.json();
    if (data.session) {
      setSession({ ...data.session, lignes: [] });
    }
    setSaving(false);
  }

  // ── Save ligne (MAËL) ────────────────────────────────────────────────────

  async function saveLigne(sessionId: string, ingredientId: string, qty: number | "") {
    await fetch("/api/commandes/ligne", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        ingredient_id: ingredientId,
        quantite: qty === "" ? 0 : qty,
      }),
    });
  }

  function handleQtyChange(ingredientId: string, val: number | "") {
    setQuantities((prev) => ({ ...prev, [ingredientId]: val }));
    if (maelSession) {
      saveLigne(maelSession.id, ingredientId, val);
    }
  }

  function toggleUrgent(id: string) {
    setUrgents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Add METRO free line ───────────────────────────────────────────────────

  async function addMetroLine() {
    if (!metroSession || !metroNewNom.trim() || !metroNewQte) return;
    setSaving(true);

    // Chercher ou créer un ingrédient "libre" pour METRO
    const { data: existing } = await supabase
      .from("ingredients")
      .select("id")
      .ilike("name", metroNewNom.trim())
      .limit(1)
      .maybeSingle();

    let ingredientId = existing?.id;

    if (!ingredientId) {
      // Créer un ingrédient temporaire
      const { data: newIng } = await supabase
        .from("ingredients")
        .insert({
          name: metroNewNom.trim(),
          category: metroNewCat,
          default_unit: metroNewUnite,
          status: "to_check",
        })
        .select("id")
        .single();
      ingredientId = newIng?.id;
    }

    if (ingredientId) {
      const res = await fetch("/api/commandes/ligne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: metroSession.id,
          ingredient_id: ingredientId,
          quantite: metroNewQte,
          unite: metroNewUnite,
        }),
      });
      const data = await res.json();
      if (data.ligne) {
        setMetroSession((prev) =>
          prev ? { ...prev, lignes: [...prev.lignes, data.ligne] } : prev
        );
      }
    }

    setMetroNewNom("");
    setMetroNewQte("");
    setSaving(false);
  }

  async function removeMetroLine(ligneId: string) {
    await fetch(`/api/commandes/ligne?id=${ligneId}`, { method: "DELETE" });
    setMetroSession((prev) =>
      prev ? { ...prev, lignes: prev.lignes.filter((l) => l.id !== ligneId) } : prev
    );
  }

  // ── Envoyer pour validation ───────────────────────────────────────────────

  async function envoyerSession(sessionId: string) {
    setSaving(true);
    await fetch("/api/commandes/session", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: sessionId, status: "validee" }),
    });
    // Recharger
    const [maelData, metroData] = await Promise.all([
      loadSession("mael"),
      loadSession("metro"),
    ]);
    setMaelSession(maelData.session);
    setMetroSession(metroData.session);
    setQuantities({});
    setSaving(false);
  }

  // ── Historique ────────────────────────────────────────────────────────────

  async function loadHistorique() {
    const suppId = tab === "mael" ? maelSupplierId : metroSupplierId;
    if (!suppId) return;
    const res = await fetch(`/api/commandes/historique?supplier_id=${suppId}&limit=10`);
    const data = await res.json();
    setHistorique(data.historique ?? []);
    setHistOpen(true);
  }

  async function dupliquerSession(histSessionId: string) {
    const suppId = tab === "mael" ? maelSupplierId : metroSupplierId;
    if (!suppId) return;
    setSaving(true);

    // Créer session
    const res = await fetch("/api/commandes/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ supplier_id: suppId }),
    });
    const { session: newSession } = await res.json();
    if (!newSession) { setSaving(false); return; }

    // Récupérer lignes de l'ancienne session
    const sessRes = await fetch(`/api/commandes/session?id=${histSessionId}`);
    const { session: oldSession } = await sessRes.json();

    // Copier les lignes
    for (const l of oldSession?.lignes ?? []) {
      await fetch("/api/commandes/ligne", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: newSession.id,
          ingredient_id: l.ingredient_id,
          quantite: l.quantite,
          unite: l.unite,
          prix_unitaire_ht: l.prix_unitaire_ht,
        }),
      });
    }

    // Recharger
    const data = await loadSession(tab);
    if (tab === "mael") {
      setMaelSession(data.session);
      if (data.session?.lignes) {
        const q: Record<string, number | ""> = {};
        for (const l of data.session.lignes) {
          if (l.ingredient_id) q[l.ingredient_id] = l.quantite;
        }
        setQuantities(q);
      }
    } else {
      setMetroSession(data.session);
    }
    setSaving(false);
    setHistOpen(false);
  }

  // ── Computed ──────────────────────────────────────────────────────────────

  const activeSession = tab === "mael" ? maelSession : metroSession;
  const activeSupplierId = tab === "mael" ? maelSupplierId : metroSupplierId;

  const maelCount = Object.values(quantities).filter((v) => v !== "" && v > 0).length;
  const metroCount = metroSession?.lignes.length ?? 0;
  const activeCount = tab === "mael" ? maelCount : metroCount;

  // Group catalog by category
  const grouped = catalog.reduce<Record<string, CatalogItem[]>>((acc, item) => {
    const cat = item.category ?? "autre";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  const sortedCats = Object.keys(grouped).sort((a, b) => catIndex(a) - catIndex(b));

  // Group metro lines by category
  const metroGrouped = (metroSession?.lignes ?? []).reduce<Record<string, Ligne[]>>((acc, l) => {
    const cat = l.ingredients?.category ?? "autre";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(l);
    return acc;
  }, {});

  const metroSortedCats = Object.keys(metroGrouped).sort((a, b) => catIndex(a) - catIndex(b));

  const METRO_SECTIONS = ["epicerie", "frais", "surgele", "boissons", "autre"];

  // ── Render ────────────────────────────────────────────────────────────────

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  }

  const statusLabel: Record<string, string> = {
    brouillon: "Brouillon",
    validee: "Validée",
    envoyee: "Envoyée",
    recue: "Reçue",
    annulee: "Annulée",
  };

  const statusColor: Record<string, string> = {
    brouillon: "#A0845C",
    validee: "#4a6741",
    envoyee: "#2563eb",
    recue: "#16a34a",
    annulee: "#999",
  };

  return (
    <RequireRole allowedRoles={["admin", "direction", "cuisine"]}>
      <NavBar />
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 120px" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
          fontSize: 28,
          fontWeight: 700,
          color: "#1a1a1a",
          margin: 0,
        }}>
          Commandes fournisseurs
        </h1>

        {/* ── Onglets ── */}
        <div style={{ display: "flex", gap: 0, marginTop: 20, borderBottom: "2px solid #e5e5e5" }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => { setTab(t.key); setHistOpen(false); }}
              style={{
                padding: "10px 28px",
                fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                fontSize: 15,
                fontWeight: tab === t.key ? 700 : 500,
                color: tab === t.key ? "#D4775A" : "#888",
                background: "none",
                border: "none",
                borderBottom: tab === t.key ? "3px solid #D4775A" : "3px solid transparent",
                cursor: "pointer",
                marginBottom: -2,
                transition: "all .15s",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {loading && (
          <p style={{ textAlign: "center", color: "#999", marginTop: 40 }}>Chargement…</p>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ONGLET MAËL
            ═══════════════════════════════════════════════════════════════════ */}
        {!loading && tab === "mael" && (
          <div style={{ marginTop: 16 }}>
            {/* Pas de session active → bouton créer */}
            {!maelSession && maelSupplierId && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
                  Aucune commande en cours
                </p>
                <button
                  onClick={() => createSession(maelSupplierId, (s) => setMaelSession(s))}
                  disabled={saving}
                  style={{
                    background: "#D4775A",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 28px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  }}
                >
                  Nouvelle commande Maël
                </button>
              </div>
            )}

            {!maelSupplierId && !loading && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#999", fontSize: 13 }}>
                  Fournisseur MAËL introuvable dans la base.
                  Vérifiez la table suppliers.
                </p>
              </div>
            )}

            {/* Session active → liste catalogue */}
            {maelSession && (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 11, color: "#999" }}>
                    Session du {fmtDate(maelSession.created_at)} — {statusLabel[maelSession.status]}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#D4775A",
                  }}>
                    {maelCount} article{maelCount > 1 ? "s" : ""}
                  </span>
                </div>

                {catalog.length === 0 && (
                  <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: 24 }}>
                    Aucun ingrédient lié à MAËL dans le catalogue.
                  </p>
                )}

                {sortedCats.map((cat) => (
                  <div key={cat}>
                    <p style={sectionLabel}>{catLabel(cat)}</p>
                    {grouped[cat].map((item) => (
                      <div key={item.id} style={tile}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{
                              fontSize: 13,
                              fontWeight: 600,
                              color: "#1a1a1a",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}>
                              {item.name}
                            </span>
                            {urgents.has(item.id) && (
                              <span style={urgentBadge}>URGENT</span>
                            )}
                          </div>
                          {item.default_unit && (
                            <span style={{ fontSize: 10, color: "#999" }}>
                              {item.default_unit}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => toggleUrgent(item.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              fontSize: 14,
                              opacity: urgents.has(item.id) ? 1 : 0.3,
                              padding: 4,
                            }}
                            title="Marquer urgent"
                          >
                            ★
                          </button>
                          <StepperInput
                            value={quantities[item.id] ?? ""}
                            onChange={(v) => handleQtyChange(item.id, v)}
                            step={1}
                            min={0}
                            placeholder="0"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            ONGLET METRO
            ═══════════════════════════════════════════════════════════════════ */}
        {!loading && tab === "metro" && (
          <div style={{ marginTop: 16 }}>
            {/* Pas de session active */}
            {!metroSession && metroSupplierId && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#999", fontSize: 13, marginBottom: 16 }}>
                  Aucune commande en cours
                </p>
                <button
                  onClick={() => createSession(metroSupplierId, (s) => setMetroSession(s))}
                  disabled={saving}
                  style={{
                    background: "#D4775A",
                    color: "#fff",
                    border: "none",
                    borderRadius: 12,
                    padding: "12px 28px",
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
                  }}
                >
                  Nouvelle commande Metro
                </button>
              </div>
            )}

            {!metroSupplierId && !loading && (
              <div style={{ textAlign: "center", padding: 40 }}>
                <p style={{ color: "#999", fontSize: 13 }}>
                  Fournisseur METRO introuvable dans la base.
                  Vérifiez la table suppliers.
                </p>
              </div>
            )}

            {/* Session active → saisie libre par catégorie */}
            {metroSession && (
              <>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                }}>
                  <span style={{ fontSize: 11, color: "#999" }}>
                    Session du {fmtDate(metroSession.created_at)} — {statusLabel[metroSession.status]}
                  </span>
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#D4775A",
                  }}>
                    {metroCount} article{metroCount > 1 ? "s" : ""}
                  </span>
                </div>

                {/* Lignes existantes groupées */}
                {metroSortedCats.map((cat) => (
                  <div key={cat}>
                    <p style={sectionLabel}>{catLabel(cat)}</p>
                    {metroGrouped[cat].map((l) => (
                      <div key={l.id} style={tile}>
                        <div style={{ flex: 1 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                            {l.ingredients?.name ?? "—"}
                          </span>
                          <span style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                            {l.quantite} {l.unite ?? l.ingredients?.default_unit ?? ""}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeMetroLine(l.id)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "#ccc",
                            fontSize: 18,
                            cursor: "pointer",
                            padding: "0 4px",
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                ))}

                {metroCount === 0 && (
                  <p style={{ color: "#ccc", fontSize: 13, textAlign: "center", padding: 16 }}>
                    Aucun article ajouté
                  </p>
                )}

                {/* Formulaire ajout rapide */}
                <div style={{
                  background: "#fff",
                  border: "1px solid #ddd6c8",
                  borderRadius: 14,
                  padding: 16,
                  marginTop: 16,
                }}>
                  <p style={{
                    margin: "0 0 10px",
                    fontSize: 11,
                    fontWeight: 700,
                    color: "#999",
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}>
                    + Ajouter un article
                  </p>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                    {/* Catégorie */}
                    <select
                      value={metroNewCat}
                      onChange={(e) => setMetroNewCat(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd6c8",
                        fontSize: 12,
                        background: "#fafaf7",
                        flex: "0 0 auto",
                      }}
                    >
                      {METRO_SECTIONS.map((c) => (
                        <option key={c} value={c}>{catLabel(c)}</option>
                      ))}
                    </select>

                    {/* Nom */}
                    <input
                      type="text"
                      value={metroNewNom}
                      onChange={(e) => setMetroNewNom(e.target.value)}
                      placeholder="Nom du produit"
                      style={{
                        flex: "1 1 140px",
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd6c8",
                        fontSize: 13,
                      }}
                    />

                    {/* Quantité */}
                    <input
                      type="number"
                      inputMode="decimal"
                      value={metroNewQte}
                      onChange={(e) => setMetroNewQte(e.target.value === "" ? "" : Number(e.target.value))}
                      placeholder="Qté"
                      style={{
                        width: 60,
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd6c8",
                        fontSize: 13,
                        textAlign: "center",
                      }}
                    />

                    {/* Unité */}
                    <select
                      value={metroNewUnite}
                      onChange={(e) => setMetroNewUnite(e.target.value)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #ddd6c8",
                        fontSize: 12,
                        background: "#fafaf7",
                      }}
                    >
                      <option value="kg">kg</option>
                      <option value="l">L</option>
                      <option value="pc">pièce</option>
                      <option value="bte">boîte</option>
                      <option value="sac">sac</option>
                      <option value="pack">pack</option>
                    </select>

                    <button
                      type="button"
                      onClick={addMetroLine}
                      disabled={saving || !metroNewNom.trim() || !metroNewQte}
                      style={{
                        padding: "8px 16px",
                        borderRadius: 8,
                        border: "none",
                        background: metroNewNom.trim() && metroNewQte ? "#D4775A" : "#ddd",
                        color: metroNewNom.trim() && metroNewQte ? "#fff" : "#999",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: metroNewNom.trim() && metroNewQte ? "pointer" : "not-allowed",
                      }}
                    >
                      Ajouter
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORIQUE
            ═══════════════════════════════════════════════════════════════════ */}
        {!loading && activeSupplierId && (
          <div style={{ marginTop: 32 }}>
            <button
              type="button"
              onClick={() => histOpen ? setHistOpen(false) : loadHistorique()}
              style={{
                width: "100%",
                background: "#fff",
                border: "1px solid #ddd6c8",
                borderRadius: 12,
                padding: "12px 16px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                color: "#666",
              }}
            >
              <span>Commandes précédentes</span>
              <span style={{ fontSize: 16, transition: "transform .2s", transform: histOpen ? "rotate(180deg)" : "none" }}>▾</span>
            </button>

            {histOpen && (
              <div style={{ marginTop: 8 }}>
                {historique.length === 0 && (
                  <p style={{ color: "#ccc", fontSize: 12, textAlign: "center", padding: 16 }}>
                    Aucune commande passée
                  </p>
                )}
                {historique.map((h) => (
                  <div key={h.id} style={{
                    ...tile,
                    flexDirection: "column",
                    alignItems: "stretch",
                    gap: 6,
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>
                          {fmtDate(h.created_at)}
                        </span>
                        <span style={{
                          marginLeft: 8,
                          fontSize: 10,
                          fontWeight: 700,
                          padding: "2px 7px",
                          borderRadius: 6,
                          background: `${statusColor[h.status] ?? "#999"}14`,
                          color: statusColor[h.status] ?? "#999",
                        }}>
                          {statusLabel[h.status] ?? h.status}
                        </span>
                      </div>
                      <span style={{ fontSize: 11, color: "#999" }}>
                        {h.nb_articles} article{h.nb_articles > 1 ? "s" : ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick={() => dupliquerSession(h.id)}
                        disabled={saving || !!activeSession}
                        style={{
                          fontSize: 11,
                          fontWeight: 600,
                          color: activeSession ? "#ccc" : "#D4775A",
                          background: "none",
                          border: "none",
                          cursor: activeSession ? "not-allowed" : "pointer",
                          padding: 0,
                        }}
                      >
                        Dupliquer →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Bouton flottant ── */}
        {activeSession && activeCount > 0 && (
          <button
            type="button"
            onClick={() => envoyerSession(activeSession.id)}
            disabled={saving}
            style={floatingBtn}
          >
            {saving ? "Envoi…" : `Envoyer pour validation (${activeCount} article${activeCount > 1 ? "s" : ""})`}
          </button>
        )}
      </div>
    </RequireRole>
  );
}
