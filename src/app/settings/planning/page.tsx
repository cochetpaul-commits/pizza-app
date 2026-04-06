"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Settings = {
  convention: string;
  code_ape: string;
  siret: string;
  medecin_travail: string;
  adresse: string;
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
};

type Poste = {
  id: string;
  equipe: string;
  nom: string;
  couleur: string;
  emoji: string | null;
  actif: boolean;
};

const DEFAULTS: Settings = {
  convention: "HCR_1979",
  code_ape: "",
  siret: "",
  medecin_travail: "",
  adresse: "",
  pause_defaut_minutes: 30,
  objectif_cout_ventes: 37,
  objectif_productivite: 50,
  cotisations_patronales: 35,
  taux_accident_travail: 2.5,
  taux_horaire_moyen: 12.5,
  ajouter_cp_taux_horaire: false,
  base_calcul_cp: 6,
  acquisition_mensuelle_cp: 2.5,
  type_indemnisation_repas: "AN",
  valeur_avantage_nature: 3.57,
};

const SECTIONS = ["social", "planification", "conges", "repas", "analyse", "postes"] as const;
type Section = (typeof SECTIONS)[number];
const SECTION_LABELS: Record<Section, string> = {
  social: "Social",
  planification: "Planification",
  conges: "Conges payes",
  repas: "Repas",
  analyse: "Analyse",
  postes: "Postes",
};

const REPAS_OPTIONS: { key: string; label: string; desc: string }[] = [
  { key: "AN", label: "Avantage en nature", desc: "Valorise a 3.57 EUR/repas (URSSAF 2026)" },
  { key: "IR", label: "Indemnite repas", desc: "Forfait verse sur fiche de paie" },
  { key: "TR", label: "Titres restaurant", desc: "Co-finance employeur/salarie" },
  { key: "PP", label: "Pas de prise en charge", desc: "Aucune indemnisation repas" },
];

const EMOJIS = [
  "🍕", "🍳", "🔪", "🧹", "🍷", "🍸", "🍽️", "☕",
  "📋", "🧑‍🍳", "🏠", "📦", "🧊", "🔥", "💼", "🎯",
  "🛒", "🧴",
];

const COULEURS = [
  "#E07070", "#E0A070", "#D4B83D", "#7BBF7B", "#70B8E0",
  "#7070E0", "#B070E0", "#E070B0", "#8B6F47", "#6B8E6B",
  "#D4775A", "#4a6741",
];

/* ── Component ─────────────────────────────────────────────────── */

export default function SettingsPlanningPage() {
  const { current: etab } = useEtablissement();

  const [values, setValues] = useState<Settings>(DEFAULTS);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("social");

  // Poste modal
  const [showPosteModal, setShowPosteModal] = useState(false);
  const [editPosteId, setEditPosteId] = useState<string | null>(null);
  const [pNom, setPNom] = useState("");
  const [pEquipe, setPEquipe] = useState("Cuisine");
  const [pCouleur, setPCouleur] = useState(COULEURS[0]);
  const [pEmoji, setPEmoji] = useState<string | null>(null);

  /* ── Load ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const [etabRes, postesRes] = await Promise.all([
        supabase
          .from("etablissements")
          .select("convention, code_ape, siret, medecin_travail, adresse, pause_defaut_minutes, objectif_cout_ventes, objectif_productivite, cotisations_patronales, taux_accident_travail, taux_horaire_moyen, ajouter_cp_taux_horaire, base_calcul_cp, acquisition_mensuelle_cp, type_indemnisation_repas, valeur_avantage_nature")
          .eq("id", etab.id)
          .single(),
        supabase
          .from("postes")
          .select("id, equipe, nom, couleur, emoji, actif")
          .eq("etablissement_id", etab.id)
          .order("equipe")
          .order("nom"),
      ]);

      if (cancelled) return;

      if (etabRes.data) {
        setValues({
          convention: etabRes.data.convention ?? DEFAULTS.convention,
          code_ape: etabRes.data.code_ape ?? "",
          siret: etabRes.data.siret ?? "",
          medecin_travail: etabRes.data.medecin_travail ?? "",
          adresse: etabRes.data.adresse ?? "",
          pause_defaut_minutes: etabRes.data.pause_defaut_minutes ?? DEFAULTS.pause_defaut_minutes,
          objectif_cout_ventes: etabRes.data.objectif_cout_ventes ?? DEFAULTS.objectif_cout_ventes,
          objectif_productivite: etabRes.data.objectif_productivite ?? DEFAULTS.objectif_productivite,
          cotisations_patronales: etabRes.data.cotisations_patronales ?? DEFAULTS.cotisations_patronales,
          taux_accident_travail: etabRes.data.taux_accident_travail ?? DEFAULTS.taux_accident_travail,
          taux_horaire_moyen: etabRes.data.taux_horaire_moyen ?? DEFAULTS.taux_horaire_moyen,
          ajouter_cp_taux_horaire: etabRes.data.ajouter_cp_taux_horaire ?? DEFAULTS.ajouter_cp_taux_horaire,
          base_calcul_cp: etabRes.data.base_calcul_cp ?? DEFAULTS.base_calcul_cp,
          acquisition_mensuelle_cp: etabRes.data.acquisition_mensuelle_cp ?? DEFAULTS.acquisition_mensuelle_cp,
          type_indemnisation_repas: etabRes.data.type_indemnisation_repas ?? DEFAULTS.type_indemnisation_repas,
          valeur_avantage_nature: etabRes.data.valeur_avantage_nature ?? DEFAULTS.valeur_avantage_nature,
        });
      }

      setPostes((postesRes.data ?? []) as Poste[]);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab]);

  /* ── Save settings ── */
  const save = useCallback(async (patch: Partial<Settings>) => {
    if (!etab) return;
    setSaving(true);
    setSaved(false);
    await supabase.from("etablissements").update(patch).eq("id", etab.id);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [etab]);

  /* ── Field updaters ── */
  const updateField = useCallback((field: keyof Settings, value: string | number | boolean) => {
    setValues((v) => ({ ...v, [field]: value }));
    save({ [field]: value });
  }, [save]);

  /* ── Simulation ── */
  const simulation = useMemo(() => {
    const taux = values.taux_horaire_moyen;
    const charges = values.cotisations_patronales / 100;
    const cpRate = values.ajouter_cp_taux_horaire ? 0.10 : 0;
    const cost = (h: number) => h * taux * (1 + charges + cpRate);
    return { cost4h: cost(4), cost7h: cost(7), cost9h: cost(9) };
  }, [values.taux_horaire_moyen, values.cotisations_patronales, values.ajouter_cp_taux_horaire]);

  /* ── Postes CRUD ── */
  const openCreatePoste = (equipe: string) => {
    setEditPosteId(null);
    setPNom("");
    setPEquipe(equipe);
    setPCouleur(COULEURS[0]);
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

  const handleSavePoste = async () => {
    if (!etab || !pNom.trim()) return;
    setSaving(true);

    const payload = {
      etablissement_id: etab.id,
      equipe: pEquipe,
      nom: pNom.trim(),
      couleur: pCouleur,
      emoji: pEmoji,
    };

    if (editPosteId) {
      const { data } = await supabase.from("postes").update(payload).eq("id", editPosteId).select().single();
      if (data) setPostes((prev) => prev.map((p) => p.id === editPosteId ? { ...p, ...data } : p));
    } else {
      const { data } = await supabase.from("postes").insert(payload).select().single();
      if (data) setPostes((prev) => [...prev, data]);
    }

    setShowPosteModal(false);
    setSaving(false);
  };

  const togglePosteActif = async (p: Poste) => {
    const newActif = !p.actif;
    await supabase.from("postes").update({ actif: newActif }).eq("id", p.id);
    setPostes((prev) => prev.map((x) => x.id === p.id ? { ...x, actif: newActif } : x));
  };

  /* ── Grouped postes ── */
  const postesByEquipe = useMemo(() => {
    const m = new Map<string, Poste[]>();
    for (const p of postes) {
      const arr = m.get(p.equipe) ?? [];
      arr.push(p);
      m.set(p.equipe, arr);
    }
    return m;
  }, [postes]);

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={pageStyle}>
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        </div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={titleStyle}>Parametres</div>
          <div style={{ fontSize: 13, color: "#999" }}>
            {etab?.nom ?? "Etablissement"}
            {saving && <span style={{ marginLeft: 8, color: "#D4775A" }}>Enregistrement...</span>}
            {saved && <span style={{ marginLeft: 8, color: "#4a6741" }}>Enregistre</span>}
          </div>
        </div>

        {/* Section pills */}
        <div style={{ display: "inline-flex", flexWrap: "wrap", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12, marginBottom: 16 }}>
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setActiveSection(s)}
              style={pillBtn(activeSection === s, etab?.couleur)}
            >
              {SECTION_LABELS[s]}
            </button>
          ))}
        </div>

        {/* ═══ SOCIAL ═══ */}
        {activeSection === "social" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Social</div>

            <FieldRow label="Convention collective">
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12 }}>
                {[
                  { key: "HCR_1979", label: "HCR (IDCC 1979)" },
                  { key: "RAPIDE_1501", label: "Rapide (IDCC 1501)" },
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => updateField("convention", c.key)}
                    style={pillBtn(values.convention === c.key, etab?.couleur)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {values.convention === "RAPIDE_1501" && (
                <div style={warningBox}>
                  Convention Rapide IDCC 1501 — reserve a Piccola Mia. Les seuils d&apos;heures supplementaires different.
                </div>
              )}
            </FieldRow>

            <FieldRow label="Code APE">
              <input
                style={inputStyle}
                value={values.code_ape}
                onChange={(e) => updateField("code_ape", e.target.value)}
                placeholder="5610A"
              />
            </FieldRow>

            <FieldRow label="SIRET">
              <input
                style={inputStyle}
                value={values.siret}
                onChange={(e) => updateField("siret", e.target.value)}
                placeholder="91321738600014"
              />
            </FieldRow>

            <FieldRow label="Medecin du travail">
              <input
                style={inputStyle}
                value={values.medecin_travail}
                onChange={(e) => updateField("medecin_travail", e.target.value)}
                placeholder="MT090"
              />
            </FieldRow>

            <FieldRow label="Adresse">
              <input
                style={inputStyle}
                value={values.adresse}
                onChange={(e) => updateField("adresse", e.target.value)}
                placeholder="Adresse de l'etablissement"
              />
            </FieldRow>
          </div>
        )}

        {/* ═══ PLANIFICATION ═══ */}
        {activeSection === "planification" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Planification</div>

            <SliderRow
              label="Pause par defaut"
              value={values.pause_defaut_minutes}
              min={0} max={120} step={5}
              unit="min"
              onChange={(v) => updateField("pause_defaut_minutes", v)}
            />

            <SliderRow
              label="Objectif ratio MS / CA"
              value={values.objectif_cout_ventes}
              min={20} max={60} step={1}
              unit="%"
              onChange={(v) => updateField("objectif_cout_ventes", v)}
              color={values.objectif_cout_ventes <= 37 ? "#4a6741" : "#DC2626"}
            />

            <SliderRow
              label="Objectif productivite"
              value={values.objectif_productivite}
              min={20} max={100} step={1}
              unit="EUR/h"
              onChange={(v) => updateField("objectif_productivite", v)}
            />
          </div>
        )}

        {/* ═══ CONGES PAYES ═══ */}
        {activeSection === "conges" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Conges payes</div>

            <FieldRow label="Base de calcul">
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12 }}>
                {[
                  { key: 6, label: "Jours ouvrables (6j)" },
                  { key: 5, label: "Jours ouvres (5j)" },
                ].map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => updateField("base_calcul_cp", c.key)}
                    style={pillBtn(values.base_calcul_cp === c.key, etab?.couleur)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </FieldRow>

            <SliderRow
              label="Acquisition mensuelle"
              value={values.acquisition_mensuelle_cp}
              min={0} max={5} step={0.08}
              unit="j/mois"
              onChange={(v) => updateField("acquisition_mensuelle_cp", Math.round(v * 100) / 100)}
            />

            <div style={infoBox}>
              Droit annuel : <strong>{(values.acquisition_mensuelle_cp * 12).toFixed(1)} jours</strong> sur {values.base_calcul_cp === 6 ? "jours ouvrables" : "jours ouvres"}.
            </div>
          </div>
        )}

        {/* ═══ REPAS ═══ */}
        {activeSection === "repas" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Repas</div>
            <div style={{ fontSize: 12, color: "#6f6a61", marginBottom: 14 }}>
              1 repas par shift, sans condition de duree.
            </div>

            <div style={{ display: "grid", gap: 8 }}>
              {REPAS_OPTIONS.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => updateField("type_indemnisation_repas", r.key)}
                  style={{
                    ...repasCard,
                    borderColor: values.type_indemnisation_repas === r.key ? "#D4775A" : "#ddd6c8",
                    background: values.type_indemnisation_repas === r.key ? "rgba(212,119,90,0.04)" : "#fff",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{r.label}</div>
                  <div style={{ fontSize: 12, color: "#6f6a61" }}>{r.desc}</div>
                </button>
              ))}
            </div>

            {values.type_indemnisation_repas === "AN" && (
              <div style={{ marginTop: 14 }}>
                <FieldRow label="Valeur avantage en nature (EUR/repas)">
                  <input
                    type="number"
                    style={{ ...inputStyle, maxWidth: 120 }}
                    value={values.valeur_avantage_nature}
                    onChange={(e) => updateField("valeur_avantage_nature", parseFloat(e.target.value) || 0)}
                    step="0.01"
                    min="0"
                  />
                </FieldRow>
              </div>
            )}
          </div>
        )}

        {/* ═══ ANALYSE ═══ */}
        {activeSection === "analyse" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Analyse</div>

            <SliderRow
              label="Charges patronales"
              value={values.cotisations_patronales}
              min={20} max={50} step={0.5}
              unit="%"
              onChange={(v) => updateField("cotisations_patronales", v)}
            />

            <FieldRow label="Taux accident du travail">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  style={{ ...inputStyle, maxWidth: 100 }}
                  value={values.taux_accident_travail}
                  onChange={(e) => updateField("taux_accident_travail", parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                />
                <span style={{ fontSize: 13, color: "#6f6a61" }}>%</span>
              </div>
              <div style={warningBox}>
                Taux notifie par la CARSAT — a verifier chaque annee (1.8%–4.5%). Actuellement : <strong>{values.taux_accident_travail.toFixed(2)}%</strong>.
              </div>
            </FieldRow>

            <FieldRow label="Taux horaire moyen">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <input
                  type="number"
                  style={{ ...inputStyle, maxWidth: 100 }}
                  value={values.taux_horaire_moyen}
                  onChange={(e) => updateField("taux_horaire_moyen", parseFloat(e.target.value) || 0)}
                  step="0.25"
                  min="0"
                />
                <span style={{ fontSize: 13, color: "#6f6a61" }}>EUR/h brut</span>
              </div>
            </FieldRow>

            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <input
                type="checkbox"
                checked={values.ajouter_cp_taux_horaire}
                onChange={(e) => updateField("ajouter_cp_taux_horaire", e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#D4775A" }}
              />
              <label style={{ fontSize: 13, color: "#1a1a1a" }}>
                Inclure CP dans le taux horaire (+10%)
              </label>
            </div>

            {/* Simulation */}
            <div style={{ ...infoBox, background: "rgba(212,119,90,0.04)", borderColor: "rgba(212,119,90,0.2)" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#D4775A", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>
                Simulation cout shift
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                <SimBlock label="4h" value={simulation.cost4h} />
                <SimBlock label="7h" value={simulation.cost7h} />
                <SimBlock label="9h" value={simulation.cost9h} />
              </div>
              <div style={{ fontSize: 11, color: "#6f6a61", marginTop: 8 }}>
                Taux : {values.taux_horaire_moyen} EUR/h
                {values.ajouter_cp_taux_horaire ? " + 10% CP" : ""}
                {" + "}{values.cotisations_patronales}% charges
              </div>
            </div>
          </div>
        )}

        {/* ═══ POSTES ═══ */}
        {activeSection === "postes" && (
          <div style={sectionCard}>
            <div style={sectionTitle}>Postes</div>

            {(["Cuisine", "Salle", "Shop"] as const).map((equipe) => {
              const list = postesByEquipe.get(equipe) ?? [];
              return (
                <div key={equipe} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#6f6a61", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      {equipe}
                    </span>
                    <button type="button" onClick={() => openCreatePoste(equipe)} style={addBtn}>+</button>
                  </div>

                  <div style={{ display: "grid", gap: 6 }}>
                    {list.map((p) => (
                      <div key={p.id} style={{ ...posteRow, opacity: p.actif ? 1 : 0.4 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.couleur, flexShrink: 0 }} />
                          {p.emoji && <span>{p.emoji}</span>}
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{p.nom}</span>
                          {!p.actif && <span style={inactiveBadge}>inactif</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button type="button" onClick={() => openEditPoste(p)} style={smallBtn}>Modifier</button>
                          <button type="button" onClick={() => togglePosteActif(p)} style={smallBtn}>
                            {p.actif ? "Desactiver" : "Reactiver"}
                          </button>
                        </div>
                      </div>
                    ))}
                    {list.length === 0 && (
                      <div style={{ fontSize: 13, color: "#999", fontStyle: "italic" }}>Aucun poste</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ═══ MODAL: Poste ═══ */}
      {showPosteModal && (
        <div style={overlayStyle} onClick={() => setShowPosteModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>{editPosteId ? "Modifier le poste" : "Nouveau poste"}</h2>

            <FieldRow label="Nom">
              <input style={inputStyle} value={pNom} onChange={(e) => setPNom(e.target.value)} placeholder="Nom du poste" autoFocus />
            </FieldRow>

            <FieldRow label="Equipe">
              <div style={{ display: "inline-flex", gap: 4, padding: 4, background: "#e8e0d0", borderRadius: 12 }}>
                {["Cuisine", "Salle", "Shop"].map((eq) => (
                  <button key={eq} type="button" onClick={() => setPEquipe(eq)} style={pillBtn(pEquipe === eq, etab?.couleur)}>
                    {eq}
                  </button>
                ))}
              </div>
            </FieldRow>

            <FieldRow label="Couleur">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {COULEURS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPCouleur(c)}
                    style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: c,
                      border: pCouleur === c ? "2px solid #1a1a1a" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
            </FieldRow>

            <FieldRow label="Emoji (optionnel)">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => setPEmoji(null)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: !pEmoji ? "2px solid #D4775A" : "1px solid #ddd6c8",
                    background: "#fff", fontSize: 12, cursor: "pointer", color: "#999",
                  }}
                >
                  —
                </button>
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setPEmoji(e)}
                    style={{
                      width: 32, height: 32, borderRadius: 8,
                      border: pEmoji === e ? "2px solid #D4775A" : "1px solid #ddd6c8",
                      background: "#fff", fontSize: 18, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </FieldRow>

            {/* Preview */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", marginBottom: 6 }}>Apercu</div>
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "4px 10px", borderRadius: 6,
                background: `${pCouleur}20`, border: `1px solid ${pCouleur}40`,
                fontSize: 13, color: "#1a1a1a",
              }}>
                {pEmoji && <span>{pEmoji}</span>}
                <span style={{ fontWeight: 700 }}>{pNom || "Nom"}</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowPosteModal(false)} style={cancelBtnStyle}>Annuler</button>
              <button
                type="button"
                onClick={handleSavePoste}
                disabled={saving || !pNom.trim()}
                style={{ ...saveBtnStyle, opacity: saving || !pNom.trim() ? 0.5 : 1 }}
              >
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}

/* ── Sub-components ── */

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function SliderRow({
  label, value, min, max, step, unit, onChange, color,
}: {
  label: string; value: number; min: number; max: number; step: number;
  unit: string; onChange: (v: number) => void; color?: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={labelStyle}>{label}</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: color ?? "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
          {typeof value === "number" ? value.toFixed(step < 1 ? 1 : 0) : value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: color ?? "#D4775A" }}
      />
    </div>
  );
}

function SimBlock({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontSize: 11, color: "#6f6a61", fontWeight: 600 }}>Shift {label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>
        {value.toFixed(0)} EUR
      </div>
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900, margin: "0 auto", padding: "16px 16px 60px",
};

const titleStyle: React.CSSProperties = {
  fontSize: 26, fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1.5, textTransform: "uppercase",
  color: "#1a1a1a",
};

const sectionCard: React.CSSProperties = {
  background: "#fff", border: "1px solid #ddd6c8",
  borderRadius: 12, padding: "20px 20px 10px",
};

const sectionTitle: React.CSSProperties = {
  fontSize: 16, fontWeight: 700, color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  marginBottom: 16, letterSpacing: 0.5,
};

const labelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#6f6a61",
  marginBottom: 6, letterSpacing: 0.3,
};

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "8px 12px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
  outline: "none", boxSizing: "border-box",
};

const pillBtn = (active: boolean, ec?: string): React.CSSProperties => ({
  padding: "6px 14px", borderRadius: 10,
  border: "none",
  background: active ? (ec ? ec + "25" : "#fff") : "transparent",
  color: active ? "#1a1a1a" : "#999",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
  transition: "all 0.15s",
});

const warningBox: React.CSSProperties = {
  marginTop: 8, padding: "8px 12px", borderRadius: 8,
  background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)",
  fontSize: 12, color: "#6f6a61", lineHeight: 1.5,
};

const infoBox: React.CSSProperties = {
  padding: "10px 14px", borderRadius: 8,
  background: "#faf7f2", border: "1px solid #ddd6c8",
  fontSize: 13, color: "#1a1a1a", marginBottom: 14,
};

const repasCard: React.CSSProperties = {
  padding: "12px 16px", borderRadius: 10,
  border: "1.5px solid #ddd6c8", background: "#fff",
  cursor: "pointer", textAlign: "left",
};

const posteRow: React.CSSProperties = {
  display: "flex", justifyContent: "space-between", alignItems: "center",
  padding: "8px 12px", borderRadius: 8,
  border: "1px solid #f0ebe3", background: "#faf7f2",
};

const inactiveBadge: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
  background: "rgba(0,0,0,0.08)", color: "#999",
};

const addBtn: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%",
  border: "1px solid #ddd6c8", background: "#fff",
  fontSize: 18, fontWeight: 400, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#D4775A",
};

const smallBtn: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 6,
  border: "1px solid #ddd6c8", background: "#fff",
  fontSize: 11, fontWeight: 600, cursor: "pointer",
  color: "#6f6a61",
};

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 200, padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 24,
  width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
};

const modalTitle: React.CSSProperties = {
  margin: "0 0 16px", fontSize: 18, fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 20, border: "none",
  background: "#D4775A", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8",
  background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600, cursor: "pointer",
};
