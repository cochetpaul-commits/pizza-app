"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import {
  calculerBilanSemaine,
  type ShiftInput,
  type ContratInput,
  type BilanSemaine,
} from "@/hooks/useConventionLegale";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  actif: boolean;
  equipes_access: string[];
  contrats: {
    type: string;
    heures_semaine: number;
    actif: boolean;
  }[];
};

type Poste = {
  id: string;
  equipe: string;
  nom: string;
  couleur: string;
  emoji: string | null;
};

type Shift = {
  id: string;
  employe_id: string;
  poste_id: string | null;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_minutes: number;
  note: string | null;
  statut: string;
};

type Absence = {
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string;
};

type EquipeFilter = string;

/* ── Helpers ───────────────────────────────────────────────────── */

const DAY_NAMES = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const DAY_NAMES_FULL = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function shiftDuration(s: Shift): number {
  let dur = timeToMin(s.heure_fin) - timeToMin(s.heure_debut);
  if (dur < 0) dur += 24 * 60;
  return (dur - (s.pause_minutes ?? 0)) / 60;
}

function fmtH(t: string): string {
  return t.slice(0, 5);
}

function shiftsOverlap(a: { heure_debut: string; heure_fin: string }, b: { heure_debut: string; heure_fin: string }): boolean {
  const aStart = timeToMin(a.heure_debut);
  let aEnd = timeToMin(a.heure_fin);
  const bStart = timeToMin(b.heure_debut);
  let bEnd = timeToMin(b.heure_fin);
  if (aEnd <= aStart) aEnd += 1440;
  if (bEnd <= bStart) bEnd += 1440;
  return aStart < bEnd && bStart < aEnd;
}

const ABSENCE_LABELS: Record<string, string> = {
  conge_paye: "CP",
  rtt: "RTT",
  maladie: "Maladie",
  accident_travail: "AT",
  maternite: "Maternite",
  sans_solde: "Abs.",
  formation: "Form.",
  repos_compensateur: "RC",
};

/* ── Component ─────────────────────────────────────────────────── */

export default function PlanningPage() {
  const { current: etab } = useEtablissement();
  const { can } = useProfile();
  const canWrite = can("planning.edit");

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [equipeFilter, setEquipeFilter] = useState<EquipeFilter>("tous");
  const [equipeNames, setEquipeNames] = useState<string[]>([]);

  // Track mousedown on shift to prevent cell click from opening create modal
  const shiftMouseDown = useRef(false);

  // ── Shift modal ──
  const [showModal, setShowModal] = useState(false);
  const [editShiftId, setEditShiftId] = useState<string | null>(null);
  const [mEmployeId, setMEmployeId] = useState("");
  const [mPosteId, setMPosteId] = useState("");
  const [mDate, setMDate] = useState("");
  const [mDebut, setMDebut] = useState("09:00");
  const [mFin, setMFin] = useState("15:00");
  const [mPause, setMPause] = useState(30);
  const [etabPauseDefaut, setEtabPauseDefaut] = useState(30);
  const [etabPauseAuto, setEtabPauseAuto] = useState(true);
  const [etabDureeMinPause, setEtabDureeMinPause] = useState(180); // minutes
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [etabReposCompActif, setEtabReposCompActif] = useState(false);
  const [mNote, setMNote] = useState("");
  const [saving, setSaving] = useState(false);

  // ── Week dates ──
  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
  [weekStart]);

  const weekISOs = useMemo(() => weekDates.map(toISO), [weekDates]);

  /* ── Load data ── */
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      const mondayISO = toISO(weekStart);
      const sundayISO = toISO(addDays(weekStart, 6));

      const [empRes, postesRes, shiftsRes, absRes, etabSettingsRes, equipesRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, initiales, actif, equipes_access, contrats(type, heures_semaine, actif)")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("nom"),
        supabase
          .from("postes")
          .select("id, equipe, nom, couleur, emoji")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("equipe")
          .order("nom"),
        supabase
          .from("shifts")
          .select("id, employe_id, poste_id, date, heure_debut, heure_fin, pause_minutes, note, statut")
          .eq("etablissement_id", etab.id)
          .gte("date", mondayISO)
          .lte("date", sundayISO),
        supabase
          .from("absences")
          .select("employe_id, type, date_debut, date_fin")
          .eq("etablissement_id", etab.id)
          .lte("date_debut", sundayISO)
          .gte("date_fin", mondayISO),
        supabase
          .from("etablissements")
          .select("pause_defaut_minutes, pause_auto_creation, duree_min_shift_pause, repos_compensateurs_actif")
          .eq("id", etab.id)
          .single(),
        supabase
          .from("equipes")
          .select("nom")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("nom"),
      ]);

      if (cancelled) return;
      // Load etab preferences
      if (etabSettingsRes.data) {
        const es = etabSettingsRes.data;
        setEtabPauseDefaut(es.pause_defaut_minutes ?? 30);
        setEtabPauseAuto(es.pause_auto_creation ?? true);
        // Parse interval "HH:MM:SS" or "X hours" to minutes
        const dur = String(es.duree_min_shift_pause ?? "03:00:00");
        const parts = dur.split(":");
        if (parts.length >= 2) setEtabDureeMinPause(Number(parts[0]) * 60 + Number(parts[1]));
        setEtabReposCompActif(es.repos_compensateurs_actif ?? false);
      }
      setEmployes(empRes.data ?? []);
      setPostes(postesRes.data ?? []);
      setShifts(shiftsRes.data ?? []);
      setAbsences((absRes.data ?? []) as Absence[]);
      // Load equipe names for filters
      const eqNames = (equipesRes.data ?? []).map((e: { nom: string }) => e.nom);
      setEquipeNames(eqNames.length > 0 ? eqNames : [...new Set((postesRes.data ?? []).map((p: { equipe: string }) => p.equipe))].sort());
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [etab, weekStart]);

  /* ── Filtered employees ── */
  const filteredEmployes = useMemo(() =>
    employes.filter((e) => {
      if (equipeFilter === "tous") return true;
      const access = e.equipes_access ?? [];
      return access.length === 0 || access.includes(equipeFilter);
    }),
  [employes, equipeFilter]);

  /* ── Postes map ── */
  const posteMap = useMemo(() => {
    const m = new Map<string, Poste>();
    postes.forEach((p) => m.set(p.id, p));
    return m;
  }, [postes]);

  /* ── Shifts by cell ── */
  const shiftsByCell = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts) {
      const key = `${s.employe_id}:${s.date}`;
      const arr = m.get(key) ?? [];
      arr.push(s);
      m.set(key, arr);
    }
    return m;
  }, [shifts]);

  /* ── Absences by cell (employe:date → type) ── */
  const absenceByCell = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of absences) {
      // Expand date range to individual days within the visible week
      const start = new Date(a.date_debut + "T00:00:00");
      const end = new Date(a.date_fin + "T00:00:00");
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = toISO(d);
        if (weekISOs.includes(iso)) {
          m.set(`${a.employe_id}:${iso}`, a.type);
        }
      }
    }
    return m;
  }, [absences, weekISOs]);

  /* ── Bilan per employee (TNS exclus) ── */
  const bilans = useMemo(() => {
    const map = new Map<string, BilanSemaine>();
    for (const emp of filteredEmployes) {
      const contrat = emp.contrats?.find((c) => c.actif);
      if (!contrat || contrat.type === "TNS") continue;

      const empShifts: ShiftInput[] = shifts
        .filter((s) => s.employe_id === emp.id)
        .map((s) => ({
          date: s.date,
          heure_debut: s.heure_debut,
          heure_fin: s.heure_fin,
          pause_minutes: s.pause_minutes,
        }));

      if (empShifts.length === 0) continue;

      const ci: ContratInput = {
        type: contrat.type,
        heures_semaine: contrat.heures_semaine,
        convention: ((etab as { convention?: string })?.convention === "RAPIDE_1501" ? "RAPIDE_1501" : "HCR_1979"),
      };
      map.set(emp.id, calculerBilanSemaine(empShifts, ci, emp.id));
    }
    return map;
    // etabReposCompActif included for future repos compensateur integration in bilans
  }, [filteredEmployes, shifts, etab]);

  /* ── Week navigation ── */
  const goWeek = (delta: number) => setWeekStart((w) => addDays(w, delta * 7));
  const goToday = () => setWeekStart(getMonday(new Date()));

  const weekLabel = useMemo(() => {
    const s = weekDates[0];
    const e = weekDates[6];
    const fmt = (d: Date) => d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
    return `${fmt(s)} — ${fmt(e)}`;
  }, [weekDates]);

  /* ── Modal: open for create ── */
  const openCreateShift = (employeId: string, date: string) => {
    setEditShiftId(null);
    setMEmployeId(employeId);
    setMDate(date);
    setMPosteId(postes[0]?.id ?? "");
    setMDebut("09:00");
    setMFin("15:00");
    // Use establishment pause settings: auto-add pause if shift duration >= min threshold
    const shiftDur = (timeToMin("15:00") - timeToMin("09:00")); // 360 min = 6h
    const shouldAddPause = etabPauseAuto && shiftDur >= etabDureeMinPause;
    setMPause(shouldAddPause ? etabPauseDefaut : 0);
    setMNote("");
    setShowModal(true);
  };

  /* ── Modal: open for edit ── */
  const openEditShift = (s: Shift) => {
    setEditShiftId(s.id);
    setMEmployeId(s.employe_id);
    setMDate(s.date);
    setMPosteId(s.poste_id ?? "");
    setMDebut(fmtH(s.heure_debut));
    setMFin(fmtH(s.heure_fin));
    setMPause(s.pause_minutes);
    setMNote(s.note ?? "");
    setShowModal(true);
  };

  /* ── Save shift ── */
  const handleSaveShift = async () => {
    if (!etab) return;
    setSaving(true);

    const payload = {
      employe_id: mEmployeId,
      etablissement_id: etab.id,
      poste_id: mPosteId || null,
      date: mDate,
      heure_debut: mDebut,
      heure_fin: mFin,
      pause_minutes: mPause,
      note: mNote || null,
    };

    if (editShiftId) {
      const { data } = await supabase.from("shifts").update(payload).eq("id", editShiftId).select().single();
      if (data) setShifts((prev) => prev.map((s) => s.id === editShiftId ? { ...s, ...data } : s));
    } else {
      const { data } = await supabase.from("shifts").insert(payload).select().single();
      if (data) setShifts((prev) => [...prev, data]);
    }

    setShowModal(false);
    setSaving(false);
  };

  /* ── Delete shift ── */
  const handleDeleteShift = async () => {
    if (!editShiftId || !confirm("Supprimer ce shift ?")) return;
    await supabase.from("shifts").delete().eq("id", editShiftId);
    setShifts((prev) => prev.filter((s) => s.id !== editShiftId));
    setShowModal(false);
  };

  /* ── Duplicate a single day → next day ── */
  const duplicateDay = async (dayIndex: number) => {
    if (!etab) return;
    const srcISO = weekISOs[dayIndex];
    const dstIndex = dayIndex < 6 ? dayIndex + 1 : 0;
    const dstISO = dayIndex < 6 ? weekISOs[dstIndex] : toISO(addDays(weekStart, 7));
    const dayShifts = shifts.filter((s) => s.date === srcISO);
    if (dayShifts.length === 0) { alert("Aucun shift ce jour."); return; }
    if (!confirm(`Dupliquer ${dayShifts.length} shift(s) de ${DAY_NAMES[dayIndex]} vers ${dayIndex < 6 ? DAY_NAMES[dstIndex] : "Lun. suivant"} ?`)) return;

    setSaving(true);
    const newShifts = dayShifts.map((s) => ({
      employe_id: s.employe_id,
      etablissement_id: etab.id,
      poste_id: s.poste_id,
      date: dstISO,
      heure_debut: s.heure_debut,
      heure_fin: s.heure_fin,
      pause_minutes: s.pause_minutes,
      note: s.note,
      statut: "brouillon",
    }));
    const { data: inserted } = await supabase.from("shifts").insert(newShifts).select();
    if (inserted) setShifts((prev) => [...prev, ...inserted]);
    setSaving(false);
  };

  /* ── Duplicate all shifts for one employee (S-1 → current week) ── */
  const duplicateEmployee = async (empId: string) => {
    if (!etab) return;
    const prevMonday = toISO(addDays(weekStart, -7));
    const prevSunday = toISO(addDays(weekStart, -1));

    const { data: prevShifts } = await supabase
      .from("shifts")
      .select("employe_id, poste_id, date, heure_debut, heure_fin, pause_minutes, note")
      .eq("etablissement_id", etab.id)
      .eq("employe_id", empId)
      .gte("date", prevMonday)
      .lte("date", prevSunday);

    if (!prevShifts || prevShifts.length === 0) { alert("Aucun shift S-1 pour cet employe."); return; }
    const emp = employes.find((e) => e.id === empId);
    if (!confirm(`Dupliquer ${prevShifts.length} shift(s) S-1 de ${emp?.prenom ?? ""} ?`)) return;

    setSaving(true);
    const newShifts = prevShifts.map((s) => {
      const oldDate = new Date(s.date + "T00:00:00");
      const dayOffset = Math.round((oldDate.getTime() - new Date(prevMonday + "T00:00:00").getTime()) / 86400000);
      return {
        ...s,
        etablissement_id: etab.id,
        date: toISO(addDays(weekStart, dayOffset)),
        statut: "brouillon",
      };
    });
    const { data: inserted } = await supabase.from("shifts").insert(newShifts).select();
    if (inserted) setShifts((prev) => [...prev, ...inserted]);
    setSaving(false);
  };

  /* ── Drag & Drop ── */
  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const shiftId = result.draggableId;
    const [newEmpId, newDate] = result.destination.droppableId.split(":");
    const [srcEmpId, srcDate] = result.source.droppableId.split(":");

    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;

    // Same cell: swap order (swap times with the shift at destination index)
    if (srcEmpId === newEmpId && srcDate === newDate) {
      const srcIdx = result.source.index;
      const destIdx = result.destination.index;
      if (srcIdx === destIdx) return;

      const cellKey = `${newEmpId}:${newDate}`;
      const cellShifts = (shiftsByCell.get(cellKey) ?? []);
      const otherShift = cellShifts[destIdx];
      if (!otherShift) return;

      // Swap heure_debut / heure_fin / poste_id between the two shifts
      const aDebut = shift.heure_debut, aFin = shift.heure_fin, aPoste = shift.poste_id;
      const bDebut = otherShift.heure_debut, bFin = otherShift.heure_fin, bPoste = otherShift.poste_id;

      // Optimistic update
      setShifts((prev) =>
        prev.map((s) => {
          if (s.id === shift.id) return { ...s, heure_debut: bDebut, heure_fin: bFin, poste_id: bPoste };
          if (s.id === otherShift.id) return { ...s, heure_debut: aDebut, heure_fin: aFin, poste_id: aPoste };
          return s;
        }),
      );

      await Promise.all([
        supabase.from("shifts").update({ heure_debut: bDebut, heure_fin: bFin, poste_id: bPoste }).eq("id", shift.id),
        supabase.from("shifts").update({ heure_debut: aDebut, heure_fin: aFin, poste_id: aPoste }).eq("id", otherShift.id),
      ]);
      return;
    }

    // Different cell: move shift
    setShifts((prev) =>
      prev.map((s) =>
        s.id === shiftId ? { ...s, employe_id: newEmpId, date: newDate } : s,
      ),
    );

    await supabase.from("shifts").update({ employe_id: newEmpId, date: newDate }).eq("id", shiftId);
  };

  /* ── Overlap detection for modal ── */
  const modalOverlap = useMemo(() => {
    if (!showModal || !mEmployeId || !mDate || !mDebut || !mFin) return null;
    const existing = shifts.filter(
      (s) => s.employe_id === mEmployeId && s.date === mDate && s.id !== editShiftId,
    );
    const current = { heure_debut: mDebut, heure_fin: mFin };
    const conflicts = existing.filter((s) => shiftsOverlap(current, s));
    return conflicts.length > 0 ? conflicts : null;
  }, [showModal, mEmployeId, mDate, mDebut, mFin, editShiftId, shifts]);

  /* ── Absence on modal date ── */
  const modalAbsence = useMemo(() => {
    if (!showModal || !mEmployeId || !mDate) return null;
    return absenceByCell.get(`${mEmployeId}:${mDate}`) ?? null;
  }, [showModal, mEmployeId, mDate, absenceByCell]);

  /* ── Postes for current equipe filter ── */
  const filteredPostes = equipeFilter === "tous"
    ? postes
    : postes.filter((p) => p.equipe === equipeFilter);

  /* ── Week totals ── */
  const totalHours = useMemo(() => {
    let total = 0;
    shifts.forEach((s) => { total += shiftDuration(s); });
    return total;
  }, [shifts]);

  const isToday = (iso: string) => iso === toISO(new Date());

  return (
    <RequireRole allowedRoles={["group_admin", "cuisine", "salle"]}>
      <div style={pageStyle}>
        {/* ── Establishment badge ── */}
        {etab && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: etab.couleur ?? "#D4775A" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{etab.nom}</span>
            <span style={{ fontSize: 11, color: "#999" }}>— Planning</span>
          </div>
        )}

        {/* ── Week navigation ── */}
        <div style={weekNav}>
          <button type="button" onClick={() => goWeek(-1)} style={navArrow}>←</button>
          <button type="button" onClick={goToday} style={todayBtn}>Auj.</button>
          <span style={weekLabelStyle}>{weekLabel}</span>
          <button type="button" onClick={() => goWeek(1)} style={navArrow}>→</button>
        </div>

        {/* ── Filters ── */}
        <div style={filtersRow}>
          <div style={{ display: "flex", gap: 4 }}>
            {["tous", ...equipeNames].map((f) => (
              <button key={f} type="button" onClick={() => setEquipeFilter(f)} style={pillBtn(equipeFilter === f)}>
                {f === "tous" ? "Tous" : f}
              </button>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#999" }}>
            {filteredEmployes.length} employe{filteredEmployes.length > 1 ? "s" : ""}
            {" · "}{shifts.length} shift{shifts.length > 1 ? "s" : ""}
            {" · "}{totalHours.toFixed(1)}h total
          </span>
        </div>

        {/* ── Planning grid ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : filteredEmployes.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Aucun employe actif</div>
        ) : (
          <DragDropContext onDragEnd={onDragEnd}>
            <div style={gridWrapper}>
              <div style={gridContainer()}>
                {/* ── Header row ── */}
                <div style={{ ...headerCell, position: "sticky", left: 0, zIndex: 3 }} />
                {weekDates.map((d, di) => {
                  const dayShiftCount = shifts.filter((s) => s.date === weekISOs[di]).length;
                  return (
                    <div key={di} style={{
                      ...headerCell,
                      ...(isToday(weekISOs[di]) ? todayHeader : {}),
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                        {DAY_NAMES[di]}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: isToday(weekISOs[di]) ? "#2D6A4F" : "#1a1a1a" }}>
                        {d.getDate()}
                      </div>
                      {canWrite && dayShiftCount > 0 && (
                        <button
                          type="button"
                          onClick={() => duplicateDay(di)}
                          title={`Dupliquer ${DAY_NAMES[di]} → ${di < 6 ? DAY_NAMES[di + 1] : "Lun."}`}
                          style={copyDayBtn}
                        >
                          Copier →
                        </button>
                      )}
                    </div>
                  );
                })}

                {/* ── Employee rows ── */}
                {filteredEmployes.map((emp, empIdx) => {
                  const bilan = bilans.get(emp.id);
                  const initials = emp.initiales || ((emp.prenom?.[0] ?? "") + (emp.nom?.[0] ?? "")).toUpperCase();
                  const contrat = emp.contrats?.find((c) => c.actif);
                  const isTNS = contrat?.type === "TNS";
                  const weekHours = bilan?.heures_travaillees ?? 0;
                  const hasAlerts = bilan && bilan.alertes.length > 0;
                  const rowBg = empIdx % 2 === 0 ? "#fff" : "#f9f7f3";

                  // Determine primary poste color from most frequent poste in this week's shifts
                  const empWeekShifts = shifts.filter(s => s.employe_id === emp.id);
                  const posteCounts = new Map<string, number>();
                  for (const s of empWeekShifts) {
                    if (s.poste_id) posteCounts.set(s.poste_id, (posteCounts.get(s.poste_id) ?? 0) + 1);
                  }
                  let primaryPosteColor = "#999";
                  if (posteCounts.size > 0) {
                    const topPosteId = [...posteCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
                    primaryPosteColor = posteMap.get(topPosteId)?.couleur ?? "#999";
                  }

                  // Format hours like Combo: 42h55 instead of 42.9
                  const fmtHM = (h: number) => {
                    const hrs = Math.floor(Math.abs(h));
                    const mins = Math.round((Math.abs(h) - hrs) * 60);
                    const sign = h < 0 ? "-" : "";
                    return mins > 0 ? `${sign}${hrs}h${String(mins).padStart(2, "0")}` : `${sign}${hrs}h`;
                  };
                  const contractH = contrat?.heures_semaine ?? 0;
                  const hsTotal = bilan ? bilan.heures_supp_10 + bilan.heures_supp_20 + bilan.heures_supp_50 : 0;
                  const rcH = bilan?.rc_acquis ?? 0;
                  const delta = bilan?.delta_contrat ?? 0;

                  return [
                    /* Employee name cell — Combo style */
                    <div key={`name-${emp.id}`} style={{ ...empCell, background: rowBg }}>
                      <div style={{ ...empAvatar, background: primaryPosteColor }}>{initials}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={empName}>{emp.prenom} {emp.nom.toUpperCase()}</span>
                          {isTNS && <span style={tnsBadge}>TNS</span>}
                        </div>
                        {!isTNS && (
                          <div style={{ display: "flex", alignItems: "center", gap: 0, marginTop: 3, flexWrap: "wrap" }}>
                            <span style={statItem}>{contractH}h</span>
                            <span style={statSep}>|</span>
                            <span style={{ ...statItem, fontWeight: 700 }}>{fmtHM(weekHours)}</span>
                            <span style={statSep}>|</span>
                            <span style={statItem}>{fmtHM(hsTotal)}</span>
                            {delta !== 0 && (
                              <>
                                <span style={statSep}>|</span>
                                <span style={{
                                  ...deltaBadge,
                                  background: delta > 0 ? "rgba(220,38,38,0.1)" : "rgba(234,160,60,0.15)",
                                  color: delta > 0 ? "#DC2626" : "#c47a20",
                                }}>
                                  {delta > 0 ? "+" : ""}{fmtHM(delta)}
                                </span>
                              </>
                            )}
                            {rcH > 0 && (
                              <>
                                <span style={statSep}>|</span>
                                <span style={rcBadge}>RC {fmtHM(rcH)}</span>
                              </>
                            )}
                            {hasAlerts && <span title={bilan!.alertes.map((a) => a.message).join("\n")} style={alertDot}>!</span>}
                          </div>
                        )}
                      </div>
                      {canWrite && !isTNS && (
                        <button
                          type="button"
                          onClick={() => duplicateEmployee(emp.id)}
                          title="Dupliquer S-1"
                          style={copyEmpBtn}
                        >
                          S-1
                        </button>
                      )}
                    </div>,

                    /* Day cells */
                    ...weekDates.map((_, di) => {
                      const iso = weekISOs[di];
                      const cellKey = `${emp.id}:${iso}`;
                      const cellShifts = shiftsByCell.get(cellKey) ?? [];
                      const absType = absenceByCell.get(cellKey);

                      return (
                        <Droppable key={cellKey} droppableId={cellKey}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              style={{
                                ...dayCell,
                                background: rowBg,
                                ...(isToday(iso) ? todayCol : {}),
                                ...(absType ? absenceCell : {}),
                                ...(snapshot.isDraggingOver ? { background: "rgba(45,106,79,0.08)" } : {}),
                              }}
                              onClick={() => {
                                if (shiftMouseDown.current) { shiftMouseDown.current = false; return; }
                                if (canWrite) openCreateShift(emp.id, iso);
                              }}
                            >
                              {absType && cellShifts.length === 0 && (
                                <div style={absenceBadge}>
                                  {ABSENCE_LABELS[absType] ?? absType}
                                </div>
                              )}
                              {cellShifts.map((s, si) => {
                                const poste = s.poste_id ? posteMap.get(s.poste_id) : null;
                                const dur = shiftDuration(s);
                                return (
                                  <Draggable key={s.id} draggableId={s.id} index={si} isDragDisabled={!canWrite}>
                                    {(drag) => (
                                      <div
                                        ref={drag.innerRef}
                                        {...drag.draggableProps}
                                        {...drag.dragHandleProps}
                                        data-shift="1"
                                        onMouseDown={() => { shiftMouseDown.current = true; }}
                                        onTouchStart={() => { shiftMouseDown.current = true; }}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          shiftMouseDown.current = false;
                                          if (canWrite) openEditShift(s);
                                        }}
                                        style={{
                                          ...shiftBlock(poste?.couleur ?? "#ddd6c8"),
                                          ...(absType ? { opacity: 0.5 } : {}),
                                          ...drag.draggableProps.style,
                                        }}
                                      >
                                        {poste && (
                                          <div style={{ fontSize: 11, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                            {poste.nom}
                                          </div>
                                        )}
                                        <div style={{ display: "flex", alignItems: "center", gap: 2, fontSize: 10, color: "rgba(0,0,0,0.6)" }}>
                                          <span style={{ fontWeight: 600 }}>{fmtH(s.heure_debut)}</span>
                                          <span>-</span>
                                          <span>{fmtH(s.heure_fin)}</span>
                                          <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>({dur.toFixed(1)}h)</span>
                                        </div>
                                      </div>
                                    )}
                                  </Draggable>
                                );
                              })}
                              {provided.placeholder}
                            </div>
                          )}
                        </Droppable>
                      );
                    }),
                  ];
                })}
              </div>
            </div>
          </DragDropContext>
        )}
      </div>

      {/* ═══ MODAL: Shift ═══ */}
      {showModal && (
        <div style={overlayStyle} onClick={() => setShowModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>
              {editShiftId ? "Modifier le shift" : "Nouveau shift"}
              <span style={{ fontSize: 13, fontWeight: 400, color: "#999", marginLeft: 10 }}>
                {(() => {
                  const d = new Date(mDate + "T00:00:00");
                  const di = (d.getDay() + 6) % 7;
                  return `${DAY_NAMES_FULL[di]} ${fmtDay(d)}`;
                })()}
              </span>
            </h2>

            {/* Employe (read-only on edit, selectable on create) */}
            <div style={fieldRow}>
              <label style={labelSt}>Employe</label>
              <select style={inputSt} value={mEmployeId} onChange={(e) => setMEmployeId(e.target.value)} disabled={!!editShiftId}>
                {filteredEmployes.map((emp) => (
                  <option key={emp.id} value={emp.id}>{emp.prenom} {emp.nom}</option>
                ))}
              </select>
            </div>

            {/* Poste */}
            <div style={fieldRow}>
              <label style={labelSt}>Poste</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {filteredPostes.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setMPosteId(p.id)}
                    style={{
                      padding: "5px 12px",
                      borderRadius: 20,
                      border: mPosteId === p.id ? `2px solid ${p.couleur}` : "1px solid #ddd6c8",
                      background: mPosteId === p.id ? `${p.couleur}25` : "#fff",
                      color: mPosteId === p.id ? "#1a1a1a" : "#6f6a61",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {p.nom}
                  </button>
                ))}
              </div>
            </div>

            {/* Horaires */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div style={fieldRow}>
                <label style={labelSt}>Debut</label>
                <input type="time" style={inputSt} value={mDebut} onChange={(e) => setMDebut(e.target.value)} />
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Fin</label>
                <input type="time" style={inputSt} value={mFin} onChange={(e) => setMFin(e.target.value)} />
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Pause (min)</label>
                <input type="number" style={inputSt} value={mPause} onChange={(e) => setMPause(Number(e.target.value))} min={0} />
              </div>
            </div>

            {/* Duration preview */}
            {mDebut && mFin && (
              <div style={{ fontSize: 13, color: "#6f6a61", marginBottom: 10 }}>
                Duree : <strong>{((timeToMin(mFin) - timeToMin(mDebut) + 1440) % 1440 - mPause) / 60 > 0
                  ? (((timeToMin(mFin) - timeToMin(mDebut) + 1440) % 1440 - mPause) / 60).toFixed(1)
                  : "0"}h</strong> (pause {mPause}min deduite)
              </div>
            )}

            {/* Warnings */}
            {modalAbsence && (
              <div style={warningBox}>
                Cet employe est en <strong>{ABSENCE_LABELS[modalAbsence] ?? modalAbsence}</strong> ce jour.
              </div>
            )}
            {modalOverlap && (
              <div style={warningBox}>
                Chevauchement avec {modalOverlap.length > 1 ? `${modalOverlap.length} shifts` : "un shift"} existant{modalOverlap.length > 1 ? "s" : ""} :
                {modalOverlap.map((s) => ` ${fmtH(s.heure_debut)}-${fmtH(s.heure_fin)}`).join(",")}
              </div>
            )}

            {/* Note */}
            <div style={fieldRow}>
              <label style={labelSt}>Note</label>
              <input style={inputSt} value={mNote} onChange={(e) => setMNote(e.target.value)} placeholder="Optionnel" />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "space-between" }}>
              <div>
                {editShiftId && (
                  <button type="button" onClick={handleDeleteShift} style={deleteBtnStyle}>Supprimer</button>
                )}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button type="button" onClick={() => setShowModal(false)} style={cancelBtn}>Annuler</button>
                <button
                  type="button"
                  onClick={handleSaveShift}
                  disabled={saving || !mDebut || !mFin}
                  style={{ ...saveBtnStyle, opacity: saving ? 0.5 : 1 }}
                >
                  {saving ? "..." : "Enregistrer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 1200,
  margin: "0 auto",
  padding: "12px 12px 60px",
};

const weekNav: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  justifyContent: "center",
  marginBottom: 12,
};

const navArrow: React.CSSProperties = {
  width: 32, height: 32, borderRadius: 8,
  border: "1px solid #ddd6c8", background: "#fff",
  fontSize: 16, fontWeight: 700, cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#1a1a1a",
};

const todayBtn: React.CSSProperties = {
  padding: "4px 12px", borderRadius: 20,
  border: "1px solid #2D6A4F", background: "rgba(45,106,79,0.08)",
  color: "#2D6A4F", fontSize: 12, fontWeight: 700, cursor: "pointer",
};

const weekLabelStyle: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  minWidth: 180, textAlign: "center",
};

const filtersRow: React.CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 10,
  alignItems: "center", justifyContent: "space-between",
  marginBottom: 12,
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px", borderRadius: 20,
  border: active ? "1px solid #2D6A4F" : "1px solid #ddd6c8",
  background: active ? "#2D6A4F" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});

const gridWrapper: React.CSSProperties = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const gridContainer = (): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "200px repeat(7, 1fr)",
  gap: 0,
  minWidth: 900,
});

const headerCell: React.CSSProperties = {
  padding: "10px 6px",
  textAlign: "center",
  borderBottom: "1px solid #ddd6c8",
  background: "#f5f2ec",
};

const todayHeader: React.CSSProperties = {
  background: "rgba(45,106,79,0.06)",
  borderBottom: "2px solid #2D6A4F",
};

const empCell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 8px",
  borderBottom: "1px solid #f0ebe3",
  borderRight: "1px solid #f0ebe3",
  background: "#fff",
  position: "sticky",
  left: 0,
  zIndex: 2,
};

const empAvatar: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%",
  background: "#2D6A4F", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 10, fontWeight: 700, flexShrink: 0,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const empName: React.CSSProperties = {
  fontSize: 12, fontWeight: 600, color: "#2D6A4F",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const statItem: React.CSSProperties = {
  fontSize: 10, color: "#666",
};

const statSep: React.CSSProperties = {
  fontSize: 10, color: "#ccc", margin: "0 3px",
};

const deltaBadge: React.CSSProperties = {
  fontSize: 9, fontWeight: 700,
  padding: "1px 5px", borderRadius: 6,
};

const rcBadge: React.CSSProperties = {
  fontSize: 9, fontWeight: 700,
  padding: "1px 5px", borderRadius: 6,
  background: "rgba(45,106,79,0.1)", color: "#2D6A4F",
};

const dayCell: React.CSSProperties = {
  minHeight: 80,
  padding: 4,
  borderBottom: "1px solid #f0ebe3",
  borderRight: "1px solid #f5f0e8",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 3,
};

const todayCol: React.CSSProperties = {
  background: "rgba(45,106,79,0.04)",
};

const shiftBlock = (color: string): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: 1,
  padding: "6px 8px",
  borderRadius: 10,
  background: `${color}30`,
  borderLeft: `3px solid ${color}`,
  fontSize: 11,
  color: "#1a1a1a",
  cursor: "grab",
  userSelect: "none",
});


const tnsBadge: React.CSSProperties = {
  display: "inline-block",
  padding: "1px 5px",
  borderRadius: 4,
  background: "rgba(160,132,92,0.12)",
  color: "#A0845C",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: 0.5,
};

const alertDot: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 16, height: 16, borderRadius: "50%",
  background: "rgba(220,38,38,0.12)", color: "#DC2626",
  fontSize: 10, fontWeight: 800,
};

/* ── Modal ── */
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

const fieldRow: React.CSSProperties = { marginBottom: 12 };

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61",
  marginBottom: 4, letterSpacing: 0.3,
};

const inputSt: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
  outline: "none", boxSizing: "border-box",
};

const saveBtnStyle: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 20, border: "none",
  background: "#2D6A4F", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8",
  background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const deleteBtnStyle: React.CSSProperties = {
  padding: "8px 14px", borderRadius: 8,
  border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)",
  color: "#DC2626", fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const warningBox: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, marginBottom: 10,
  background: "rgba(220,38,38,0.06)", border: "1px solid rgba(220,38,38,0.2)",
  fontSize: 12, color: "#DC2626", fontWeight: 600,
};

const absenceCell: React.CSSProperties = {
  background: "repeating-linear-gradient(135deg, transparent, transparent 4px, rgba(37,99,235,0.06) 4px, rgba(37,99,235,0.06) 8px)",
};

const absenceBadge: React.CSSProperties = {
  padding: "2px 6px", borderRadius: 4,
  background: "rgba(37,99,235,0.10)", color: "#2563eb",
  fontSize: 10, fontWeight: 700, textAlign: "center",
  letterSpacing: 0.3,
};

const copyDayBtn: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, padding: "1px 6px",
  borderRadius: 4, border: "1px solid #ddd6c8",
  background: "#fff", color: "#999", cursor: "pointer",
  marginTop: 2,
};

const copyEmpBtn: React.CSSProperties = {
  fontSize: 9, fontWeight: 700, padding: "2px 5px",
  borderRadius: 4, border: "1px solid #ddd6c8",
  background: "#fff", color: "#999", cursor: "pointer",
  flexShrink: 0,
};
