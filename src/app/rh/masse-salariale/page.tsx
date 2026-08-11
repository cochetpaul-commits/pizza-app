"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { PilotageSwipeWrapper } from "@/components/layout/PilotageSwipeWrapper";
import { useBottomBarActions } from "@/lib/BottomBarContext";
import { useProfile } from "@/lib/ProfileContext";
import { SimulationContent } from "@/components/rh/SimulationContent";
import { SimulateurRentabiliteMS } from "@/components/rh/SimulateurRentabiliteMS";
import { fetchApi } from "@/lib/fetchApi";

// ── Types ────────────────────────────────────────────────────────────────

type ComboPresence = {
  id: string;
  combo_nom: string;
  equipe: string | null;
  employe_id: string | null;
  matched: boolean;
  heures_planifiees: number;
  heures_travaillees: number;
  heures_contrat: number;
  nb_repas: number;
  nb_jours_travailles: number;
  ecart_total: number;
  periode_debut: string;
  periode_fin: string;
};

type ContratInfo = {
  employe_id: string;
  prenom: string;
  nom: string;
  type: string;
  heures_semaine: number;
  remuneration: number;
  emploi: string;
  equipes_access: string[];
};

type PeriodMode = "month" | "week";
type PeriodOption = { value: string; label: string; from: string; to: string };

// ── Helpers ──────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekKey(d: Date): string {
  const t = new Date(d);
  t.setDate(t.getDate() + 4 - (t.getDay() || 7));
  const yearStart = new Date(t.getFullYear(), 0, 1);
  const w = Math.ceil((((t.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${t.getFullYear()}-W${String(w).padStart(2, "0")}`;
}

function getWeekBounds(d: Date): { from: string; to: string; label: string } {
  const dow = d.getDay() || 7;
  const mon = new Date(d); mon.setDate(d.getDate() - dow + 1); mon.setHours(0,0,0,0);
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const mDay = mon.getDate();
  const sDay = sun.getDate();
  const mMonth = mon.toLocaleDateString("fr-FR", { month: "short" });
  const sMonth = sun.toLocaleDateString("fr-FR", { month: "short" });
  const label = mon.getMonth() === sun.getMonth()
    ? `Sem. ${mDay}\u2013${sDay} ${sMonth} ${sun.getFullYear()}`
    : `Sem. ${mDay} ${mMonth} \u2013 ${sDay} ${sMonth} ${sun.getFullYear()}`;
  return { from: toISO(mon), to: toISO(sun), label };
}

// ── Constants ────────────────────────────────────────────────────────────

const ACCENT = "#D4775A";
const GREEN = "#4a6741";
const OSWALD = "var(--font-oswald), Oswald, sans-serif";
const CARD = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 12 } as const;
const KPI = { fontSize: 28, fontWeight: 700 as const, color: "#1a1a1a", fontFamily: OSWALD };
const LABEL = { fontSize: 10, fontWeight: 700 as const, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 6 };

const fmt = (v: number) => Math.round(v).toLocaleString("fr-FR");
const fmtDec = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const CHARGES_RATE = 0.42;
const TEAM_COLORS: Record<string, string> = { Cuisine: "#D97706", Salle: "#5e8278", Bar: "#8a6b3e", Autre: "#b0a894" };

function getMonthOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const y = d.getFullYear(); const m = d.getMonth();
    const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
    const last = new Date(y, m + 1, 0);
    const to = `${y}-${String(m + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
    const label = d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" }).replace(/^\w/, c => c.toUpperCase());
    opts.push({ value: `${y}-${String(m + 1).padStart(2, "0")}`, label, from, to });
  }
  return opts;
}

function getWeekOptions(): PeriodOption[] {
  const opts: PeriodOption[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now); d.setDate(now.getDate() - i * 7);
    const { from, to, label } = getWeekBounds(d);
    const value = getWeekKey(d);
    if (!opts.find(o => o.value === value)) opts.push({ value, label, from, to });
  }
  return opts;
}

// ── Component ────────────────────────────────────────────────────────────

export default function MasseSalarialePage() {
  const { current: etab } = useEtablissement();
  const { can } = useProfile();
  const showMoney = can("performances.show_money");
  const [msTab, setMsTab] = useState<"reelle" | "tns" | "simulateur" | "rentabilite">("reelle");
  const [presences, setPresences] = useState<ComboPresence[]>([]);
  const [contrats, setContrats] = useState<ContratInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [importMsg, setImportMsg] = useState("");
  const [caHt, setCaHt] = useState<number | null>(null);
  const [couverts, setCouverts] = useState<number | null>(null);

  const [periodMode, setPeriodMode] = useState<PeriodMode>("week");
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const weekOptions = useMemo(() => getWeekOptions(), []);
  const options = periodMode === "month" ? monthOptions : weekOptions;
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value ?? "");
  const [selectedWeek, setSelectedWeek] = useState(weekOptions[0]?.value ?? "");
  const selectedValue = periodMode === "month" ? selectedMonth : selectedWeek;
  const selected = options.find(o => o.value === selectedValue);
  const currentIdx = options.findIndex(o => o.value === selectedValue);
  const etabId = etab?.id;
  const selectedFrom = selected?.from;
  const selectedTo = selected?.to;

  const loadingRef = useRef(false);

  const loadAllData = useCallback(async (eId: string, from: string, to: string) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      const [presData, contratData] = await Promise.all([
        supabase.from("combo_presences")
          .select("id, combo_nom, equipe, employe_id, matched, heures_planifiees, heures_travaillees, heures_contrat, nb_repas, nb_jours_travailles, ecart_total, periode_debut, periode_fin")
          .eq("etablissement_id", eId).gte("periode_debut", from).lte("periode_fin", to).order("combo_nom"),
        supabase.from("contrats")
          .select("employe_id, type, heures_semaine, remuneration, emploi, employes!inner(prenom, nom, equipes_access, actif, etablissement_id)")
          .eq("actif", true).eq("employes.actif", true).eq("employes.etablissement_id", eId),
        fetch(`/api/ventes/stats?etablissement_id=${eId}&from=${from}&to=${to}`)
          .then(r => r.json()).then(json => {
            const s = json.stats;
            setCaHt(s?.ca_ht ?? null);
            setCouverts(s?.couverts ?? null);
          }).catch(() => { setCaHt(null); setCouverts(null); }),
      ]);
      setPresences((presData.data ?? []) as ComboPresence[]);
      const ct: ContratInfo[] = [];
      for (const c of (contratData.data ?? []) as Record<string, unknown>[]) {
        const emp = c.employes as Record<string, unknown>;
        ct.push({
          employe_id: c.employe_id as string,
          prenom: emp.prenom as string, nom: emp.nom as string,
          type: c.type as string, heures_semaine: Number(c.heures_semaine),
          remuneration: Number(c.remuneration), emploi: c.emploi as string,
          equipes_access: (emp.equipes_access as string[]) ?? [],
        });
      }
      setContrats(ct);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (etabId && selectedFrom && selectedTo) loadAllData(etabId, selectedFrom, selectedTo);
  }, [etabId, selectedFrom, selectedTo, loadAllData]);

  // Auto-sync Combo in background
  const autoSyncDone = useRef(false);
  useEffect(() => {
    if (autoSyncDone.current || !selectedFrom || !selectedTo) return;
    autoSyncDone.current = true;
    const lastSync = localStorage.getItem("combo_last_sync");
    if (lastSync && Number(lastSync) > Date.now() - 6 * 3600 * 1000) return;
    fetch("/api/rh/combo-presences-sync", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from: selectedFrom, to: selectedTo }),
    }).then(r => r.json()).then(d => {
      if (d.ok) {
        localStorage.setItem("combo_last_sync", String(Date.now()));
        if (etabId && selectedFrom && selectedTo) loadAllData(etabId, selectedFrom, selectedTo);
      }
    }).catch(() => {});
  }, [selectedFrom, selectedTo, etabId, loadAllData]);

  const setSelectedValue = useCallback((v: string) => {
    if (periodMode === "month") setSelectedMonth(v); else setSelectedWeek(v);
  }, [periodMode]);
  const goPrev = useCallback(() => { if (currentIdx < options.length - 1) setSelectedValue(options[currentIdx + 1].value); }, [currentIdx, options, setSelectedValue]);
  const goNext = useCallback(() => { if (currentIdx > 0) setSelectedValue(options[currentIdx - 1].value); }, [currentIdx, options, setSelectedValue]);

  // ── Computed: merge presences + contrats ──
  const employees = useMemo(() => {
    // Aggregate presences by name
    const presMap = new Map<string, { hPlan: number; hTrav: number; hContrat: number; repas: number; jours: number; ecart: number; equipe: string | null; matched: boolean; employeId: string | null }>();
    for (const p of presences) {
      const key = p.combo_nom;
      const prev = presMap.get(key);
      if (prev) {
        prev.hPlan += p.heures_planifiees; prev.hTrav += p.heures_travaillees;
        prev.repas += p.nb_repas; prev.jours += p.nb_jours_travailles; prev.ecart += p.ecart_total;
      } else {
        presMap.set(key, {
          hPlan: p.heures_planifiees, hTrav: p.heures_travaillees, hContrat: p.heures_contrat,
          repas: p.nb_repas, jours: p.nb_jours_travailles, ecart: p.ecart_total,
          equipe: p.equipe, matched: p.matched, employeId: p.employe_id,
        });
      }
    }
    // Match with contrats for real salary
    const result: {
      nom: string; equipe: string; type: string; emploi: string;
      hContrat: number; hTrav: number; ecart: number; hs: number;
      brut: number; coutCharge: number; coutHS: number;
      repas: number; jours: number;
    }[] = [];

    for (const [nom, pres] of presMap) {
      const contrat = contrats.find(c => {
        const comboName = `${c.prenom} ${c.nom}`.trim();
        return comboName.toLowerCase() === nom.toLowerCase()
          || `${c.prenom} ${c.nom}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      });
      const hContrat = contrat?.heures_semaine ?? pres.hContrat ?? 0;
      const brut = contrat?.remuneration ?? 0;
      const type = contrat?.type ?? "?";
      const emploi = contrat?.emploi ?? "";
      const equipe = pres.equipe ?? contrat?.equipes_access?.[0] ?? "Autre";
      const hs = Math.max(0, pres.ecart);
      // Coût HS : taux horaire × 1.1 (majoration 10%) × heures sup
      const tauxH = hContrat > 0 && brut > 0 ? brut / (hContrat * 52 / 12) : 0;
      const coutHS = hs * tauxH * 1.1 * (1 + CHARGES_RATE);
      const coutCharge = brut * (1 + CHARGES_RATE);

      result.push({
        nom, equipe, type, emploi,
        hContrat, hTrav: pres.hTrav, ecart: pres.ecart, hs,
        brut, coutCharge, coutHS,
        repas: pres.repas, jours: pres.jours,
      });
    }
    return result.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  }, [presences, contrats]);

  // ── Totals ──
  const totals = useMemo(() => {
    const t = { hTrav: 0, hContrat: 0, hs: 0, coutHS: 0, msChargee: 0, brut: 0, repas: 0, jours: 0 };
    for (const e of employees) {
      t.hTrav += e.hTrav; t.hContrat += e.hContrat; t.hs += e.hs;
      t.coutHS += e.coutHS; t.msChargee += e.coutCharge; t.brut += e.brut;
      t.repas += e.repas; t.jours += e.jours;
    }
    return t;
  }, [employees]);

  const ratioCA = caHt && caHt > 0 ? (totals.msChargee / caHt) * 100 : null;
  const productivite = totals.hTrav > 0 && caHt ? caHt / totals.hTrav : null;
  const coutCouvert = couverts && couverts > 0 ? totals.msChargee / couverts : null;
  const objRatioMS = 35; // target

  // ── Teams ──
  const teams = useMemo(() => {
    const map = new Map<string, { label: string; hTrav: number; ms: number; hs: number; count: number }>();
    for (const e of employees) {
      const key = e.equipe;
      const prev = map.get(key);
      if (prev) { prev.hTrav += e.hTrav; prev.ms += e.coutCharge; prev.hs += e.hs; prev.count++; }
      else { map.set(key, { label: key, hTrav: e.hTrav, ms: e.coutCharge, hs: e.hs, count: 1 }); }
    }
    return Array.from(map.values()).sort((a, b) => b.ms - a.ms);
  }, [employees]);

  // ── Handlers ──
  const handleImport = useCallback(async (file: File) => {
    if (!etab) return;
    const fd = new FormData(); fd.append("file", file); fd.append("mode", "commit");
    try {
      const auth = localStorage.getItem(Object.keys(localStorage).find(k => k.includes("auth-token")) ?? "");
      let token = "";
      if (auth) { try { const p = JSON.parse(auth); token = p?.access_token ?? p?.currentSession?.access_token ?? ""; } catch { /* */ } }
      const res = await fetchApi("/api/rh/combo-import", {
        method: "POST",
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-etablissement-id": etab.id },
        body: fd,
      });
      const json = await res.json();
      if (json.ok) {
        setImportMsg(`${json.nb_employes} employes importes`);
        if (etabId && selectedFrom && selectedTo) await loadAllData(etabId, selectedFrom, selectedTo);
      } else { setImportMsg("Erreur : " + (json.error ?? "inconnue")); }
    } catch (e) { setImportMsg("Erreur : " + String(e)); }
  }, [etab, etabId, selectedFrom, selectedTo, loadAllData]);

  const [syncing, setSyncing] = useState(false);
  const handleComboSync = useCallback(async () => {
    if (!selected || !etabId) return;
    setSyncing(true);
    try {
      const res = await fetch("/api/rh/combo-presences-sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: selected.from, to: selected.to }),
      });
      const d = await res.json();
      if (d.ok) { setImportMsg(`Sync: ${d.inserted} employes`); await loadAllData(etabId, selected.from, selected.to); }
      else { setImportMsg("Erreur: " + (d.error ?? "inconnue")); }
    } catch (e) { setImportMsg("Erreur: " + String(e)); }
    setSyncing(false);
  }, [selected, etabId, loadAllData]);

  useBottomBarActions(() => [{
    key: "import", label: "Import PDF", accent: ACCENT,
    onClick: () => {}, fileAccept: ".pdf",
    onFileChange: (f: File) => handleImport(f),
    icon: <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  }], [handleImport]);

  const etabColor = etab?.couleur ?? ACCENT;
  const navRange = { from: selected?.from ?? "", to: selected?.to ?? "" };

  if (!etab) {
    return <RequireRole permission="performances.pilotage"><div style={{ maxWidth: 900, margin: "0 auto", padding: "40px 16px", textAlign: "center", color: "#999" }}>Selectionnez un etablissement.</div></RequireRole>;
  }

  return (
    <RequireRole permission="performances.pilotage">
      <PilotageSwipeWrapper accent={etabColor} dateFrom={navRange.from} dateTo={navRange.to}>
      <div className={showMoney ? undefined : "no-money"} style={{ maxWidth: 900, margin: "0 auto", padding: "20px 16px 100px" }}>
        {!showMoney && <style>{`.no-money [data-money] { filter: blur(8px); pointer-events: none; user-select: none; }`}</style>}

        {/* Tabs */}
        <div style={{ display: "flex", gap: 4, padding: 4, background: "#f0ebe2", borderRadius: 12, marginBottom: 18, border: "1px solid #e8e0d0" }}>
          {([
            { key: "reelle" as const, label: "Masse salariale" },
            { key: "tns" as const, label: "Statuts TNS" },
            { key: "simulateur" as const, label: "Simulateur" },
            { key: "rentabilite" as const, label: "Rentabilite MS" },
          ]).map(t => (
            <button key={t.key} type="button" onClick={() => setMsTab(t.key)} style={{
              flex: 1, padding: "8px 10px", borderRadius: 10, border: "none",
              background: msTab === t.key ? "#fff" : "transparent",
              color: msTab === t.key ? "#1a1a1a" : "#777",
              fontSize: 12, fontWeight: 700, cursor: msTab === t.key ? "default" : "pointer",
              boxShadow: msTab === t.key ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
              whiteSpace: "nowrap",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        {msTab === "rentabilite" ? (
          <SimulateurRentabiliteMS />
        ) : msTab !== "reelle" ? (
          <SimulationContent activeTab={msTab} />
        ) : (<>

        {/* Period selector */}
        <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 10 }}>
          <div style={{ display: "inline-flex", gap: 4, padding: 3, background: "#f0ebe2", borderRadius: 10, border: "1px solid #e8e0d0" }}>
            {(["week", "month"] as const).map(m => (
              <button key={m} type="button" onClick={() => setPeriodMode(m)} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                background: periodMode === m ? "#fff" : "transparent",
                color: periodMode === m ? ACCENT : "#777",
                fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em",
                boxShadow: periodMode === m ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
              }}>
                {m === "month" ? "Mois" : "Semaine"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", maxWidth: 420 }}>
            <button type="button" onClick={goPrev} disabled={currentIdx >= options.length - 1} style={{
              width: 36, height: 36, borderRadius: 10, border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: currentIdx >= options.length - 1 ? "#f0ebe3" : ACCENT + "15", color: currentIdx >= options.length - 1 ? "#ccc" : ACCENT,
              fontSize: 14, fontWeight: 700, cursor: currentIdx >= options.length - 1 ? "not-allowed" : "pointer",
            }}>{"\u2190"}</button>
            <select value={selectedValue} onChange={e => setSelectedValue(e.target.value)} style={{
              height: 36, borderRadius: 10, border: "1px solid #ddd6c8", padding: "0 14px",
              fontSize: 13, fontWeight: 600, background: "#fff", color: "#1a1a1a", cursor: "pointer", flex: 1, textAlign: "center",
            }}>
              {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button type="button" onClick={goNext} disabled={currentIdx <= 0} style={{
              width: 36, height: 36, borderRadius: 10, border: "none", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              background: currentIdx <= 0 ? "#f0ebe3" : ACCENT + "15", color: currentIdx <= 0 ? "#ccc" : ACCENT,
              fontSize: 14, fontWeight: 700, cursor: currentIdx <= 0 ? "not-allowed" : "pointer",
            }}>{"\u2192"}</button>
          </div>
        </div>

        {/* Sync */}
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <button type="button" onClick={handleComboSync} disabled={syncing} style={{
            padding: "6px 16px", borderRadius: 10, border: `1.5px solid ${ACCENT}`,
            background: syncing ? "#f0ebe3" : "#fff", color: ACCENT,
            fontSize: 11, fontWeight: 700, cursor: syncing ? "wait" : "pointer", opacity: syncing ? 0.6 : 1,
          }}>
            {syncing ? "Sync..." : "Sync Combo"}
          </button>
        </div>

        {importMsg && <div style={{ fontSize: 11, color: ACCENT, marginBottom: 10, textAlign: "center" }}>{importMsg}</div>}

        {/* ═══ HERO: Ratio MS / CA ═══ */}
        <div style={{
          ...CARD, border: "none", color: "#fff", marginBottom: 14,
          background: `linear-gradient(135deg, ${etabColor} 0%, ${etabColor}dd 100%)`,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ ...LABEL, color: "rgba(255,255,255,0.7)" }}>Ratio masse salariale / CA HT</div>
              <div style={{ fontSize: 42, fontWeight: 700, fontFamily: OSWALD, color: "#fff" }}>
                {ratioCA ? `${ratioCA.toFixed(1)}%` : "\u2014"}
              </div>
              <div style={{ height: 6, width: 180, background: "rgba(255,255,255,0.2)", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${Math.min(100, (ratioCA ?? 0) / 60 * 100)}%`, background: ratioCA && ratioCA <= objRatioMS ? "#a5d6a7" : "#fca5a5", borderRadius: 3 }} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>
                Objectif {"\u2264"} {objRatioMS}% {"\u00B7"} {ratioCA && ratioCA <= objRatioMS ? "OK" : ratioCA && ratioCA <= 45 ? "Vigilance" : ratioCA ? "Alerte" : ""}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div data-money style={{ fontSize: 11, color: "rgba(255,255,255,0.8)" }}>MS chargee <span style={{ fontWeight: 700, color: "#fff", fontSize: 14 }}>{fmt(totals.msChargee)}{"\u20AC"}</span></div>
              <div data-money style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 4 }}>CA HT <span style={{ fontWeight: 700, color: "#fff" }}>{caHt ? `${fmt(caHt)}\u20AC` : "\u2014"}</span></div>
              {caHt && ratioCA && ratioCA > objRatioMS && (
                <div data-money style={{ fontSize: 11, color: "#fca5a5", marginTop: 6, fontWeight: 600 }}>
                  CA necessaire : {fmt(Math.round(totals.msChargee / (objRatioMS / 100)))}{"\u20AC"} HT
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ═══ KPIs compacts ═══ */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 14 }}>
          <div style={CARD}>
            <div style={LABEL}>MS chargee</div>
            <div data-money style={KPI}>{fmt(totals.msChargee)}{"\u20AC"}</div>
            <div data-money style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Brut {fmt(totals.brut)}{"\u20AC"}</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Heures sup</div>
            <div style={{ ...KPI, color: totals.hs > 0 ? "#DC2626" : "#1a1a1a" }}>+{fmtDec(totals.hs)}h</div>
            <div data-money style={{ fontSize: 10, color: "#DC2626", marginTop: 2, fontWeight: 600 }}>~{fmt(Math.round(totals.coutHS))}{"\u20AC"}</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Productivite</div>
            <div data-money style={KPI}>{productivite ? `${fmt(productivite)}\u20AC` : "\u2014"}</div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>CA HT / heure</div>
          </div>
          <div style={CARD}>
            <div style={LABEL}>Cout / couvert</div>
            <div data-money style={KPI}>{coutCouvert ? `${fmtDec(coutCouvert)}\u20AC` : "\u2014"}</div>
            <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>{couverts ?? 0} couverts</div>
          </div>
        </div>

        {/* ═══ Par equipe ═══ */}
        {teams.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: teams.length === 1 ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 14 }}>
            {teams.map(t => {
              const color = TEAM_COLORS[t.label] ?? "#999";
              return (
                <div key={t.label} style={{ ...CARD, borderLeft: `4px solid ${color}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color, fontFamily: OSWALD, textTransform: "uppercase" }}>{t.label}</span>
                    <span style={{ fontSize: 11, color: "#999" }}>{t.count} emp.</span>
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <div>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Heures</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: OSWALD }}>{fmtDec(t.hTrav)}h</div>
                    </div>
                    <div data-money>
                      <div style={{ fontSize: 10, color: "#999", fontWeight: 600 }}>Cout</div>
                      <div style={{ fontSize: 18, fontWeight: 700, fontFamily: OSWALD }}>{fmt(t.ms)}{"\u20AC"}</div>
                    </div>
                    {t.hs > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: "#DC2626", fontWeight: 600 }}>HS</div>
                        <div style={{ fontSize: 18, fontWeight: 700, fontFamily: OSWALD, color: "#DC2626" }}>+{fmtDec(t.hs)}h</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ═══ Tableau employes ═══ */}
        <div style={CARD}>
          <div style={{ ...LABEL, marginBottom: 12 }}>Detail par employe</div>
          {loading ? (
            <div style={{ textAlign: "center", padding: 40, color: "#999", fontSize: 13 }}>Chargement...</div>
          ) : employees.length === 0 ? (
            <div style={{ textAlign: "center", padding: 40, color: "#bbb", fontSize: 13 }}>
              Aucune donnee Combo pour cette periode.<br />Importez une feuille de presence ou lancez un sync.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {employees.map((e) => {
                const maxH = Math.max(e.hContrat, e.hTrav, 1);
                const pctContrat = e.hContrat / maxH * 100;
                const pctTrav = e.hTrav / maxH * 100;
                const teamColor = TEAM_COLORS[e.equipe] ?? "#999";
                return (
                  <div key={e.nom} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #f0ebe3", background: "#fff" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{e.nom}</span>
                        <span style={{ fontSize: 11, color: teamColor, marginLeft: 8, fontWeight: 600 }}>{e.equipe}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#999", padding: "2px 6px", borderRadius: 4, background: "#f5f0e8" }}>{e.type} {e.hContrat}h</span>
                        {e.hs > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#DC2626", padding: "2px 6px", borderRadius: 4, background: "#DC262610" }}>+{fmtDec(e.hs)}h</span>}
                      </div>
                    </div>
                    {/* Bar: contrat vs travaille */}
                    <div style={{ position: "relative", height: 8, background: "#f0ebe3", borderRadius: 4, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pctContrat}%`, background: `${teamColor}40`, borderRadius: 4 }} />
                      <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${pctTrav}%`, background: teamColor, borderRadius: 4, opacity: 0.8 }} />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#999" }}>
                      <span>Contrat {fmtDec(e.hContrat)}h {"\u2192"} Travaille {fmtDec(e.hTrav)}h</span>
                      <span data-money style={{ fontWeight: 600, color: e.hs > 0 ? "#DC2626" : GREEN }}>
                        {e.hs > 0 ? `~${fmt(Math.round(e.coutHS))}\u20AC HS` : "\u2714"}
                      </span>
                    </div>
                  </div>
                );
              })}
              {/* Total */}
              <div style={{ padding: "12px 14px", borderRadius: 10, background: "#f9f6f0", border: "1px solid #e8e0d0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>Total {"\u00B7"} {employees.length} employes</span>
                  <div style={{ display: "flex", gap: 12, fontSize: 12 }}>
                    <span><strong>{fmtDec(totals.hTrav)}h</strong> trav.</span>
                    {totals.hs > 0 && <span style={{ color: "#DC2626", fontWeight: 700 }}>+{fmtDec(totals.hs)}h sup.</span>}
                    <span data-money style={{ fontWeight: 700 }}>{fmt(totals.msChargee)}{"\u20AC"}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        </>)}
      </div>
      </PilotageSwipeWrapper>
    </RequireRole>
  );
}
