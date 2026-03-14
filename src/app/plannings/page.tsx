"use client";

import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
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

type EquipeFilter = "tous" | "Cuisine" | "Salle" | "Shop";

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

/* ── Component ─────────────────────────────────────────────────── */

export default function PlanningPage() {
  const { current: etab } = useEtablissement();
  const { can } = useProfile();
  const canWrite = can("planning.edit");

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [equipeFilter, setEquipeFilter] = useState<EquipeFilter>("tous");

  // ── Shift modal ──
  const [showModal, setShowModal] = useState(false);
  const [editShiftId, setEditShiftId] = useState<string | null>(null);
  const [mEmployeId, setMEmployeId] = useState("");
  const [mPosteId, setMPosteId] = useState("");
  const [mDate, setMDate] = useState("");
  const [mDebut, setMDebut] = useState("09:00");
  const [mFin, setMFin] = useState("15:00");
  const [mPause, setMPause] = useState(30);
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

      const [empRes, postesRes, shiftsRes] = await Promise.all([
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
      ]);

      if (cancelled) return;
      setEmployes(empRes.data ?? []);
      setPostes(postesRes.data ?? []);
      setShifts(shiftsRes.data ?? []);
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
  }, [filteredEmployes, shifts]);

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
    setMPause(30);
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

  /* ── Duplicate previous week ── */
  const duplicateWeek = async () => {
    if (!etab || !confirm("Dupliquer les shifts de la semaine precedente ?")) return;
    setSaving(true);
    const prevMonday = toISO(addDays(weekStart, -7));
    const prevSunday = toISO(addDays(weekStart, -1));

    const { data: prevShifts } = await supabase
      .from("shifts")
      .select("employe_id, poste_id, date, heure_debut, heure_fin, pause_minutes, note")
      .eq("etablissement_id", etab.id)
      .gte("date", prevMonday)
      .lte("date", prevSunday);

    if (!prevShifts || prevShifts.length === 0) {
      alert("Aucun shift la semaine precedente.");
      setSaving(false);
      return;
    }

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

    const shift = shifts.find((s) => s.id === shiftId);
    if (!shift) return;
    if (shift.employe_id === newEmpId && shift.date === newDate) return;

    // Optimistic update
    setShifts((prev) =>
      prev.map((s) =>
        s.id === shiftId ? { ...s, employe_id: newEmpId, date: newDate } : s,
      ),
    );

    await supabase.from("shifts").update({ employe_id: newEmpId, date: newDate }).eq("id", shiftId);
  };

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
      <NavBar
        backHref="/rh/equipe"
        backLabel="Equipe"
        menuItems={canWrite ? [
          { label: "Dupliquer S-1", onClick: duplicateWeek, disabled: saving },
        ] : undefined}
      />

      <div style={pageStyle}>
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
            {(["tous", "Cuisine", "Salle", "Shop"] as EquipeFilter[]).map((f) => (
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
                <div style={headerCell} />
                {weekDates.map((d, di) => (
                  <div key={di} style={{
                    ...headerCell,
                    ...(isToday(weekISOs[di]) ? todayHeader : {}),
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>
                      {DAY_NAMES[di]}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: isToday(weekISOs[di]) ? "#D4775A" : "#1a1a1a" }}>
                      {d.getDate()}
                    </div>
                  </div>
                ))}
                {/* Hours column header */}
                <div style={{ ...headerCell, fontSize: 10, color: "#999" }}>H.</div>

                {/* ── Employee rows ── */}
                {filteredEmployes.map((emp) => {
                  const bilan = bilans.get(emp.id);
                  const initials = emp.initiales || ((emp.prenom?.[0] ?? "") + (emp.nom?.[0] ?? "")).toUpperCase();
                  const contrat = emp.contrats?.find((c) => c.actif);
                  const isTNS = contrat?.type === "TNS";
                  const weekHours = bilan?.heures_travaillees ?? 0;
                  const hasAlerts = bilan && bilan.alertes.length > 0;

                  return [
                    /* Employee name cell */
                    <div key={`name-${emp.id}`} style={empCell}>
                      <div style={empAvatar}>{initials}</div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={empName}>{emp.prenom} {emp.nom.charAt(0)}.</span>
                          {isTNS && <span style={tnsBadge}>TNS</span>}
                        </div>
                        {contrat && !isTNS && (
                          <div style={{ fontSize: 10, color: "#999" }}>{contrat.heures_semaine}h</div>
                        )}
                      </div>
                    </div>,

                    /* Day cells */
                    ...weekDates.map((_, di) => {
                      const iso = weekISOs[di];
                      const cellKey = `${emp.id}:${iso}`;
                      const cellShifts = shiftsByCell.get(cellKey) ?? [];

                      return (
                        <Droppable key={cellKey} droppableId={cellKey}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.droppableProps}
                              style={{
                                ...dayCell,
                                ...(isToday(iso) ? todayCol : {}),
                                ...(snapshot.isDraggingOver ? { background: "rgba(212,119,90,0.08)" } : {}),
                              }}
                              onClick={(e) => {
                                if ((e.target as HTMLElement).closest("[data-shift]")) return;
                                if (canWrite) openCreateShift(emp.id, iso);
                              }}
                            >
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
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          if (canWrite) openEditShift(s);
                                        }}
                                        style={{
                                          ...shiftBlock(poste?.couleur ?? "#ddd6c8"),
                                          ...drag.draggableProps.style,
                                        }}
                                      >
                                        {poste?.emoji && <span style={{ marginRight: 2 }}>{poste.emoji}</span>}
                                        <span style={{ fontWeight: 700 }}>{fmtH(s.heure_debut)}</span>
                                        <span style={{ color: "rgba(0,0,0,0.4)" }}>-</span>
                                        <span>{fmtH(s.heure_fin)}</span>
                                        <span style={{ fontSize: 9, opacity: 0.6, marginLeft: 2 }}>{dur.toFixed(1)}h</span>
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

                    /* Hours total cell */
                    <div key={`h-${emp.id}`} style={hoursCell}>
                      {isTNS ? (
                        <span style={{ fontSize: 10, color: "#A0845C", fontWeight: 700 }}>TNS</span>
                      ) : (
                        <>
                          <span style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: hasAlerts ? "#DC2626" : weekHours > 0 ? "#1a1a1a" : "#ccc",
                          }}>
                            {weekHours > 0 ? `${weekHours.toFixed(1)}h` : "—"}
                          </span>
                          {hasAlerts && <span title={bilan.alertes.map((a) => a.message).join("\n")} style={alertDot}>!</span>}
                          {bilan && bilan.delta_contrat !== 0 && (
                            <div style={{
                              fontSize: 10,
                              color: bilan.delta_contrat > 0 ? "#D4775A" : "#2563eb",
                              fontWeight: 600,
                            }}>
                              {bilan.delta_contrat > 0 ? "+" : ""}{bilan.delta_contrat.toFixed(1)}
                            </div>
                          )}
                        </>
                      )}
                    </div>,
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
                      background: mPosteId === p.id ? `${p.couleur}18` : "#fff",
                      color: mPosteId === p.id ? p.couleur : "#6f6a61",
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {p.emoji && <span style={{ marginRight: 4 }}>{p.emoji}</span>}
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
  border: "1px solid #D4775A", background: "rgba(212,119,90,0.08)",
  color: "#D4775A", fontSize: 12, fontWeight: 700, cursor: "pointer",
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
  border: active ? "1px solid #D4775A" : "1px solid #ddd6c8",
  background: active ? "#D4775A" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12, fontWeight: 600, cursor: "pointer",
});

const gridWrapper: React.CSSProperties = {
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const gridContainer = (): React.CSSProperties => ({
  display: "grid",
  gridTemplateColumns: "120px repeat(7, 1fr) 60px",
  gap: 0,
  minWidth: 800,
});

const headerCell: React.CSSProperties = {
  padding: "8px 6px",
  textAlign: "center",
  borderBottom: "1px solid #ddd6c8",
};

const todayHeader: React.CSSProperties = {
  background: "rgba(212,119,90,0.06)",
  borderBottom: "2px solid #D4775A",
};

const empCell: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 6px",
  borderBottom: "1px solid #f0ebe3",
  borderRight: "1px solid #f0ebe3",
  background: "#fff",
  position: "sticky",
  left: 0,
  zIndex: 2,
};

const empAvatar: React.CSSProperties = {
  width: 28, height: 28, borderRadius: "50%",
  background: "#D4775A", color: "#fff",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontSize: 10, fontWeight: 700, flexShrink: 0,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const empName: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, color: "#1a1a1a",
  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
};

const dayCell: React.CSSProperties = {
  minHeight: 52,
  padding: 3,
  borderBottom: "1px solid #f0ebe3",
  borderRight: "1px solid #f5f0e8",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const todayCol: React.CSSProperties = {
  background: "rgba(212,119,90,0.03)",
};

const shiftBlock = (color: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: "3px 6px",
  borderRadius: 6,
  background: `${color}20`,
  border: `1px solid ${color}40`,
  fontSize: 11,
  color: "#1a1a1a",
  cursor: "pointer",
  whiteSpace: "nowrap",
  overflow: "hidden",
});

const hoursCell: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "6px 4px",
  borderBottom: "1px solid #f0ebe3",
  background: "#faf7f2",
};

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
  background: "#D4775A", color: "#fff",
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
