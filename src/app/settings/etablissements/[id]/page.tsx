"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

/* ── Types ───────────────────────────────────────────── */

type Settings = {
  nom: string;
  slug: string;
  adresse: string;
  couleur: string;
  convention: string;
  code_ape: string;
  siret: string;
  medecin_travail: string;
  pause_defaut_minutes: number;
  objectif_cout_ventes: number;
  objectif_productivite: number;
  cotisations_patronales: number;
  taux_accident_travail: number;
  taux_horaire_moyen: number;
  ajouter_cp_taux_horaire: boolean;
  base_calcul_cp: number;
  acquisition_mensuelle_cp: number;
  type_indemnisation_repas: string;
  valeur_avantage_nature: number;
  actif: boolean;
};

type Poste = {
  id: string;
  nom: string;
  equipe: string;
  couleur: string;
  emoji: string | null;
  actif: boolean;
};

type Prime = {
  id: string;
  libelle: string;
  code: string;
};

type Tab = "social" | "planification" | "modulation";

/* ── Constants ───────────────────────────────────────── */

const CONVENTIONS: Record<string, string> = {
  HCR_1979: "Hotels, cafes restaurants - HCR (IDCC 1979) - 1",
  RAPIDE_1501: "Restauration rapide (IDCC 1501)",
};

const REPAS_TYPES = [
  { key: "IR", label: "IR - Indemnite repas", desc: "Repas pris sur place : tarif preferentiel forfaitaire" },
  { key: "AN", label: "AN - Avantage en nature", desc: "Repas gratuit : pas de deduction de salaire, mais cotisations sociales" },
  { key: "TR", label: "TR - Titre restaurant", desc: "" },
  { key: "PP", label: "PP - Prime de panier", desc: "Indemnite financiere forfaitaire pour repas pris a l'exterieur" },
];

const COLORS = ["#E07070", "#D4775A", "#E0A060", "#E0D060", "#7CCF7C", "#5AAFAF", "#5A8AD4", "#7A6AD4", "#B070D0", "#D070A0", "#A0845C", "#4a6741"];
const EMOJIS = [null, "🔥", "🍕", "🍝", "🥗", "🧊", "🍰", "🍹", "🧽", "🍽️", "📋", "🧪", "🛒", "💼", "🎪", "🧑‍🍳", "🍷", "☕"];

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };
const INPUT: React.CSSProperties = { width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };
const ROW: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #f0ebe3" };

/* ── Toggle ──────────────────────────────────────────── */

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} style={{
      width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
      background: value ? "#2D6A4F" : "#ddd6c8", position: "relative", transition: "background 0.2s",
    }}>
      <span style={{
        position: "absolute", top: 2, left: value ? 22 : 2,
        width: 20, height: 20, borderRadius: "50%", background: "#fff",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

/* ── Page ─────────────────────────────────────────────── */

export default function EtablissementDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [primes, setPrimes] = useState<Prime[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("social");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Poste modal
  const [showPosteModal, setShowPosteModal] = useState(false);
  const [editPosteId, setEditPosteId] = useState<string | null>(null);
  const [pNom, setPNom] = useState("");
  const [pEquipe, setPEquipe] = useState("Cuisine");
  const [pCouleur, setPCouleur] = useState(COLORS[0]);
  const [pEmoji, setPEmoji] = useState<string | null>(null);

  /* ── Load ── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const [etabRes, postesRes, primesRes] = await Promise.all([
        supabase.from("etablissements").select("*").eq("id", id).single(),
        supabase.from("postes").select("id, nom, equipe, couleur, emoji, actif").eq("etablissement_id", id).order("equipe").order("nom"),
        supabase.from("primes").select("id, libelle, code").eq("etablissement_id", id).order("libelle"),
      ]);
      if (!cancelled) {
        if (etabRes.data) setSettings(etabRes.data as unknown as Settings);
        setPostes((postesRes.data ?? []) as Poste[]);
        setPrimes((primesRes.data ?? []) as Prime[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Save field ── */
  const updateField = useCallback(async (patch: Partial<Settings>) => {
    if (!id) return;
    setSettings(prev => prev ? { ...prev, ...patch } : prev);
    setSaving(true);
    setSaved(false);
    await supabase.from("etablissements").update(patch).eq("id", id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [id]);

  /* ── Poste CRUD ── */
  const openCreatePoste = (equipe: string) => {
    setEditPosteId(null);
    setPNom("");
    setPEquipe(equipe);
    setPCouleur(COLORS[0]);
    setPEmoji(null);
    setShowPosteModal(true);
  };

  const openEditPoste = (p: Poste) => {
    setEditPosteId(p.id);
    setPNom(p.nom);
    setPEquipe(p.equipe);
    setPCouleur(p.couleur);
    setPEmoji(p.emoji);
    setShowPosteModal(true);
  };

  const savePoste = async () => {
    if (!id || !pNom.trim()) return;
    const payload = { nom: pNom.trim(), equipe: pEquipe, couleur: pCouleur, emoji: pEmoji, etablissement_id: id };
    if (editPosteId) {
      const { data } = await supabase.from("postes").update(payload).eq("id", editPosteId).select().single();
      if (data) setPostes(prev => prev.map(p => p.id === editPosteId ? { ...p, ...data } as Poste : p));
    } else {
      const { data } = await supabase.from("postes").insert(payload).select().single();
      if (data) setPostes(prev => [...prev, data as Poste]);
    }
    setShowPosteModal(false);
  };

  const togglePoste = async (posteId: string, actif: boolean) => {
    setPostes(prev => prev.map(p => p.id === posteId ? { ...p, actif } : p));
    await supabase.from("postes").update({ actif }).eq("id", posteId);
  };

  if (loading || !settings) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
          <p style={{ color: "#999", fontSize: 13 }}>Chargement...</p>
        </div>
      </RequireRole>
    );
  }

  const equipes = [...new Set(postes.map(p => p.equipe))].sort();

  /* ── Tab: Regles sociales ── */
  const renderSocial = () => (
    <>
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Description sociale</h2>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <tbody>
            {[
              ["Convention collective", CONVENTIONS[settings.convention] ?? settings.convention],
              ["Code APE", settings.code_ape],
              ["Numero de SIRET", settings.siret],
              ["Medecine du travail", settings.medecin_travail],
              ["Adresse", settings.adresse],
            ].map(([label, value]) => (
              <tr key={label} style={{ borderBottom: "1px solid #f0ebe3" }}>
                <td style={{ padding: "10px 0", fontWeight: 600, color: "#1a1a1a", width: "40%" }}>{label}</td>
                <td style={{ padding: "10px 0", color: "#1a1a1a" }}>{value || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={LABEL}>Convention</div>
            <select style={INPUT} value={settings.convention} onChange={e => updateField({ convention: e.target.value })}>
              <option value="HCR_1979">HCR (IDCC 1979)</option>
              <option value="RAPIDE_1501">Rapide (IDCC 1501)</option>
            </select>
          </div>
          <div>
            <div style={LABEL}>Code APE</div>
            <input style={INPUT} value={settings.code_ape} onChange={e => updateField({ code_ape: e.target.value })} placeholder="Ex: 5610A" />
          </div>
          <div>
            <div style={LABEL}>SIRET</div>
            <input style={INPUT} value={settings.siret} onChange={e => updateField({ siret: e.target.value })} placeholder="14 chiffres" />
          </div>
          <div>
            <div style={LABEL}>Medecine du travail</div>
            <input style={INPUT} value={settings.medecin_travail} onChange={e => updateField({ medecin_travail: e.target.value })} placeholder="Ex: MT090" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <div style={LABEL}>Adresse</div>
            <input style={INPUT} value={settings.adresse} onChange={e => updateField({ adresse: e.target.value })} placeholder="Adresse complete" />
          </div>
        </div>
      </div>

      {/* Primes */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Modeles de primes, d&apos;acomptes et d&apos;indemnites</h2>
        </div>
        {primes.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13 }}>Aucune prime configuree.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Libelle</th>
                <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Code associe</th>
              </tr>
            </thead>
            <tbody>
              {primes.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                  <td style={{ padding: "10px 0" }}>{p.libelle}</td>
                  <td style={{ padding: "10px 0" }}>{p.code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Conges payes */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Conges payes</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div>
            <div style={LABEL}>Base de calcul</div>
            <select style={INPUT} value={settings.base_calcul_cp} onChange={e => updateField({ base_calcul_cp: Number(e.target.value) })}>
              <option value={6}>Sur 6 jours - FR - ouvrable</option>
              <option value={5}>Sur 5 jours - FR - ouvre</option>
            </select>
          </div>
          <div>
            <div style={LABEL}>Acquisition mensuelle</div>
            <input type="number" style={INPUT} value={settings.acquisition_mensuelle_cp} onChange={e => updateField({ acquisition_mensuelle_cp: Number(e.target.value) })} step={0.5} min={0} max={5} />
          </div>
        </div>
      </div>

      {/* Repas */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Repas</h2>
        <div style={{ marginBottom: 12 }}>
          <div style={{ ...LABEL, marginBottom: 8 }}>Type d&apos;indemnisation repas par defaut</div>
          {REPAS_TYPES.map(r => (
            <label key={r.key} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", cursor: "pointer" }}>
              <input
                type="radio"
                name="repas"
                checked={settings.type_indemnisation_repas === r.key}
                onChange={() => updateField({ type_indemnisation_repas: r.key })}
                style={{ marginTop: 2 }}
              />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{r.label}</div>
                {r.desc && <div style={{ fontSize: 11, color: "#999" }}>{r.desc}</div>}
              </div>
            </label>
          ))}
        </div>
        {settings.type_indemnisation_repas === "AN" && (
          <div>
            <div style={LABEL}>Valeur avantage en nature (EUR/repas)</div>
            <input type="number" style={{ ...INPUT, width: 200 }} value={settings.valeur_avantage_nature} onChange={e => updateField({ valeur_avantage_nature: Number(e.target.value) })} step={0.01} min={0} />
          </div>
        )}
      </div>
    </>
  );

  /* ── Tab: Planification ── */
  const renderPlanification = () => (
    <>
      {/* Equipes */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Organisation des plannings (equipes)</h2>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {equipes.map(eq => (
            <span key={eq} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 13, fontWeight: 600 }}>
              {eq}
            </span>
          ))}
          {equipes.length === 0 && <span style={{ color: "#999", fontSize: 13 }}>Aucune equipe configuree</span>}
        </div>
      </div>

      {/* Preferences */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Preferences</h2>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Ajouter un temps de pause par defaut de</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 70, textAlign: "center" }} value={settings.pause_defaut_minutes} onChange={e => updateField({ pause_defaut_minutes: Number(e.target.value) })} min={0} max={120} />
            <span style={{ fontSize: 12, color: "#999" }}>min</span>
          </div>
        </div>
      </div>

      {/* Objectifs */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Objectifs</h2>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Cout des shifts / ventes</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 70, textAlign: "center" }} value={settings.objectif_cout_ventes} onChange={e => updateField({ objectif_cout_ventes: Number(e.target.value) })} min={0} max={100} />
            <span style={{ fontSize: 12, color: "#999" }}>%</span>
          </div>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Productivite</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 70, textAlign: "center" }} value={settings.objectif_productivite} onChange={e => updateField({ objectif_productivite: Number(e.target.value) })} min={0} />
            <span style={{ fontSize: 12, color: "#999" }}>EUR/H</span>
          </div>
        </div>
      </div>

      {/* Etiquettes de couleur (Postes) */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>Etiquettes de couleur</h2>
        <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Utilisez les etiquettes pour identifier certaines categories de shifts avec un code couleur.</p>

        {(equipes.length > 0 ? equipes : ["Cuisine", "Salle", "Shop"]).map(eq => {
          const eqPostes = postes.filter(p => p.equipe === eq);
          return (
            <div key={eq} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>{eq}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                {eqPostes.map(p => (
                  <span
                    key={p.id}
                    onClick={() => openEditPoste(p)}
                    style={{
                      padding: "4px 10px", borderRadius: 4, cursor: "pointer",
                      background: p.couleur, color: "#fff", fontSize: 12, fontWeight: 600,
                      opacity: p.actif ? 1 : 0.4,
                    }}
                  >
                    {p.emoji && <span style={{ marginRight: 3 }}>{p.emoji}</span>}
                    {p.nom}
                  </span>
                ))}
              </div>
              <button type="button" onClick={() => openCreatePoste(eq)} style={{
                padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff",
                fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
              }}>
                Nouvelle etiquette
              </button>
            </div>
          );
        })}
      </div>

      {/* Compteurs */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Compteurs</h2>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Activer les repos compensateurs pour les contrats eligibles &lt; 35h</span>
          <Toggle value={settings.ajouter_cp_taux_horaire} onChange={v => updateField({ ajouter_cp_taux_horaire: v })} />
        </div>
      </div>
    </>
  );

  /* ── Tab: Modulation ── */
  const renderModulation = () => (
    <div style={CARD}>
      <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Modulation du temps de travail</h2>
      <p style={{ fontSize: 13, color: "#999", lineHeight: 1.5 }}>
        La modulation permet d&apos;amenager le temps de travail sur une periode superieure a la semaine.
        Les heures supplementaires sont alors calculees en fin de periode de reference.
      </p>
      <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <div style={LABEL}>Cotisations patronales (%)</div>
          <input type="number" style={INPUT} value={settings.cotisations_patronales} onChange={e => updateField({ cotisations_patronales: Number(e.target.value) })} step={0.5} />
        </div>
        <div>
          <div style={LABEL}>Taux accident du travail (%)</div>
          <input type="number" style={INPUT} value={settings.taux_accident_travail} onChange={e => updateField({ taux_accident_travail: Number(e.target.value) })} step={0.1} />
        </div>
        <div>
          <div style={LABEL}>Taux horaire moyen (EUR/h)</div>
          <input type="number" style={INPUT} value={settings.taux_horaire_moyen} onChange={e => updateField({ taux_horaire_moyen: Number(e.target.value) })} step={0.5} />
        </div>
      </div>
    </div>
  );

  const tabStyle = (t: Tab): React.CSSProperties => ({
    padding: "6px 16px", borderRadius: 20, border: "none", cursor: "pointer",
    fontSize: 13, fontWeight: 600,
    background: tab === t ? "#2D6A4F" : "transparent",
    color: tab === t ? "#fff" : "#1a1a1a",
    transition: "background 0.12s",
  });

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 60px" }}>
        {/* Breadcrumb */}
        <div style={{ fontSize: 12, color: "#999", marginBottom: 4 }}>
          <Link href="/settings/etablissements" style={{ color: "#2563eb", textDecoration: "none" }}>Etablissements</Link>
          {" / "}{settings.nom}
        </div>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a" }}>
            {settings.nom}
          </h1>
          <span style={{ fontSize: 12, color: saving ? "#D4775A" : saved ? "#22c55e" : "#999" }}>
            {saving ? "Enregistrement..." : saved ? "Enregistre" : ""}
          </span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
          <button type="button" style={tabStyle("social")} onClick={() => setTab("social")}>Regles sociales</button>
          <button type="button" style={tabStyle("planification")} onClick={() => setTab("planification")}>Planification</button>
          <button type="button" style={tabStyle("modulation")} onClick={() => setTab("modulation")}>Modulation</button>
        </div>

        {/* Content */}
        {tab === "social" && renderSocial()}
        {tab === "planification" && renderPlanification()}
        {tab === "modulation" && renderModulation()}
      </div>

      {/* Modal: Poste */}
      {showPosteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowPosteModal(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 400, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, marginBottom: 16 }}>
              {editPosteId ? "Modifier le poste" : "Nouveau poste"}
            </h2>
            <div style={{ marginBottom: 12 }}>
              <div style={LABEL}>Nom</div>
              <input style={INPUT} value={pNom} onChange={e => setPNom(e.target.value)} placeholder="Ex: Pizza" />
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={LABEL}>Equipe</div>
              <div style={{ display: "flex", gap: 6 }}>
                {["Cuisine", "Salle", "Shop"].map(eq => (
                  <button key={eq} type="button" onClick={() => setPEquipe(eq)} style={{
                    padding: "5px 14px", borderRadius: 20,
                    border: pEquipe === eq ? "2px solid #2D6A4F" : "1px solid #ddd6c8",
                    background: pEquipe === eq ? "rgba(45,106,79,0.08)" : "#fff",
                    fontSize: 12, fontWeight: 600, cursor: "pointer",
                  }}>
                    {eq}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={LABEL}>Couleur</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setPCouleur(c)} style={{
                    width: 28, height: 28, borderRadius: 6, border: pCouleur === c ? "2px solid #1a1a1a" : "2px solid transparent",
                    background: c, cursor: "pointer",
                  }} />
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={LABEL}>Emoji</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {EMOJIS.map((em, i) => (
                  <button key={i} type="button" onClick={() => setPEmoji(em)} style={{
                    width: 32, height: 32, borderRadius: 6,
                    border: pEmoji === em ? "2px solid #1a1a1a" : "1px solid #ddd6c8",
                    background: "#fff", cursor: "pointer", fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {em ?? "—"}
                  </button>
                ))}
              </div>
            </div>
            {/* Preview */}
            <div style={{ marginBottom: 16, padding: 10, background: "#faf7f2", borderRadius: 8, textAlign: "center" }}>
              <span style={{ padding: "4px 12px", borderRadius: 4, background: pCouleur, color: "#fff", fontSize: 13, fontWeight: 600 }}>
                {pEmoji && <span style={{ marginRight: 4 }}>{pEmoji}</span>}
                {pNom || "Apercu"}
              </span>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
              <div>
                {editPosteId && (
                  <button type="button" onClick={() => { togglePoste(editPosteId, !postes.find(p => p.id === editPosteId)?.actif); setShowPosteModal(false); }}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#999" }}>
                    {postes.find(p => p.id === editPosteId)?.actif ? "Desactiver" : "Activer"}
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowPosteModal(false)} style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  Annuler
                </button>
                <button type="button" onClick={savePoste} disabled={!pNom.trim()} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#2D6A4F", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  {editPosteId ? "Enregistrer" : "Creer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}
