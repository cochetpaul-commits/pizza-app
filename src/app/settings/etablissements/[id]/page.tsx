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
  type: string;
  montant: number | null;
  recurrence: string;
  actif: boolean;
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

  // Prime modal (multi-step)
  const [showPrimeModal, setShowPrimeModal] = useState(false);
  const [primeStep, setPrimeStep] = useState<"choice" | "duplicate" | "create">("choice");
  const [primeChoice, setPrimeChoice] = useState<"duplicate" | "create">("create");
  const [primeDupEtabId, setPrimeDupEtabId] = useState("");
  const [primeLibelle, setPrimeLibelle] = useState("");
  const [primeCode, setPrimeCode] = useState("");
  const [editPrimeId, setEditPrimeId] = useState<string | null>(null);
  const [allEtabs, setAllEtabs] = useState<{ id: string; nom: string }[]>([]);

  // Planification modals
  const [showEquipesModal, setShowEquipesModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importEquipe, setImportEquipe] = useState("");
  const [importEtabId, setImportEtabId] = useState("");

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
      const [etabRes, postesRes, primesRes, allEtabsRes] = await Promise.all([
        supabase.from("etablissements").select("*").eq("id", id).single(),
        supabase.from("postes").select("id, nom, equipe, couleur, emoji, actif").eq("etablissement_id", id).order("equipe").order("nom"),
        supabase.from("primes").select("id, libelle, code, type, montant, recurrence, actif").eq("etablissement_id", id).order("libelle"),
        supabase.from("etablissements").select("id, nom").eq("actif", true).order("nom"),
      ]);
      if (!cancelled) {
        if (etabRes.data) setSettings(etabRes.data as unknown as Settings);
        setPostes((postesRes.data ?? []) as Poste[]);
        setPrimes((primesRes.data ?? []) as Prime[]);
        setAllEtabs((allEtabsRes.data ?? []).filter(e => e.id !== id) as { id: string; nom: string }[]);
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


  /* ── Prime CRUD ── */
  const openAddPrime = () => {
    setEditPrimeId(null);
    setPrimeLibelle("");
    setPrimeCode("");
    setPrimeChoice("create");
    setPrimeStep("choice");
    setPrimeDupEtabId("");
    setShowPrimeModal(true);
  };

  const openEditPrime = (p: Prime) => {
    setEditPrimeId(p.id);
    setPrimeLibelle(p.libelle);
    setPrimeCode(p.code);
    setPrimeStep("create");
    setShowPrimeModal(true);
  };

  const savePrime = async () => {
    if (!id || !primeLibelle.trim()) return;
    if (editPrimeId) {
      const { data } = await supabase.from("primes").update({ libelle: primeLibelle.trim(), code: primeCode.trim() }).eq("id", editPrimeId).select().single();
      if (data) setPrimes(prev => prev.map(p => p.id === editPrimeId ? { ...p, ...data } as Prime : p));
    } else {
      const { data } = await supabase.from("primes").insert({ etablissement_id: id, libelle: primeLibelle.trim(), code: primeCode.trim() }).select().single();
      if (data) setPrimes(prev => [...prev, data as Prime]);
    }
    setShowPrimeModal(false);
  };

  const duplicatePrimes = async () => {
    if (!id || !primeDupEtabId) return;
    const { data: srcPrimes } = await supabase.from("primes").select("libelle, code, type, montant, recurrence").eq("etablissement_id", primeDupEtabId).eq("actif", true);
    if (!srcPrimes || srcPrimes.length === 0) { alert("Aucune prime a dupliquer."); return; }
    const toInsert = srcPrimes.map(p => ({ ...p, etablissement_id: id }));
    const { data } = await supabase.from("primes").insert(toInsert).select();
    if (data) setPrimes(prev => [...prev, ...(data as Prime[])]);
    setShowPrimeModal(false);
  };

  const deletePrime = async (primeId: string) => {
    if (!confirm("Supprimer cette prime ?")) return;
    await supabase.from("primes").delete().eq("id", primeId);
    setPrimes(prev => prev.filter(p => p.id !== primeId));
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
          <button type="button" onClick={openAddPrime} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
          }}>
            Ajouter
          </button>
        </div>
        {primes.length === 0 ? (
          <p style={{ color: "#999", fontSize: 13, textAlign: "center", padding: "20px 0" }}>
            Vous n&apos;avez pas cree de prime pour le moment.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Libelle</th>
                <th style={{ ...LABEL, textAlign: "left", padding: "8px 0" }}>Code associe</th>
                <th style={{ ...LABEL, textAlign: "right", padding: "8px 0", width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {primes.map(p => (
                <tr key={p.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                  <td style={{ padding: "10px 0", fontWeight: 500 }}>{p.libelle}</td>
                  <td style={{ padding: "10px 0", color: "#999" }}>{p.code}</td>
                  <td style={{ padding: "10px 0", textAlign: "right" }}>
                    <button type="button" onClick={() => openEditPrime(p)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontSize: 14, color: "#999" }} title="Modifier">
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                    </button>
                    <button type="button" onClick={() => deletePrime(p.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: "2px 6px", fontSize: 14, color: "#DC2626" }} title="Supprimer">
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Conges payes */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Conges payes</h2>
          <a href="/rh/conges" style={{ fontSize: 12, color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            Voir les compteurs de conges payes
          </a>
        </div>

        {/* Base de calcul */}
        <div style={ROW}>
          <div>
            <span style={{ fontSize: 14, color: "#1a1a1a" }}>Base de calcul du decompte des conges payes</span>
            <span style={{ color: "#DC2626", marginLeft: 2 }}>*</span>
          </div>
          <select style={{ ...INPUT, width: 240 }} value={settings.base_calcul_cp} onChange={e => updateField({ base_calcul_cp: Number(e.target.value) })}>
            <option value={6}>Sur 6 jours - FR - ouvrable</option>
            <option value={5}>Sur 5 jours - FR - ouvre</option>
          </select>
        </div>

        {/* Acquisition mensuelle */}
        <div style={ROW}>
          <div>
            <div style={{ fontSize: 14, color: "#1a1a1a", display: "flex", alignItems: "center", gap: 4 }}>
              Acquisition mensuelle <span style={{ color: "#DC2626" }}>*</span>
              <span title="Nombre de jours de conges acquis chaque mois" style={{ cursor: "help", display: "inline-flex" }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
              </span>
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>Appliquee automatiquement dans la nuit du dernier jour du mois.</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input type="number" style={{ ...INPUT, width: 80, textAlign: "center" }} value={settings.acquisition_mensuelle_cp} onChange={e => updateField({ acquisition_mensuelle_cp: Number(e.target.value) })} step={0.5} min={0} max={5} />
            <span style={{ fontSize: 12, color: "#999" }}>j</span>
          </div>
        </div>

        {/* Periode d'acquisition */}
        <div style={{ ...ROW, borderBottom: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 14, color: "#1a1a1a" }}>Periode d&apos;acquisition</span>
            <span style={{ color: "#DC2626" }}>*</span>
            <span title="Periode de reference pour le calcul des conges payes" style={{ cursor: "help", display: "inline-flex", alignItems: "center" }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span style={{ color: "#666" }}>Du</span>
            <select style={{
              padding: "6px 10px", borderRadius: 20, border: "1px solid #ddd6c8",
              fontSize: 13, background: "#fff", color: "#1a1a1a", cursor: "pointer",
              appearance: "none" as const, WebkitAppearance: "none" as const,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center",
              paddingRight: 24, minWidth: 52,
            }} defaultValue="1">
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
            <select style={{
              padding: "6px 12px", borderRadius: 20, border: "1px solid #ddd6c8",
              fontSize: 13, background: "#fff", color: "#1a1a1a", cursor: "pointer",
              appearance: "none" as const, WebkitAppearance: "none" as const,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
              paddingRight: 28, minWidth: 90,
            }} defaultValue="6">
              {["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <span style={{ color: "#666" }}>au 31 mai N+1</span>
          </div>
        </div>

        {/* Save + last update */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid #f0ebe3" }}>
          <button type="button" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} style={{
            padding: "8px 20px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#999",
          }}>
            Enregistrer
          </button>
          <span style={{ fontSize: 11, color: "#999" }}>
            Mise a jour le {new Date().toLocaleDateString("fr-FR")}.
          </span>
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

  const importEtiquettes = async () => {
    if (!id || !importEtabId || !importEquipe) return;
    const { data: src } = await supabase.from("postes").select("nom, equipe, couleur, emoji").eq("etablissement_id", importEtabId).eq("equipe", importEquipe).eq("actif", true);
    if (!src || src.length === 0) { alert("Aucune etiquette a importer."); return; }
    const toInsert = src.map(p => ({ ...p, etablissement_id: id, actif: true }));
    const { data } = await supabase.from("postes").insert(toInsert).select();
    if (data) setPostes(prev => [...prev, ...(data as Poste[])]);
    setShowImportModal(false);
  };

  const deletePoste = async (posteId: string) => {
    if (!confirm("Supprimer cette etiquette ?")) return;
    await supabase.from("postes").delete().eq("id", posteId);
    setPostes(prev => prev.filter(p => p.id !== posteId));
    setShowPosteModal(false);
  };

  const renderPlanification = () => (
    <>
      {/* Equipes */}
      <div style={CARD}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Organisation des plannings (equipes)</h2>
          <button type="button" onClick={() => setShowEquipesModal(true)} style={{
            padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
          }}>
            Modifier
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {equipes.map(eq => (
            <span key={eq} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
              <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
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
          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Les employes peuvent saisir leurs heures reelles</span>
          <Toggle value={true} onChange={() => {}} />
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Appliquer un temps de pause par defaut lors de la creation d&apos;un shift</span>
          <Toggle value={true} onChange={() => {}} />
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Calculer la duree d&apos;une pause en</span>
          <select style={{ ...INPUT, width: 150 }} defaultValue="minutes">
            <option value="minutes">Minutes (min)</option>
            <option value="heures">Heures (h)</option>
          </select>
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Ajouter un temps de pause par defaut de</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 70, textAlign: "center" }} value={settings.pause_defaut_minutes} onChange={e => updateField({ pause_defaut_minutes: Number(e.target.value) })} min={0} max={120} />
            <span style={{ fontSize: 12, color: "#999" }}>min</span>
          </div>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Ajouter la pause par defaut aux shifts d&apos;une duree minimum de</span>
          <input type="text" style={{ ...INPUT, width: 80, textAlign: "center" }} defaultValue="0:0" placeholder="HH:MM" />
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} style={{
            padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#999",
          }}>
            Enregistrer
          </button>
        </div>
      </div>

      {/* Objectifs */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Objectifs</h2>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Cout des shifts / ventes</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 80, textAlign: "right" }} value={settings.objectif_cout_ventes} onChange={e => updateField({ objectif_cout_ventes: Number(e.target.value) })} min={0} max={100} />
            <span style={{ fontSize: 12, color: "#999" }}>%</span>
          </div>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Productivite</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 80, textAlign: "right" }} value={settings.objectif_productivite} onChange={e => updateField({ objectif_productivite: Number(e.target.value) })} min={0} />
            <span style={{ fontSize: 12, color: "#999" }}>EUR/H</span>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} style={{
            padding: "6px 16px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#999",
          }}>
            Enregistrer
          </button>
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
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={() => openCreatePoste(eq)} style={{
                  padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
                }}>
                  Nouvelle etiquette
                </button>
                <button type="button" onClick={() => { setImportEquipe(eq); setImportEtabId(""); setShowImportModal(true); }} style={{
                  padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff",
                  fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
                }}>
                  Importer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Compteurs */}
      <div style={CARD}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Compteurs</h2>
        <div style={{
          padding: 12, borderRadius: 8, marginBottom: 12,
          background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.15)",
        }}>
          <span style={{ fontSize: 12, color: "#DC2626", lineHeight: 1.4 }}>
            Attention, les changements de configuration peuvent impacter les donnees. Veuillez verifier le solde de Repos Compensateurs de chaque collaborateur avant toute modification.
          </span>
        </div>
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

      {/* Modal: Equipes */}
      {showEquipesModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", zIndex: 200 }}
          onClick={() => setShowEquipesModal(false)}
        >
          <div style={{ background: "#fff", width: 340, height: "100%", padding: 24, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Plannings</h2>
              <button type="button" onClick={() => setShowEquipesModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <p style={{ fontSize: 12, color: "#999", lineHeight: 1.4, marginBottom: 16 }}>
              Vous pouvez avoir un ou plusieurs plannings par etablissement : cuisine, salle, etc. Les plannings etant independants ils sont publies separement.
            </p>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>
              Cet etablissement a <strong style={{ color: "#1a1a1a" }}>{equipes.length} planning{equipes.length > 1 ? "s" : ""}</strong> :
            </p>
            {equipes.map(eq => (
              <div key={eq} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <input style={{ ...INPUT, flex: 1 }} value={eq} readOnly />
                <span style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap" }}>{eq.length}/40</span>
              </div>
            ))}
            <button type="button" style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 6, border: "1px solid #ddd6c8",
              background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
              marginTop: 8,
            }}>
              + Ajouter un planning
            </button>
            <div style={{ position: "absolute", bottom: 24, left: 24, right: 24 }}>
              <button type="button" onClick={() => setShowEquipesModal(false)} style={{
                width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #ddd6c8",
                background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#999",
              }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Import etiquettes */}
      {showImportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowImportModal(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Importer des etiquettes</h2>
                <p style={{ fontSize: 12, color: "#999", marginTop: 4 }}>Pour gagner du temps !</p>
              </div>
              <button type="button" onClick={() => setShowImportModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Selectionnez un etablissement :</div>
              <select style={INPUT} value={importEtabId} onChange={e => setImportEtabId(e.target.value)}>
                <option value="">Rechercher</option>
                {allEtabs.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            {importEtabId && (
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end" }}>
                <button type="button" onClick={importEtiquettes} style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}>
                  Importer
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Etiquette (Poste) — simplified Komia style */}
      {showPosteModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowPosteModal(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>
                {editPosteId ? "Modifier une etiquette" : "Ajouter une etiquette"}
              </h2>
              <button type="button" onClick={() => setShowPosteModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Pour avoir des plannings super puissants !</p>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 6 }}>Intitule de l&apos;etiquette</div>
              <input style={INPUT} value={pNom} onChange={e => setPNom(e.target.value)} placeholder="" />
            </div>

            {/* Extended color palette */}
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 20 }}>
              {[
                "#E8E8E8", "#F2B8D0", "#D4698A", "#8B2252", "#E8A0C8", "#C87AB0", "#9B59B6", "#7D5BA6", "#6A4C93", "#5B4A8A",
                "#89CFF0", "#6CB4EE", "#4A90D9", "#3B5FA0", "#2C6F8F", "#2E8B8B", "#3AA08C", "#2D8B57", "#1B5E20", "#4A7B3F",
                "#8DB600", "#A4C639", "#B5B35C", "#8B7D3C", "#C9A96E", "#E8C49A", "#D4A06A", "#C08040", "#E8D4B0", "#F0E4C8",
                "#E8A040", "#C0392B", "#F4A7B9",
              ].map(c => (
                <button key={c} type="button" onClick={() => setPCouleur(c)} style={{
                  width: 32, height: 32, borderRadius: 6,
                  border: pCouleur === c ? "2px solid #1a1a1a" : "1px solid #e0e0e0",
                  background: c, cursor: "pointer",
                }} />
              ))}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              {editPosteId && (
                <button type="button" onClick={() => deletePoste(editPosteId)} style={{
                  padding: "10px 20px", borderRadius: 8, border: "none",
                  background: "#DC2626", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  marginRight: "auto",
                }}>
                  Supprimer
                </button>
              )}
              <button type="button" onClick={savePoste} disabled={!pNom.trim()} style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                background: pNom.trim() ? "#1a1a1a" : "#ddd6c8", color: "#fff",
                fontSize: 13, fontWeight: 600, cursor: pNom.trim() ? "pointer" : "default",
              }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Prime (multi-step) */}
      {showPrimeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowPrimeModal(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 500, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
                {editPrimeId ? "Modifier la prime" : "Ajouter un modele de prime ou d'indemnite"}
              </h2>
              <button type="button" onClick={() => setShowPrimeModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999", padding: 4 }}>
                x
              </button>
            </div>

            {/* Step: Choice (only for new) */}
            {primeStep === "choice" && !editPrimeId && (
              <>
                <label style={{
                  display: "block", padding: 16, borderRadius: 10, marginBottom: 8, cursor: "pointer",
                  border: primeChoice === "duplicate" ? "2px solid #2D6A4F" : "1px solid #ddd6c8",
                  background: primeChoice === "duplicate" ? "rgba(45,106,79,0.04)" : "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <input type="radio" name="primeChoice" checked={primeChoice === "duplicate"} onChange={() => setPrimeChoice("duplicate")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Dupliquer les modeles d&apos;un autre etablissement</div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Choisissez parmi des modeles deja cree pour un autre etablissement.</div>
                    </div>
                  </div>
                </label>
                <label style={{
                  display: "block", padding: 16, borderRadius: 10, marginBottom: 16, cursor: "pointer",
                  border: primeChoice === "create" ? "2px solid #2D6A4F" : "1px solid #ddd6c8",
                  background: primeChoice === "create" ? "rgba(45,106,79,0.04)" : "#fff",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <input type="radio" name="primeChoice" checked={primeChoice === "create"} onChange={() => setPrimeChoice("create")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Creer votre modele de prime ou d&apos;indemnite</div>
                      <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Vous ne trouvez pas votre modele ? Vous pouvez creer votre propre modele.</div>
                    </div>
                  </div>
                </label>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setPrimeStep(primeChoice)} style={{
                    padding: "10px 20px", borderRadius: 8, border: "none",
                    background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                    display: "flex", alignItems: "center", gap: 6,
                  }}>
                    Suivant
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
              </>
            )}

            {/* Step: Duplicate */}
            {primeStep === "duplicate" && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...LABEL, marginBottom: 6 }}>Selectionner les modeles d&apos;un autre etablissement <span style={{ color: "#DC2626" }}>*</span></div>
                  <select style={INPUT} value={primeDupEtabId} onChange={e => setPrimeDupEtabId(e.target.value)}>
                    <option value="">Rechercher</option>
                    {allEtabs.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                  </select>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  <button type="button" onClick={() => setPrimeStep("choice")} style={{
                    background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1a1a1a",
                    display: "flex", alignItems: "center", gap: 4,
                  }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                    Retour
                  </button>
                  <button type="button" onClick={duplicatePrimes} disabled={!primeDupEtabId} style={{
                    padding: "10px 20px", borderRadius: 8, border: "none",
                    background: primeDupEtabId ? "#1a1a1a" : "#ddd6c8", color: "#fff",
                    fontSize: 13, fontWeight: 600, cursor: primeDupEtabId ? "pointer" : "default",
                  }}>
                    Ajouter
                  </button>
                </div>
              </>
            )}

            {/* Step: Create / Edit */}
            {primeStep === "create" && (
              <>
                {!editPrimeId && (
                  <div style={{
                    padding: 12, borderRadius: 8, background: "rgba(37,99,235,0.04)",
                    border: "1px solid rgba(37,99,235,0.15)", marginBottom: 16,
                    display: "flex", gap: 10, alignItems: "flex-start",
                  }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2" style={{ flexShrink: 0, marginTop: 2 }}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    <span style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
                      Referez-vous a la configuration de votre logiciel de paie ou rapprochez-vous de votre gestionnaire de paie.
                    </span>
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ ...LABEL, marginBottom: 4 }}>Libelle <span style={{ color: "#DC2626" }}>*</span></div>
                  <input style={INPUT} value={primeLibelle} onChange={e => setPrimeLibelle(e.target.value)} placeholder="Ex: Prime Noel" />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...LABEL, marginBottom: 4 }}>Code associe <span style={{ color: "#DC2626" }}>*</span></div>
                  <input style={INPUT} value={primeCode} onChange={e => setPrimeCode(e.target.value)} placeholder="Ex: 6413" />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                  {!editPrimeId && (
                    <button type="button" onClick={() => setPrimeStep("choice")} style={{
                      background: "none", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#1a1a1a",
                      display: "flex", alignItems: "center", gap: 4,
                    }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                      Retour
                    </button>
                  )}
                  <button type="button" onClick={savePrime} disabled={!primeLibelle.trim() || !primeCode.trim()} style={{
                    padding: "10px 20px", borderRadius: 8, border: "none",
                    background: primeLibelle.trim() && primeCode.trim() ? "#1a1a1a" : "#ddd6c8",
                    color: "#fff", fontSize: 13, fontWeight: 600,
                    cursor: primeLibelle.trim() && primeCode.trim() ? "pointer" : "default",
                  }}>
                    {editPrimeId ? "Enregistrer" : "Ajouter"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </RequireRole>
  );
}
