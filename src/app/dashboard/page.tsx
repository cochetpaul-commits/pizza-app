"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { T } from "@/lib/tokens";
import { TileIcon } from "@/components/TileIcon";
import { fetchPriceAlerts } from "@/lib/priceAlerts";

type CaData = { totalSales: number; guestsNumber: number } | null;
type UpcomingEvent = { id: string; name: string; date: string | null; status: string; covers: number };

function fmtEur(n: number) {
  return n.toLocaleString("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtDateShort(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/* ───────── Helper: get Monday of next week ───────── */
function getNextWeekMonday(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = (day === 0 ? 1 : 8 - day);
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return monday.toISOString().slice(0, 10);
}

function getNextWeekSunday(): string {
  const mon = new Date(getNextWeekMonday());
  mon.setDate(mon.getDate() + 6);
  return mon.toISOString().slice(0, 10);
}

/* ───────── Sub-components ───────── */

function KpiCard({ label, value, sub, accent }: {
  label: string; value: string; sub?: string; accent?: string;
}) {
  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "14px 12px",
      border: `1.5px solid ${T.border}`,
      display: "flex", flexDirection: "column", gap: 2,
      minHeight: 80,
    }}>
      <span style={{
        fontSize: 9, fontWeight: 700, letterSpacing: "0.14em",
        textTransform: "uppercase", color: T.muted,
        fontFamily: "DM Sans, sans-serif", lineHeight: 1.2,
      }}>{label}</span>
      <span style={{
        fontSize: 26, fontWeight: 700, color: accent ?? T.dark,
        fontFamily: "var(--font-oswald), Oswald, sans-serif",
        lineHeight: 1.15, marginTop: 4,
      }}>{value}</span>
      {sub && (
        <span style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{sub}</span>
      )}
    </div>
  );
}

function TaskCard({ href, icon, title, subtitle, accent, count }: {
  href: string; icon: React.ComponentProps<typeof TileIcon>["name"];
  title: string; subtitle: string; accent: string; count?: number;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none", color: "inherit" }}>
      <div style={{
        background: T.white, borderRadius: 14, padding: "14px 16px",
        border: `1.5px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        cursor: "pointer", transition: "box-shadow 0.15s",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: `${accent}12`, display: "flex",
            alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            <TileIcon name={icon} size={18} color={accent} />
          </div>
          <div>
            <div style={{
              fontFamily: "DM Sans, sans-serif", fontWeight: 700,
              fontSize: 13, color: T.dark, lineHeight: 1.3,
            }}>
              {title}
              {count !== undefined && count > 0 && (
                <span style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  minWidth: 18, height: 18, borderRadius: 9,
                  background: accent, color: "#fff",
                  fontSize: 10, fontWeight: 700, padding: "0 5px",
                  marginLeft: 8, verticalAlign: "middle",
                }}>{count}</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: T.muted, marginTop: 1 }}>{subtitle}</div>
          </div>
        </div>
        <span style={{ fontSize: 11, color: T.terracotta, fontWeight: 600, flexShrink: 0 }}>Voir</span>
      </div>
    </Link>
  );
}

/* ───────── Main ───────── */

export default function DashboardPage() {
  const { role, isGroupAdmin } = useProfile();
  const { isGroupView, current } = useEtablissement();
  const isAdmin = isGroupAdmin;

  const [ca, setCa] = useState<CaData>(null);
  const [caPM, setCaPM] = useState<number | null>(null);
  const [caYesterday, setCaYesterday] = useState<number | null>(null);
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [alertCount, setAlertCount] = useState(0);
  const [pendingCommandes, setPendingCommandes] = useState(0);
  const [shiftsToday, setShiftsToday] = useState(0);
  const [nextWeekHasShifts, setNextWeekHasShifts] = useState<boolean | null>(null);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Fetch CA Popina (Bello Mio today)
  useEffect(() => {
    async function fetchCa() {
      try {
        const res = await fetchApi("/api/popina/ca-jour");
        if (!res.ok) return;
        const d = await res.json();
        setCa({ totalSales: d.totalSales ?? 0, guestsNumber: d.guestsNumber ?? 0 });
      } catch { /* silencieux */ }
    }
    if (isAdmin) fetchCa();
  }, [isAdmin]);

  // Fetch CA Piccola Mia today
  useEffect(() => {
    async function fetchCaPM() {
      const { data } = await supabase
        .from("daily_sales")
        .select("ca_ttc")
        .eq("date", today)
        .eq("source", "kezia_pdf")
        .limit(1)
        .maybeSingle();
      setCaPM(data?.ca_ttc ?? 0);
    }
    if (isAdmin) fetchCaPM();
  }, [isAdmin, today]);

  // Fetch CA Yesterday (from daily_sales or Popina)
  useEffect(() => {
    async function fetchCaYesterday() {
      const { data } = await supabase
        .from("daily_sales")
        .select("ca_ttc")
        .eq("date", yesterday)
        .limit(10);
      const total = (data ?? []).reduce((sum: number, r: { ca_ttc: number | null }) => sum + (r.ca_ttc ?? 0), 0);
      setCaYesterday(total > 0 ? total : null);
    }
    if (isAdmin) fetchCaYesterday();
  }, [isAdmin, yesterday]);

  // Events
  useEffect(() => {
    async function fetchEvents() {
      const { data } = await supabase
        .from("events")
        .select("id,name,date,status,covers")
        .gte("date", today)
        .not("status", "in", '("termine","annule")')
        .order("date", { ascending: true })
        .limit(4);
      setEvents((data ?? []) as UpcomingEvent[]);
    }
    fetchEvents();
  }, [today]);

  // Price alerts
  useEffect(() => {
    async function fetchAlerts() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      try {
        const alerts = await fetchPriceAlerts(supabase, user.id);
        setAlertCount(alerts.length);
      } catch { /* silencieux */ }
    }
    if (isAdmin) fetchAlerts();
  }, [isAdmin]);

  // Pending commandes
  useEffect(() => {
    async function fetchPending() {
      const { count } = await supabase
        .from("commande_sessions")
        .select("id", { count: "exact", head: true })
        .eq("status", "en_attente");
      setPendingCommandes(count ?? 0);
    }
    if (isAdmin) fetchPending();
  }, [isAdmin]);

  // Shifts today (employees working tonight)
  useEffect(() => {
    async function fetchShiftsToday() {
      let query = supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .eq("date", today);
      if (!isGroupView && current) {
        query = query.eq("etablissement_id", current.id);
      }
      const { count } = await query;
      setShiftsToday(count ?? 0);
    }
    if (isAdmin) fetchShiftsToday();
  }, [isAdmin, today, isGroupView, current]);

  // Check if next week planning has shifts
  useEffect(() => {
    async function checkNextWeek() {
      const mon = getNextWeekMonday();
      const sun = getNextWeekSunday();
      let query = supabase
        .from("shifts")
        .select("id", { count: "exact", head: true })
        .gte("date", mon)
        .lte("date", sun);
      if (!isGroupView && current) {
        query = query.eq("etablissement_id", current.id);
      }
      const { count } = await query;
      setNextWeekHasShifts((count ?? 0) > 0);
    }
    if (isAdmin) checkNextWeek();
  }, [isAdmin, isGroupView, current]);

  const caTotal = (ca?.totalSales ?? 0) + (caPM ?? 0);
  const hasCa = ca || caPM != null;

  // ─── Non-admin: simple dashboard with quick links ───
  if (role && role !== "group_admin") {
    return (
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "grid", gap: 10, marginBottom: 20 }}>
          <QuickTile href="/recettes" title="Recettes" sub="Fiches techniques" accent={T.terracotta} iconName="cuisine" />
          <QuickTile href="/plannings" title="Planning" sub="Planning de la semaine" accent={T.bleu} iconName="planning" />
          <QuickTile href="/mes-shifts" title="Mon planning" sub="Mes shifts" accent={T.dore} iconName="horloge" />
          <QuickTile href="/commandes" title="Commandes" sub="Commandes fournisseurs" accent={T.sauge} iconName="commandes" />
          <QuickTile href="/fournisseurs" title="Fournisseurs" sub="Fiches fournisseurs" accent={T.sauge} iconName="gestion" />
        </div>

        <SectionLabel>Taches du jour</SectionLabel>
        <div style={{ marginBottom: 20 }}>
          <ZoneChecklist />
        </div>

        {events.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <SectionLabel>Evenements a venir</SectionLabel>
            <div style={{ display: "grid", gap: 6 }}>
              {events.map(ev => (
                <div key={ev.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 14px", background: "#fff", borderRadius: 10,
                  border: `1px solid ${T.border}`,
                }}>
                  <span style={{ fontWeight: 700, fontSize: 13, color: T.dark }}>{ev.name}</span>
                  <span style={{ fontSize: 11, color: T.muted }}>
                    {ev.date ? fmtDateShort(ev.date) : "\u2014"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ─── Admin / Direction dashboard ───
  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "16px 16px 40px" }}>

      {/* Alert banner — next week planning not published */}
      {nextWeekHasShifts === false && (
        <div style={{
          background: "#fef3cd", border: "1px solid #f0d78c",
          borderRadius: 12, padding: "12px 16px",
          marginBottom: 16, display: "flex", alignItems: "center", gap: 10,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: "#8a6d1b" }}>
            <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          <span style={{ fontSize: 13, color: "#664d03", fontFamily: "DM Sans, sans-serif", fontWeight: 500 }}>
            Le planning de la semaine prochaine n&apos;est pas encore publie
          </span>
          <Link href="/plannings" style={{
            marginLeft: "auto", fontSize: 11, fontWeight: 700,
            color: "#664d03", textDecoration: "underline", flexShrink: 0,
          }}>Planifier</Link>
        </div>
      )}

      {/* KPI Cards — 4 columns grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        marginBottom: 20,
      }}>
        <KpiCard
          label="En service ce soir"
          value={String(shiftsToday)}
          accent={T.bleu}
        />
        <KpiCard
          label="Taches du jour"
          value={String(pendingCommandes)}
          sub={pendingCommandes > 0 ? "en attente" : undefined}
          accent={T.sauge}
        />
        <KpiCard
          label="CA hier"
          value={caYesterday != null ? `${fmtEur(caYesterday)}\u00A0\u20AC` : "\u2014"}
          accent={T.terracotta}
        />
        <KpiCard
          label="Ratio MS/CA"
          value={"\u2014"}
          sub="bientot"
          accent={T.dore}
        />
      </div>

      {/* CA Groupe (group view) */}
      {isGroupView && hasCa && (
        <div style={{
          background: T.white, border: `1.5px solid ${T.border}`,
          borderRadius: 14, padding: "16px 18px", marginBottom: 16,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p style={{
                margin: 0, fontSize: 9, fontWeight: 700,
                letterSpacing: "0.16em", textTransform: "uppercase",
                color: T.muted, fontFamily: "DM Sans, sans-serif",
              }}>CA Groupe aujourd&apos;hui</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6 }}>
                <span style={{
                  fontSize: 30, fontWeight: 700, color: T.dark,
                  fontFamily: "var(--font-oswald), Oswald, sans-serif", lineHeight: 1,
                }}>
                  {fmtEur(caTotal)} &euro;
                </span>
                {ca && ca.guestsNumber > 0 && (
                  <span style={{ fontSize: 12, color: T.muted }}>{ca.guestsNumber} couv.</span>
                )}
              </div>
            </div>
            <TileIcon name="pilotage" size={22} color={T.ifratelli} />
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.belloMio, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.muted }}>Bello Mio</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.belloMio, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                {fmtEur(ca?.totalSales ?? 0)} &euro;
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: T.piccolaMiaText, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: T.muted }}>Piccola Mia</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.piccolaMiaText, fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>
                {fmtEur(caPM ?? 0)} &euro;
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Taches du jour section */}
      <SectionLabel>Taches du jour</SectionLabel>
      <div style={{ marginBottom: 20 }}>
        {/* Alerts row (commandes + prix) */}
        <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
          {pendingCommandes > 0 && (
            <TaskCard
              href="/commandes"
              icon="commandes"
              title="Commandes en attente"
              subtitle={`${pendingCommandes} commande${pendingCommandes > 1 ? "s" : ""} a valider`}
              accent={T.sauge}
              count={pendingCommandes}
            />
          )}
          {alertCount > 0 && (
            <TaskCard
              href="/variations-prix"
              icon="variations"
              title="Alertes prix"
              subtitle={`${alertCount} variation${alertCount > 1 ? "s" : ""} de prix detectee${alertCount > 1 ? "s" : ""}`}
              accent={T.terracotta}
              count={alertCount}
            />
          )}
        </div>

        {/* Zone checklist */}
        <ZoneChecklist />
      </div>

      {/* Events */}
      {events.length > 0 && (
        <>
          <SectionLabel>Evenements a venir</SectionLabel>
          <Link href="/evenements" style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{
              background: T.white, borderRadius: 14, padding: "14px 16px",
              border: `1.5px solid ${T.border}`,
              marginBottom: 20, cursor: "pointer",
            }}>
              <div style={{ display: "grid", gap: 6 }}>
                {events.map(ev => (
                  <div key={ev.id} style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "8px 12px", background: `${T.violet}08`, borderRadius: 10,
                    border: `1px solid ${T.violet}15`,
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 12, color: T.dark }}>{ev.name}</span>
                    <span style={{ fontSize: 10, color: T.muted, flexShrink: 0 }}>
                      {ev.date ? fmtDateShort(ev.date) : "\u2014"}
                      {ev.covers > 0 ? ` \u00B7 ${ev.covers} couv.` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        </>
      )}

    </div>
  );
}

/* ───────── Zone Checklist ───────── */

type ZoneKey = "cuisine" | "salle" | "sanitaires";

const ZONE_LABELS: Record<ZoneKey, string> = {
  cuisine: "Cuisine",
  salle: "Salle",
  sanitaires: "Sanitaires",
};

const DEFAULT_TASKS: Record<ZoneKey, string[]> = {
  cuisine: [
    "Verifier les DLC",
    "Releve temperatures frigos",
    "Nettoyage plan de travail",
  ],
  salle: [
    "Mise en place couverts",
    "Verifier reservations du soir",
    "Reapprovisionnement bar",
  ],
  sanitaires: [
    "Nettoyage toilettes",
    "Verifier savon/papier",
    "Desinfection surfaces",
  ],
};

const ZONE_KEYS: ZoneKey[] = ["cuisine", "salle", "sanitaires"];

function ZoneChecklist() {
  const [activeZone, setActiveZone] = useState<ZoneKey>("cuisine");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [tasks, setTasks] = useState<Record<ZoneKey, string[]>>(DEFAULT_TASKS);
  const [loaded, setLoaded] = useState(false);

  // Try to load tasks from DB, fallback to defaults
  useEffect(() => {
    async function loadTasks() {
      try {
        const { data, error } = await supabase
          .from("taches")
          .select("id, label, zone")
          .eq("active", true)
          .order("position", { ascending: true });
        if (!error && data && data.length > 0) {
          const grouped: Record<ZoneKey, string[]> = { cuisine: [], salle: [], sanitaires: [] };
          for (const row of data) {
            const z = row.zone as ZoneKey;
            if (grouped[z]) grouped[z].push(row.label);
          }
          // Only use DB tasks if at least one zone has items
          const hasItems = Object.values(grouped).some(arr => arr.length > 0);
          if (hasItems) setTasks(grouped);
        }
      } catch {
        // Table doesn't exist or query failed — use defaults
      }
      setLoaded(true);
    }
    loadTasks();
  }, []);

  const toggleCheck = (key: string) => {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const zoneTasks = tasks[activeZone] ?? [];
  const doneCount = zoneTasks.filter((_, i) => checked[`${activeZone}-${i}`]).length;

  if (!loaded) return null;

  return (
    <div style={{
      background: T.white, borderRadius: 14, padding: "16px 16px 12px",
      border: `1.5px solid ${T.border}`,
    }}>
      {/* Zone tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {ZONE_KEYS.map(zone => {
          const isActive = zone === activeZone;
          return (
            <button
              key={zone}
              type="button"
              onClick={() => setActiveZone(zone)}
              style={{
                padding: "6px 14px",
                borderRadius: 20,
                border: `1.5px solid ${isActive ? T.terracotta : T.border}`,
                background: isActive ? T.terracotta : "transparent",
                color: isActive ? "#fff" : T.dark,
                fontSize: 12, fontWeight: 600,
                fontFamily: "DM Sans, sans-serif",
                cursor: "pointer",
                transition: "all 0.15s",
              }}
            >
              {ZONE_LABELS[zone]}
            </button>
          );
        })}
      </div>

      {/* Counter */}
      <div style={{
        fontSize: 11, color: T.muted, marginBottom: 10,
        fontFamily: "DM Sans, sans-serif", fontWeight: 600,
      }}>
        {doneCount}/{zoneTasks.length} tache{zoneTasks.length > 1 ? "s" : ""} completee{zoneTasks.length > 1 ? "s" : ""}
      </div>

      {/* Task list */}
      <div style={{ display: "grid", gap: 4 }}>
        {zoneTasks.map((task, i) => {
          const key = `${activeZone}-${i}`;
          const done = !!checked[key];
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggleCheck(key)}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", borderRadius: 10,
                background: done ? `${T.sauge}08` : "transparent",
                border: `1px solid ${done ? `${T.sauge}20` : T.border}`,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.15s",
              }}
            >
              {/* Checkbox */}
              <span style={{
                width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                border: `2px solid ${done ? T.sauge : T.border}`,
                background: done ? T.sauge : "transparent",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {done && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                    <path d="M5 13l4 4L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </span>
              <span style={{
                fontSize: 13, fontFamily: "DM Sans, sans-serif",
                color: done ? T.muted : T.dark,
                fontWeight: done ? 400 : 500,
                textDecoration: done ? "line-through" : "none",
                transition: "all 0.15s",
              }}>
                {task}
              </span>
            </button>
          );
        })}
        {zoneTasks.length === 0 && (
          <div style={{
            textAlign: "center", padding: "12px",
            color: T.muted, fontSize: 12,
            fontFamily: "DM Sans, sans-serif",
          }}>
            Aucune tache pour cette zone
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── Shared sub-components ───────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontFamily: "DM Sans, sans-serif", fontSize: 9, fontWeight: 700,
      letterSpacing: "0.18em", textTransform: "uppercase",
      color: T.mutedLight, marginBottom: 10, marginTop: 4,
    }}>{children}</div>
  );
}

function QuickTile({ href, iconName, title, sub, accent }: {
  href: string; iconName: React.ComponentProps<typeof TileIcon>["name"]; title: string; sub: string; accent: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: "none" }}>
      <div style={{
        background: T.white, borderRadius: 14, padding: "14px 16px",
        border: `1.5px solid ${T.border}`,
        borderLeft: `3px solid ${accent}`,
        minHeight: 80, display: "flex", flexDirection: "column",
        justifyContent: "space-between", cursor: "pointer",
        transition: "all 0.2s", boxShadow: T.tileShadow,
      }}>
        <div>
          <div style={{ marginBottom: 6 }}><TileIcon name={iconName} size={18} color={accent} /></div>
          <div style={{
            fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 600,
            fontSize: 13, letterSpacing: "0.08em", textTransform: "uppercase",
            color: accent,
          }}>{title}</div>
          <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 11, color: T.muted, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>
        </div>
      </div>
    </Link>
  );
}
