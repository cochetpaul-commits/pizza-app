"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/lib/supabaseClient";

import { useEtablissement } from "@/lib/EtablissementContext";
import { shiftDureeNette, formatHeures, type ShiftInput } from "@/hooks/useConventionLegale";

/* ── Types ─────────────────────────────────────────────────────── */

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

type Poste = {
  id: string;
  nom: string;
  couleur: string;
  emoji: string | null;
};

/* ── Helpers ───────────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.getFullYear(), d.getMonth(), diff);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function formatDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

function shiftDuration(s: Shift): number {
  const si: ShiftInput = { date: s.date, heure_debut: s.heure_debut, heure_fin: s.heure_fin, pause_minutes: s.pause_minutes };
  return shiftDureeNette(si);
}

/* ── Component ─────────────────────────────────────────────────── */

export default function MesShiftsPage() {
  const { current: etab } = useEtablissement();
  const [employeId, setEmployeId] = useState<string | null>(null);
  const [employeName, setEmployeName] = useState("");
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i))),
    [weekStart],
  );
  const mondayISO = weekDates[0];
  const sundayISO = weekDates[6];

  const goWeek = useCallback((delta: number) => {
    setWeekStart((prev) => addDays(prev, delta * 7));
  }, []);

  // Resolve current auth user → employe
  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email || cancelled) return;

      const { data: emp } = await supabase
        .from("employes")
        .select("id, prenom, nom")
        .eq("etablissement_id", etab.id)
        .ilike("email", user.email)
        .eq("actif", true)
        .limit(1)
        .single();

      if (cancelled) return;
      if (emp) {
        setEmployeId(emp.id);
        setEmployeName(`${emp.prenom} ${emp.nom}`);
      } else {
        setError("Aucun employe associe a votre compte.");
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [etab]);

  // Load shifts + postes
  useEffect(() => {
    if (!employeId || !etab) return;
    let cancelled = false;
    setLoading(true); // eslint-disable-line react-hooks/set-state-in-effect
    (async () => {
      const [shiftsRes, postesRes] = await Promise.all([
        supabase
          .from("shifts")
          .select("id, employe_id, poste_id, date, heure_debut, heure_fin, pause_minutes, note, statut")
          .eq("employe_id", employeId)
          .gte("date", mondayISO)
          .lte("date", sundayISO)
          .order("date")
          .order("heure_debut"),
        supabase
          .from("postes")
          .select("id, nom, couleur, emoji")
          .eq("etablissement_id", etab.id)
          .eq("actif", true),
      ]);
      if (cancelled) return;
      setShifts((shiftsRes.data ?? []) as Shift[]);
      setPostes((postesRes.data ?? []) as Poste[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [employeId, etab, mondayISO, sundayISO]);

  // Summary
  const totalHeures = useMemo(() =>
    shifts.reduce((sum, s) => sum + shiftDuration(s), 0),
    [shifts],
  );
  const totalShifts = shifts.length;
  const totalRepas = shifts.length; // 1 repas par shift

  const posteMap = useMemo(() => {
    const m = new Map<string, Poste>();
    postes.forEach((p) => m.set(p.id, p));
    return m;
  }, [postes]);

  const shiftsByDay = useMemo(() => {
    const m = new Map<string, Shift[]>();
    weekDates.forEach((d) => m.set(d, []));
    shifts.forEach((s) => {
      const arr = m.get(s.date);
      if (arr) arr.push(s);
    });
    return m;
  }, [shifts, weekDates]);

  const isCurrentWeek = toISO(getMonday(new Date())) === mondayISO;

  return (
    <>
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 60px" }}>

        <h1 style={S.h1}>Mon planning</h1>
        {employeName && <p style={S.subtitle}>{employeName}</p>}

        {/* Week nav */}
        <div style={S.weekNav}>
          <button type="button" onClick={() => goWeek(-1)} style={S.navBtn}>&larr;</button>
          <div style={{ textAlign: "center" }}>
            <div style={S.weekLabel}>
              {JOURS[0]} {formatDate(mondayISO)} — {JOURS[6]} {formatDate(sundayISO)}
            </div>
            {!isCurrentWeek && (
              <button type="button" onClick={() => setWeekStart(getMonday(new Date()))}
                style={{ ...S.navBtn, fontSize: 11, marginTop: 4 }}>Aujourd&apos;hui</button>
            )}
          </div>
          <button type="button" onClick={() => goWeek(1)} style={S.navBtn}>&rarr;</button>
        </div>

        {/* Summary cards */}
        <div style={S.cardsRow}>
          <div style={S.card}>
            <div style={S.cardValue}>{formatHeures(totalHeures)}</div>
            <div style={S.cardLabel}>Heures</div>
          </div>
          <div style={S.card}>
            <div style={S.cardValue}>{totalShifts}</div>
            <div style={S.cardLabel}>Shifts</div>
          </div>
          <div style={S.card}>
            <div style={S.cardValue}>{totalRepas}</div>
            <div style={S.cardLabel}>Repas</div>
          </div>
        </div>

        {error && <div style={S.error}>{error}</div>}

        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {weekDates.map((date, i) => {
              const dayShifts = shiftsByDay.get(date) ?? [];
              const isToday = date === toISO(new Date());

              return (
                <div key={date} style={{
                  ...S.dayCard,
                  ...(isToday ? { borderColor: "#D4775A", borderWidth: 2 } : {}),
                }}>
                  <div style={S.dayHeader}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{JOURS[i]}</span>
                    <span style={{ fontSize: 13, color: "#6f6a61" }}>{formatDate(date)}</span>
                    {isToday && <span style={S.todayBadge}>Aujourd&apos;hui</span>}
                  </div>

                  {dayShifts.length === 0 ? (
                    <div style={{ padding: "8px 0", color: "#bbb", fontSize: 13, fontStyle: "italic" }}>
                      REPOS
                    </div>
                  ) : (
                    dayShifts.map((s) => {
                      const poste = s.poste_id ? posteMap.get(s.poste_id) : null;
                      const dur = shiftDuration(s);
                      return (
                        <div key={s.id} style={S.shiftRow}>
                          {poste && (
                            <span style={{
                              ...S.posteBadge,
                              background: `${poste.couleur}18`,
                              color: poste.couleur,
                              border: `1px solid ${poste.couleur}30`,
                            }}>
                              {poste.emoji && <span style={{ marginRight: 3 }}>{poste.emoji}</span>}
                              {poste.nom}
                            </span>
                          )}
                          <span style={S.shiftTime}>
                            {s.heure_debut.slice(0, 5)} — {s.heure_fin.slice(0, 5)}
                          </span>
                          <span style={S.shiftDur}>{formatHeures(dur)}</span>
                          {s.note && <div style={S.shiftNote}>{s.note}</div>}
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */

const S = {
  h1: {
    margin: 0, fontSize: 24, fontWeight: 700,
    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
    textTransform: "uppercase" as const, letterSpacing: 1, color: "#1a1a1a",
  },
  subtitle: {
    margin: "4px 0 16px", fontSize: 14, color: "#6f6a61",
  },
  weekNav: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    marginBottom: 16,
  } as React.CSSProperties,
  navBtn: {
    padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8",
    background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600,
    cursor: "pointer",
  } as React.CSSProperties,
  weekLabel: {
    fontSize: 14, fontWeight: 700, color: "#1a1a1a",
  },
  cardsRow: {
    display: "flex", gap: 10, marginBottom: 16,
  } as React.CSSProperties,
  card: {
    flex: 1, background: "#fff", border: "1px solid #ddd6c8",
    borderRadius: 12, padding: "12px 10px", textAlign: "center" as const,
  },
  cardValue: {
    fontSize: 22, fontWeight: 700, color: "#1a1a1a",
    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
  },
  cardLabel: {
    fontSize: 11, fontWeight: 600, color: "#999", textTransform: "uppercase" as const,
    letterSpacing: 0.5, marginTop: 2,
  },
  error: {
    background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8,
    padding: 12, marginBottom: 16, color: "#991b1b", fontSize: 13,
  },
  dayCard: {
    background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12,
    padding: "12px 14px",
  } as React.CSSProperties,
  dayHeader: {
    display: "flex", alignItems: "center", gap: 8, marginBottom: 6,
  } as React.CSSProperties,
  todayBadge: {
    fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20,
    background: "#D4775A", color: "#fff", textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  shiftRow: {
    display: "flex", alignItems: "center", gap: 8, padding: "6px 0",
    flexWrap: "wrap" as const,
  },
  posteBadge: {
    display: "inline-flex", alignItems: "center", padding: "2px 8px",
    borderRadius: 20, fontSize: 12, fontWeight: 600,
  } as React.CSSProperties,
  shiftTime: {
    fontSize: 14, fontWeight: 600, color: "#1a1a1a",
  },
  shiftDur: {
    fontSize: 13, color: "#6f6a61", marginLeft: "auto",
    fontFamily: "var(--font-cormorant), 'Cormorant Garamond', serif",
    fontWeight: 600,
  },
  shiftNote: {
    width: "100%", fontSize: 12, color: "#999", fontStyle: "italic" as const,
    paddingLeft: 2,
  },
};
