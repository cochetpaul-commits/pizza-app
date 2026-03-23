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
  duree_min_shift_pause: string;
  employes_heures_reelles: boolean;
  pause_auto_creation: boolean;
  pause_unite: string;
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
  cp_periode_jour: number;
  cp_periode_mois: number;
  repos_compensateurs_actif: boolean;
  popina_location_id: string | null;
  actif: boolean;
};

type Equipe = {
  id: string;
  nom: string;
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

type Tab = "social" | "planification" | "modulation" | "pointeuse" | "integrations";

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

/* ── HelpTip — black tooltip on click ─────────────────── */

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        style={{
          background: "none", border: "none", cursor: "pointer", padding: 0,
          display: "inline-flex", alignItems: "center",
        }}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
          background: "#1a1a1a", color: "#fff", padding: "10px 14px", borderRadius: 8,
          fontSize: 12, lineHeight: 1.5, width: 260, zIndex: 50,
          boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
        }}>
          {text}
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
            borderTop: "6px solid #1a1a1a",
          }} />
        </div>
      )}
    </span>
  );
}

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
  const [dbEquipes, setDbEquipes] = useState<Equipe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [primes, setPrimes] = useState<Prime[]>([]);
  const [employes, setEmployes] = useState<{ id: string; prenom: string; nom: string; equipes_access: string[] }[]>([]);
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

  // Modulation
  type PeriodeMod = { id: string; mode: string; date_debut: string; date_fin: string; heures_annuelles: number; temps_plein_actif: boolean; plafond_hebdo_h: number; plancher_hebdo_h: number; temps_partiel_actif: boolean; actif: boolean; equipe_ids: string[] };
  const [periodes, setPeriodes] = useState<PeriodeMod[]>([]);
  const [showCreatePeriode, setShowCreatePeriode] = useState(false);
  const [modMode, setModMode] = useState<"modulation" | "lissage">("modulation");
  const [modDebut, setModDebut] = useState(() => { const y = new Date().getFullYear(); return `${y}-01-01`; });
  const [modFin, setModFin] = useState(() => { const y = new Date().getFullYear(); return `${y}-12-31`; });
  const [modHeures, setModHeures] = useState(1607);
  const [modTpActif, setModTpActif] = useState(true);
  const [modPlafond, setModPlafond] = useState(42);
  const [modPlancher, setModPlancher] = useState(0);
  const [modPartielActif, setModPartielActif] = useState(false);
  const [modEquipeIds, setModEquipeIds] = useState<string[]>([]);

  // Planification modals
  const [showEquipesModal, setShowEquipesModal] = useState(false);
  const [editEquipes, setEditEquipes] = useState<string[]>([]);
  const [newEquipeName, setNewEquipeName] = useState("");
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
      const [etabRes, postesRes, primesRes, allEtabsRes, equipesRes, periodesRes, empRes] = await Promise.all([
        supabase.from("etablissements").select("*").eq("id", id).single(),
        supabase.from("postes").select("id, nom, equipe, couleur, emoji, actif").eq("etablissement_id", id).order("equipe").order("nom"),
        supabase.from("primes").select("id, libelle, code, type, montant, recurrence, actif").eq("etablissement_id", id).order("libelle"),
        supabase.from("etablissements").select("id, nom").eq("actif", true).order("nom"),
        supabase.from("equipes").select("id, nom, actif").eq("etablissement_id", id).eq("actif", true).order("nom"),
        supabase.from("periodes_modulation").select("*").eq("etablissement_id", id).order("date_debut", { ascending: false }),
        supabase.from("employes").select("id, prenom, nom, equipes_access").eq("etablissement_id", id).eq("actif", true).order("nom"),
      ]);
      if (!cancelled) {
        if (etabRes.data) setSettings(etabRes.data as unknown as Settings);
        const loadedPostes = (postesRes.data ?? []) as Poste[];
        setPostes(loadedPostes);
        const loadedEquipes = (equipesRes.data ?? []) as Equipe[];
        setDbEquipes(loadedEquipes);
        // If equipes table is empty/missing, derive from postes
        if (loadedEquipes.length > 0) {
          setEditEquipes(loadedEquipes.map(e => e.nom));
        } else {
          const fromPostes = [...new Set(loadedPostes.map(p => p.equipe))].sort();
          setEditEquipes(fromPostes);
        }
        setPrimes((primesRes.data ?? []) as Prime[]);
        setAllEtabs((allEtabsRes.data ?? []).filter(e => e.id !== id) as { id: string; nom: string }[]);
        setPeriodes((periodesRes.data ?? []) as PeriodeMod[]);
        setEmployes((empRes.data ?? []) as { id: string; prenom: string; nom: string; equipes_access: string[] }[]);
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

  // Equipes from DB table + any from postes (backwards compat) + modal edits
  const equipes = [...new Set([...dbEquipes.map(e => e.nom), ...postes.map(p => p.equipe), ...editEquipes])].sort();

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
              <HelpTip text="2.5 est le minimum requis pour la base de calcul du decompte des conges payes choisie." />
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
            <HelpTip text="Vous ne pouvez pas selectionner le '29 Fevrier' pour le debut de votre periode d'acquisition. Nous ne gerons pas cette date de debut car elle implique une gestion particuliere en cas d'annee bissextile." />
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
            }} value={settings.cp_periode_jour ?? 1} onChange={e => updateField({ cp_periode_jour: Number(e.target.value) })}>
              {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
            </select>
            <select style={{
              padding: "6px 12px", borderRadius: 20, border: "1px solid #ddd6c8",
              fontSize: 13, background: "#fff", color: "#1a1a1a", cursor: "pointer",
              appearance: "none" as const, WebkitAppearance: "none" as const,
              backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")",
              backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center",
              paddingRight: 28, minWidth: 90,
            }} value={settings.cp_periode_mois ?? 6} onChange={e => updateField({ cp_periode_mois: Number(e.target.value) })}>
              {["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"].map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
            <span style={{ color: "#666" }}>au 31 mai N+1</span>
          </div>
        </div>

        {/* Save + last update */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid #f0ebe3" }}>
          <button type="button" onClick={() => updateField({
            base_calcul_cp: settings.base_calcul_cp,
            acquisition_mensuelle_cp: settings.acquisition_mensuelle_cp,
            cp_periode_jour: settings.cp_periode_jour,
            cp_periode_mois: settings.cp_periode_mois,
          })} style={{
            padding: "8px 20px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            color: saving ? "#D4775A" : "#999",
          }}>
            {saving ? "Enregistrement..." : "Enregistrer"}
          </button>
          <span style={{ fontSize: 11, color: saved ? "#22c55e" : "#999" }}>
            {saved ? "Enregistre" : `Mise a jour le ${new Date().toLocaleDateString("fr-FR")}.`}
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
    // Load ALL active postes from the source establishment
    const { data: src } = await supabase.from("postes").select("nom, couleur").eq("etablissement_id", importEtabId).eq("actif", true);
    if (!src || src.length === 0) { alert("Aucune etiquette a importer depuis cet etablissement."); return; }
    // Insert them under the current equipe of this establishment
    const toInsert = src.map(p => ({ nom: p.nom, couleur: p.couleur, equipe: importEquipe, etablissement_id: id, actif: true, emoji: null }));
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
          <button type="button" onClick={() => { setEditEquipes([...equipes]); setNewEquipeName(""); setShowEquipesModal(true); }} style={{
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
          <Toggle value={settings.employes_heures_reelles} onChange={v => updateField({ employes_heures_reelles: v })} />
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Appliquer un temps de pause par defaut lors de la creation d&apos;un shift</span>
          <Toggle value={settings.pause_auto_creation} onChange={v => updateField({ pause_auto_creation: v })} />
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Calculer la duree d&apos;une pause en</span>
          <select style={{ ...INPUT, width: 160 }} value={settings.pause_unite} onChange={e => updateField({ pause_unite: e.target.value })}>
            <option value="minutes">Minutes (min)</option>
            <option value="heures">Heures (h)</option>
          </select>
        </div>
        <div style={ROW}>
          <span style={{ fontSize: 14, color: "#1a1a1a" }}>Ajouter un temps de pause par defaut de</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input type="number" style={{ ...INPUT, width: 80, textAlign: "right" }} value={settings.pause_defaut_minutes} onChange={e => updateField({ pause_defaut_minutes: Number(e.target.value) })} min={0} max={120} />
            <span style={{ fontSize: 12, color: "#999" }}>min</span>
          </div>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 14, color: "#1a1a1a" }}>Ajouter la pause par defaut aux shifts d&apos;une duree minimum de</span>
            <HelpTip text="Si un shift depasse cette duree, la pause configuree ci-dessus sera automatiquement ajoutee lors de la creation du shift." />
          </div>
          <input
            type="text"
            style={{ ...INPUT, width: 80, textAlign: "center" }}
            value={(() => {
              const d = settings.duree_min_shift_pause ?? "03:00:00";
              const parts = String(d).split(":");
              return `${parts[0] ?? "0"}:${parts[1] ?? "00"}`;
            })()}
            onChange={e => {
              const val = e.target.value;
              if (/^\d{0,2}:?\d{0,2}$/.test(val)) {
                const clean = val.includes(":") ? val : val;
                updateField({ duree_min_shift_pause: clean.includes(":") ? `${clean}:00` : `${clean}:00:00` });
              }
            }}
            placeholder="HH:MM"
          />
        </div>
        <div style={{ marginTop: 14 }}>
          <button type="button" onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); }} style={{
            padding: "8px 20px", borderRadius: 6, border: "1px solid #ddd6c8",
            background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#999",
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

        {equipes.map(eq => {
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
          <Toggle value={settings.repos_compensateurs_actif} onChange={v => updateField({ repos_compensateurs_actif: v })} />
        </div>
      </div>
    </>
  );

  /* ── Tab: Modulation ── */
  const createPeriode = async () => {
    if (!id) return;
    const payload = {
      etablissement_id: id,
      mode: modMode,
      date_debut: modDebut,
      date_fin: modFin,
      heures_annuelles: modHeures,
      temps_plein_actif: modTpActif,
      plafond_hebdo_h: modPlafond,
      plancher_hebdo_h: modPlancher,
      temps_partiel_actif: modPartielActif,
      equipe_ids: modEquipeIds,
    };
    const { data } = await supabase.from("periodes_modulation").insert(payload).select().single();
    if (data) setPeriodes(prev => [data as PeriodeMod, ...prev]);
    setShowCreatePeriode(false);
  };

  const deletePeriode = async (pId: string) => {
    if (!confirm("Supprimer cette periode ?")) return;
    await supabase.from("periodes_modulation").delete().eq("id", pId);
    setPeriodes(prev => prev.filter(p => p.id !== pId));
  };

  const renderModulation = () => {
    // List view (no create form)
    if (!showCreatePeriode) {
      return (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
            <button type="button" onClick={() => setShowCreatePeriode(true)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "10px 18px", borderRadius: 8,
              background: "#1a1a1a", color: "#fff", border: "none",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              + Creer une periode
            </button>
          </div>

          {periodes.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
                Aucune periode de modulation planifiee
              </h2>
              <p style={{ fontSize: 14, color: "#999", maxWidth: 500, margin: "0 auto", lineHeight: 1.5 }}>
                Cet etablissement n&apos;a pas de periode de modulation planifiee. Vous pouvez creer une periode de modulation en cliquant sur le bouton ci-dessus.
              </p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {periodes.map(p => (
                <div key={p.id} style={CARD}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div>
                      <span style={{
                        padding: "3px 10px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                        background: p.mode === "modulation" ? "rgba(45,106,79,0.1)" : "rgba(37,99,235,0.1)",
                        color: p.mode === "modulation" ? "#2D6A4F" : "#2563eb",
                        textTransform: "uppercase",
                      }}>
                        {p.mode}
                      </span>
                    </div>
                    <button type="button" onClick={() => deletePeriode(p.id)} style={{
                      background: "none", border: "none", cursor: "pointer", color: "#DC2626", fontSize: 12, fontWeight: 600,
                    }}>
                      Supprimer
                    </button>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                    Du {new Date(p.date_debut).toLocaleDateString("fr-FR")} au {new Date(p.date_fin).toLocaleDateString("fr-FR")}
                  </div>
                  <div style={{ fontSize: 12, color: "#999" }}>
                    {p.heures_annuelles}h/an
                    {p.temps_plein_actif && ` · Temps plein (plafond ${p.plafond_hebdo_h}h)`}
                    {p.temps_partiel_actif && " · Temps partiel"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      );
    }

    // Create form
    return (
      <>
        <button type="button" onClick={() => setShowCreatePeriode(false)} style={{
          background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1a1a1a",
          display: "flex", alignItems: "center", gap: 4, marginBottom: 16, fontWeight: 600,
        }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
          Retour a la configuration
        </button>

        <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 20 }}>
          Nouvelle periode d&apos;amenagement du temps de travail
        </h2>

        {/* Mode de comptage */}
        <div style={CARD}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Mode de comptage des heures</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <label style={{
              padding: 16, borderRadius: 10, cursor: "pointer",
              border: modMode === "modulation" ? "2px solid #2D6A4F" : "1px solid #ddd6c8",
              background: modMode === "modulation" ? "rgba(45,106,79,0.04)" : "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="radio" name="modMode" checked={modMode === "modulation"} onChange={() => setModMode("modulation")} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Modulation</span>
              </div>
              <p style={{ fontSize: 12, color: "#666", lineHeight: 1.4, margin: 0 }}>
                La modulation du temps de travail, tel que defini par un accord d&apos;entreprise ou votre convention collective, permet de definir un nombre d&apos;heures a effectuer sur l&apos;annee. Les horaires sont augmentes en periode de haute activite et reduits en periode de basse activite.
              </p>
            </label>
            <label style={{
              padding: 16, borderRadius: 10, cursor: "pointer",
              border: modMode === "lissage" ? "2px solid #2563eb" : "1px solid #ddd6c8",
              background: modMode === "lissage" ? "rgba(37,99,235,0.04)" : "#fff",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <input type="radio" name="modMode" checked={modMode === "lissage"} onChange={() => setModMode("lissage")} />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Lissage</span>
              </div>
              <p style={{ fontSize: 12, color: "#666", lineHeight: 1.4, margin: 0 }}>
                Dans le cadre du lissage, les variations par rapport a la duree contractuelle hebdomadaire sont compensees d&apos;une semaine a l&apos;autre, permettant de repartir uniformement les fluctuations sur l&apos;ensemble de la periode. A la fin, un compteur d&apos;heures vous indique le solde final.
              </p>
            </label>
          </div>
        </div>

        {/* Periode de reference */}
        <div style={CARD}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Periode de reference</h3>
          <div style={{ ...LABEL, marginBottom: 6 }}>Dates <span style={{ color: "#DC2626" }}>*</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="date" style={{ ...INPUT, width: 180 }} value={modDebut} onChange={e => setModDebut(e.target.value)} />
            <span style={{ color: "#999" }}>→</span>
            <input type="date" style={{ ...INPUT, width: 180 }} value={modFin} onChange={e => setModFin(e.target.value)} />
          </div>
        </div>

        {/* Configuration contrat */}
        <div style={CARD}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Configuration selon le contrat de travail</h3>

          {modMode === "modulation" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                Heures a realiser sur l&apos;annee <span style={{ color: "#DC2626" }}>*</span>
              </div>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
                Les heures sont basees sur un total a realiser pour les temps pleins. Pour les temps partiels, celles-ci seront proratisees.
              </p>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" style={{ ...INPUT, width: 120, textAlign: "right" }} value={modHeures} onChange={e => setModHeures(Number(e.target.value))} />
                <span style={{ fontSize: 13, color: "#999" }}>h</span>
              </div>
            </div>
          )}

          {modMode === "lissage" && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                Heures a travailler sur une semaine
              </div>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 8 }}>
                Cet objectif est base sur les termes du contrat de l&apos;employe, en tenant compte de conditions specifiques telles que la duree de la periode et les heures de travail.
              </p>
            </div>
          )}

          {/* Temps plein + Temps partiel toggles need at least one active */}
          {!modTpActif && !modPartielActif && (
            <div style={{
              padding: 12, borderRadius: 8, marginBottom: 12,
              background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.2)",
            }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#DC2626" }}>Erreur</div>
              <div style={{ fontSize: 12, color: "#DC2626", marginTop: 2 }}>Vous devez activer au moins un type de contrat de travail</div>
            </div>
          )}

          {/* Temps plein */}
          <div style={{ ...CARD, border: modTpActif ? "1px solid #ddd6c8" : "1px solid #f0ebe3", padding: 16, marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: modTpActif ? 12 : 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Temps plein</span>
              <Toggle value={modTpActif} onChange={setModTpActif} />
            </div>
            {modTpActif && modMode === "modulation" && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, paddingTop: 12, borderTop: "1px solid #f0ebe3" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Plafond hebdomadaire</div>
                  <p style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>Nombre maximum d&apos;heures prises en compte en modulation pour une semaine donnee.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" style={{ ...INPUT, width: 80, textAlign: "right" }} value={modPlafond} onChange={e => setModPlafond(Number(e.target.value))} />
                    <span style={{ fontSize: 12, color: "#999" }}>h</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>Plancher hebdomadaire <span style={{ color: "#DC2626" }}>*</span></div>
                  <p style={{ fontSize: 11, color: "#999", marginBottom: 6 }}>Nombre minimum d&apos;heures que doit travailler un employe au cours d&apos;une semaine.</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input type="number" style={{ ...INPUT, width: 80, textAlign: "right" }} value={modPlancher} onChange={e => setModPlancher(Number(e.target.value))} />
                    <span style={{ fontSize: 12, color: "#999" }}>h</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Temps partiel */}
          <div style={{ ...CARD, border: modPartielActif ? "1px solid #ddd6c8" : "1px solid #f0ebe3", padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Temps partiel</span>
              <Toggle value={modPartielActif} onChange={setModPartielActif} />
            </div>
          </div>
        </div>

        {/* Equipes et salaries */}
        <div style={CARD}>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Equipes et Salaries</h3>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
              Equipe(s) {modMode === "modulation" ? "modulee(s)" : "lissee(s)"} <span style={{ color: "#DC2626" }}>*</span>
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#D4775A" }}>{modEquipeIds.length}/{dbEquipes.length}</span>
          </div>
          <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>
            Vous pourrez desactiver ou configurer la modulation du temps de travail par employe dans l&apos;onglet &quot;contrat&quot; du profil de l&apos;employe.
          </p>

          {/* Selected equipes tags */}
          {modEquipeIds.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {modEquipeIds.map(eqId => {
                const eq = dbEquipes.find(e => e.id === eqId);
                if (!eq) return null;
                return (
                  <span key={eqId} style={{
                    display: "inline-flex", alignItems: "center", gap: 4,
                    padding: "4px 10px", borderRadius: 20,
                    background: "rgba(45,106,79,0.08)", color: "#2D6A4F",
                    fontSize: 12, fontWeight: 600,
                  }}>
                    {eq.nom}
                    <button type="button" onClick={() => setModEquipeIds(prev => prev.filter(x => x !== eqId))} style={{
                      background: "none", border: "none", cursor: "pointer", padding: 0, color: "#2D6A4F", fontSize: 14, lineHeight: 1,
                    }}>x</button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Dropdown to add equipes */}
          <select
            style={{ ...INPUT, color: "#999" }}
            value=""
            onChange={e => {
              const val = e.target.value;
              if (val && !modEquipeIds.includes(val)) {
                setModEquipeIds(prev => [...prev, val]);
              }
            }}
          >
            <option value="">Rechercher</option>
            {dbEquipes.filter(eq => !modEquipeIds.includes(eq.id)).map(eq => (
              <option key={eq.id} value={eq.id}>{eq.nom}</option>
            ))}
          </select>
          {dbEquipes.length === 0 && <p style={{ fontSize: 12, color: "#999", marginTop: 8 }}>Aucune equipe configuree. Ajoutez des equipes dans l&apos;onglet Planification.</p>}
        </div>

        {/* Personnaliser la modulation par salarie */}
        {modEquipeIds.length > 0 && (() => {
          // Get equipe names for selected ids
          const selectedEquipeNames = modEquipeIds.map(eId => dbEquipes.find(e => e.id === eId)?.nom).filter(Boolean) as string[];
          // Filter employees who belong to selected equipes
          const filteredEmps = employes.filter(emp => {
            const access = emp.equipes_access ?? [];
            if (access.length === 0) return selectedEquipeNames.length > 0; // no restriction = all equipes
            return access.some(a => selectedEquipeNames.includes(a));
          });
          // Match employee to equipe name
          const empEquipe = (emp: typeof employes[0]) => {
            const access = emp.equipes_access ?? [];
            if (access.length === 0) return selectedEquipeNames[0] ?? "—";
            return access.find(a => selectedEquipeNames.includes(a)) ?? access[0] ?? "—";
          };

          return (
            <div style={CARD}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Personnaliser la modulation par salarie</h3>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Vous pouvez decider de changer certains parametres employe par employe.</p>

              {filteredEmps.length === 0 ? (
                <p style={{ fontSize: 13, color: "#999" }}>Aucun salarie dans les equipes selectionnees.</p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                        <th style={{ ...LABEL, textAlign: "left", padding: "8px 6px", minWidth: 130 }}>Salarie</th>
                        <th style={{ ...LABEL, textAlign: "left", padding: "8px 6px", minWidth: 70 }}>Equipe</th>
                        <th style={{ ...LABEL, textAlign: "center", padding: "8px 6px", minWidth: 70 }}>Module</th>
                        <th style={{ ...LABEL, textAlign: "center", padding: "8px 6px", minWidth: 90 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            Solde initial
                            <HelpTip text="Le solde initial correspond au nombre d'heures a prendre en compte au debut de votre periode pour un salarie. Il peut etre positif ou negatif." />
                          </span>
                        </th>
                        <th style={{ ...LABEL, textAlign: "center", padding: "8px 6px", minWidth: 100 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            Heures a realiser
                            <HelpTip text="Ce sont les heures a realiser par l'employe sur la periode de modulation rattachee a son contrat. Si vide, la valeur par defaut sera automatiquement calculee sur la base des informations renseignees (temps contrat, periode de modulation, etc.)" />
                          </span>
                        </th>
                        <th style={{ ...LABEL, textAlign: "center", padding: "8px 6px", minWidth: 130 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            Debut personnalise
                            <HelpTip text="Renseignez cette date si vous souhaitez que la modulation demarre apres le debut de votre periode pour cet employe." />
                          </span>
                        </th>
                        <th style={{ ...LABEL, textAlign: "center", padding: "8px 6px", minWidth: 130 }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                            Fin personnalisee
                            <HelpTip text="Renseignez cette date si vous souhaitez que la modulation se termine avant la fin de votre periode pour cet employe." />
                          </span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEmps.map(emp => (
                        <tr key={emp.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "10px 6px" }}>
                            <a href={`/rh/employe/${emp.id}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 500 }}>
                              {emp.prenom} {emp.nom.toUpperCase()}
                            </a>
                          </td>
                          <td style={{ padding: "10px 6px", color: "#666" }}>{empEquipe(emp)}</td>
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <Toggle value={true} onChange={() => {}} />
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <input type="number" defaultValue={0} style={{ ...INPUT, width: 50, textAlign: "center", padding: "4px 6px", fontSize: 12 }} />
                              <span style={{ fontSize: 11, color: "#999" }}>h</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              <input type="number" style={{ ...INPUT, width: 50, textAlign: "center", padding: "4px 6px", fontSize: 12 }} placeholder="" />
                              <span style={{ fontSize: 11, color: "#999" }}>h</span>
                            </div>
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <input type="date" defaultValue={modDebut} style={{ ...INPUT, width: 120, padding: "4px 6px", fontSize: 11 }} />
                              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 14 }}>x</button>
                            </div>
                          </td>
                          <td style={{ padding: "10px 6px", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                              <input type="date" defaultValue={modFin} style={{ ...INPUT, width: 120, padding: "4px 6px", fontSize: 11 }} />
                              <button type="button" style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: 14 }}>x</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })()}

        {/* Create button */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
          <button
            type="button"
            onClick={createPeriode}
            disabled={!modDebut || !modFin || (!modTpActif && !modPartielActif)}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: (!modTpActif && !modPartielActif) ? "#ddd6c8" : "#1a1a1a",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: (!modTpActif && !modPartielActif) ? "default" : "pointer",
            }}
          >
            Creer
          </button>
        </div>
      </>
    );
  };

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
          <button type="button" style={tabStyle("pointeuse")} onClick={() => setTab("pointeuse")}>Pointeuse</button>
          <button type="button" style={tabStyle("integrations")} onClick={() => setTab("integrations")}>Intégrations</button>
        </div>

        {/* Content */}
        {tab === "social" && renderSocial()}
        {tab === "planification" && renderPlanification()}
        {tab === "modulation" && renderModulation()}
        {tab === "pointeuse" && (
          <>
            <div style={CARD}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16, color: "#1a1a1a" }}>Configuration de la pointeuse</h2>
              <div style={ROW}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Activer la pointeuse</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Les employes peuvent pointer leurs heures d&apos;arrivee et de depart</div>
                </div>
                <Toggle value={(settings as Record<string, unknown>).pointeuse_enabled as boolean ?? false} onChange={v => updateField({ pointeuse_enabled: v } as Partial<Settings>)} />
              </div>
              <div style={ROW}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Pause automatique</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Deduire automatiquement la pause configuree du temps pointe</div>
                </div>
                <Toggle value={(settings as Record<string, unknown>).pointeuse_auto_pause as boolean ?? true} onChange={v => updateField({ pointeuse_auto_pause: v } as Partial<Settings>)} />
              </div>
              <div style={ROW}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Geolocalisation</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Verifier la position de l&apos;employe lors du pointage</div>
                </div>
                <Toggle value={(settings as Record<string, unknown>).pointeuse_geoloc as boolean ?? false} onChange={v => updateField({ pointeuse_geoloc: v } as Partial<Settings>)} />
              </div>
              <div style={{ ...ROW, borderBottom: "none" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Tolerance (minutes)</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Ecart accepte avant/apres l&apos;heure prevue du shift</div>
                </div>
                <input
                  type="number"
                  style={{ ...INPUT, width: 80, textAlign: "center" }}
                  value={(settings as Record<string, unknown>).pointeuse_tolerance_minutes as number ?? 5}
                  onChange={e => updateField({ pointeuse_tolerance_minutes: Number(e.target.value) } as Partial<Settings>)}
                  min={0} max={60}
                />
              </div>
            </div>

            <div style={CARD}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Methode de pointage</h2>
              <div style={ROW}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Code PIN</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>L&apos;employe saisit son code PIN a 4 chiffres pour pointer</div>
                </div>
                <Toggle value={true} onChange={() => {}} />
              </div>
              <div style={{ ...ROW, borderBottom: "none" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Application mobile</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>L&apos;employe pointe depuis l&apos;application mobile Combo</div>
                </div>
                <Toggle value={true} onChange={() => {}} />
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: Intégrations ═══ */}
        {tab === "integrations" && (
          <>
            <div style={CARD}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Système de caisse</h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Connectez votre logiciel de caisse pour importer automatiquement les données de vente (CA, couverts, tickets).</p>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { name: "Popina", desc: "Caisse enregistreuse iPad", status: settings.popina_location_id ? "connected" : "disconnected", logo: "🟠" },
                  { name: "Kezia", desc: "Logiciel de gestion", status: "disconnected", logo: "🔵" },
                  { name: "Autre", desc: "Import CSV / API personnalisée", status: "disconnected", logo: "⚙️" },
                ].map(sys => (
                  <div key={sys.name} style={{ padding: 16, borderRadius: 10, border: sys.status === "connected" ? "2px solid #2D6A4F" : "1px solid #ddd6c8", background: sys.status === "connected" ? "rgba(45,106,79,0.04)" : "#fff" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{sys.logo}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{sys.name}</div>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>{sys.desc}</div>
                    <span style={{
                      padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: sys.status === "connected" ? "rgba(45,106,79,0.1)" : "rgba(220,38,38,0.06)",
                      color: sys.status === "connected" ? "#2D6A4F" : "#DC2626",
                    }}>
                      {sys.status === "connected" ? "Connecté" : "Non connecté"}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {settings.popina_location_id && (
              <div style={{ ...CARD, marginTop: 16 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Configuration Popina</h2>
                <div style={ROW}>
                  <span style={{ fontSize: 14, color: "#1a1a1a" }}>Location ID</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#2D6A4F" }}>{String(settings.popina_location_id ?? "")}</span>
                </div>
              </div>
            )}

            <div style={{ ...CARD, marginTop: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Logiciel de paie</h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Connectez votre logiciel de paie pour exporter automatiquement les données RH.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { name: "Silae", desc: "Export des variables de paie", logo: "📊" },
                  { name: "Combo Pay", desc: "Gestion de la paie intégrée", logo: "💰" },
                  { name: "Autre", desc: "Export CSV personnalisé", logo: "📁" },
                ].map(sys => (
                  <div key={sys.name} style={{ padding: 16, borderRadius: 10, border: "1px solid #ddd6c8" }}>
                    <div style={{ fontSize: 24, marginBottom: 8 }}>{sys.logo}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{sys.name}</div>
                    <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>{sys.desc}</div>
                    <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(220,38,38,0.06)", color: "#DC2626" }}>
                      Non connecté
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...CARD, marginTop: 16 }}>
              <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>Météo</h2>
              <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>L&apos;API météo permet de croiser les données de vente avec les conditions météorologiques.</p>
              <div style={ROW}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>OpenWeather API</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>Prévisions et historique météo</div>
                </div>
                <span style={{ padding: "3px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: "rgba(45,106,79,0.1)", color: "#2D6A4F" }}>
                  Configuré
                </span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Modal: Equipes (popup centered) */}
      {showEquipesModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }}
          onClick={() => setShowEquipesModal(false)}
        >
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Plannings</h2>
              <button type="button" onClick={() => setShowEquipesModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <p style={{ fontSize: 12, color: "#999", lineHeight: 1.4, marginBottom: 12 }}>
              Vous pouvez avoir un ou plusieurs plannings par etablissement : cuisine, salle, etc. Les plannings etant independants ils sont publies separement.
            </p>
            <p style={{ fontSize: 12, color: "#1a1a1a", marginBottom: 16, fontWeight: 600 }}>
              Cet etablissement a {editEquipes.length} planning{editEquipes.length > 1 ? "s" : ""} :
            </p>

            {/* Existing equipes — editable + deletable */}
            {editEquipes.map((eq, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <input
                  style={{ ...INPUT, flex: 1 }}
                  value={eq}
                  onChange={e => {
                    const next = [...editEquipes];
                    next[idx] = e.target.value;
                    setEditEquipes(next);
                  }}
                  maxLength={40}
                />
                <span style={{ fontSize: 10, color: "#999", whiteSpace: "nowrap", minWidth: 30, textAlign: "right" }}>{eq.length}/40</span>
                <button
                  type="button"
                  onClick={() => {
                    if (editEquipes.length <= 1) { alert("Il faut au moins un planning."); return; }
                    if (!confirm(`Supprimer le planning "${eq}" ? Les postes associes seront aussi supprimes.`)) return;
                    setEditEquipes(prev => prev.filter((_, i) => i !== idx));
                  }}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 4, color: "#999", flexShrink: 0 }}
                  title="Supprimer"
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}

            {/* Add new */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
              <input
                style={{ ...INPUT, flex: 1 }}
                value={newEquipeName}
                onChange={e => setNewEquipeName(e.target.value)}
                placeholder="Nom du planning"
                maxLength={40}
                onKeyDown={e => {
                  if (e.key === "Enter" && newEquipeName.trim()) {
                    setEditEquipes(prev => [...prev, newEquipeName.trim()]);
                    setNewEquipeName("");
                  }
                }}
              />
              <button
                type="button"
                onClick={() => {
                  if (!newEquipeName.trim()) return;
                  setEditEquipes(prev => [...prev, newEquipeName.trim()]);
                  setNewEquipeName("");
                }}
                disabled={!newEquipeName.trim()}
                style={{
                  padding: "8px 14px", borderRadius: 6, border: "1px solid #ddd6c8",
                  background: "#fff", fontSize: 13, fontWeight: 600, cursor: newEquipeName.trim() ? "pointer" : "default",
                  color: newEquipeName.trim() ? "#1a1a1a" : "#ccc", whiteSpace: "nowrap",
                }}
              >
                + Ajouter
              </button>
            </div>

            {/* Save */}
            <div style={{ marginTop: 20, borderTop: "1px solid #f0ebe3", paddingTop: 16 }}>
              <button
                type="button"
                onClick={async () => {
                  if (!id) return;
                  const oldNames = dbEquipes.map(e => e.nom);
                  const newNames = editEquipes.filter(n => n.trim());

                  try {
                    // 1. Delete removed equipes from DB + their postes
                    const removed = oldNames.filter(n => !newNames.includes(n));
                    for (const eqName of removed) {
                      await supabase.from("equipes").delete().eq("etablissement_id", id).eq("nom", eqName);
                      await supabase.from("postes").delete().eq("etablissement_id", id).eq("equipe", eqName);
                    }

                    // 2. Add new equipes to DB
                    const added = newNames.filter(n => !oldNames.includes(n));
                    for (const nom of added) {
                      const { error } = await supabase.from("equipes").insert({ etablissement_id: id, nom, actif: true });
                      if (error) {
                        console.error("Erreur creation equipe:", nom, error.message);
                        // Try upsert if unique conflict
                        if (error.code === "23505") continue;
                        alert(`Erreur lors de la creation de l'equipe "${nom}": ${error.message}`);
                      }
                    }

                    // 3. Handle renames: match old→new by position for items that changed
                    for (let i = 0; i < Math.min(oldNames.length, newNames.length); i++) {
                      if (oldNames[i] !== newNames[i] && !removed.includes(oldNames[i]) && !added.includes(newNames[i])) {
                        // Rename equipe in DB
                        await supabase.from("equipes").update({ nom: newNames[i] }).eq("etablissement_id", id).eq("nom", oldNames[i]);
                        // Rename postes equipe field
                        await supabase.from("postes").update({ equipe: newNames[i] }).eq("etablissement_id", id).eq("equipe", oldNames[i]);
                      }
                    }

                    // 4. Refresh equipes + postes from DB
                    const [eqRefresh, postesRefresh] = await Promise.all([
                      supabase.from("equipes").select("id, nom, actif").eq("etablissement_id", id).eq("actif", true).order("nom"),
                      supabase.from("postes").select("id, nom, equipe, couleur, emoji, actif").eq("etablissement_id", id).order("equipe").order("nom"),
                    ]);
                    if (eqRefresh.data) {
                      setDbEquipes(eqRefresh.data as Equipe[]);
                      setEditEquipes((eqRefresh.data as Equipe[]).map(e => e.nom));
                    }
                    if (postesRefresh.data) setPostes(postesRefresh.data as Poste[]);
                  } catch (err) {
                    console.error("Erreur sauvegarde equipes:", err);
                    alert("Erreur lors de la sauvegarde. Verifiez que la table equipes existe en base.");
                  }

                  setShowEquipesModal(false);
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }}
                style={{
                  width: "100%", padding: "10px", borderRadius: 8, border: "1px solid #ddd6c8",
                  background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
                }}
              >
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
