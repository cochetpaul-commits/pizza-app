"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  actif: boolean;
  date_anciennete: string | null;
  email: string | null;
  tel_mobile: string | null;
  numero_secu: string | null;
  date_naissance: string | null;
  adresse: string | null;
};

type Shift = {
  id: string;
  employe_id: string;
  date: string;
  heure_debut: string;
  heure_fin: string;
  pause_minutes: number;
};

type Absence = {
  id: string;
  employe_id: string;
  type: string;
  date_debut: string;
  date_fin: string;
  statut: string;
};

type Contrat = {
  employe_id: string;
  heures_semaine: number;
  actif: boolean;
  remuneration: number;
};

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8" };
const KPI_CARD: React.CSSProperties = { ...CARD, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 100 };

function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m ?? 0);
}

function fmtH(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.round(Math.abs(minutes) % 60);
  return `${minutes < 0 ? "-" : ""}${h}h${m > 0 ? String(m).padStart(2, "0") : ""}`;
}

export default function PersonnelPage() {
  const { current: etab } = useEtablissement();
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [shiftsPrev, setShiftsPrev] = useState<Shift[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [loading, setLoading] = useState(true);

  // Current week
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const mondayISO = monday.toISOString().slice(0, 10);
  const sundayISO = sunday.toISOString().slice(0, 10);

  // Previous week
  const prevMonday = new Date(monday);
  prevMonday.setDate(monday.getDate() - 7);
  const prevSunday = new Date(monday);
  prevSunday.setDate(monday.getDate() - 1);
  const prevMondayISO = prevMonday.toISOString().slice(0, 10);
  const prevSundayISO = prevSunday.toISOString().slice(0, 10);

  useEffect(() => {
    if (!etab) return;
    let cancelled = false;
    (async () => {
      const [empRes, shiftsRes, shiftsPrevRes, absRes, contratRes] = await Promise.all([
        supabase.from("employes").select("id, prenom, nom, actif, date_anciennete, email, tel_mobile, numero_secu, date_naissance, adresse").eq("etablissement_id", etab.id).order("nom"),
        supabase.from("shifts").select("id, employe_id, date, heure_debut, heure_fin, pause_minutes").eq("etablissement_id", etab.id).gte("date", mondayISO).lte("date", sundayISO),
        supabase.from("shifts").select("id, employe_id, date, heure_debut, heure_fin, pause_minutes").eq("etablissement_id", etab.id).gte("date", prevMondayISO).lte("date", prevSundayISO),
        supabase.from("absences").select("id, employe_id, type, date_debut, date_fin, statut").eq("etablissement_id", etab.id).gte("date_fin", mondayISO).lte("date_debut", sundayISO),
        supabase.from("contrats").select("employe_id, heures_semaine, actif, remuneration").eq("actif", true),
      ]);
      if (!cancelled) {
        setEmployes((empRes.data ?? []) as Employe[]);
        setShifts((shiftsRes.data ?? []) as Shift[]);
        setShiftsPrev((shiftsPrevRes.data ?? []) as Shift[]);
        setAbsences((absRes.data ?? []) as Absence[]);
        setContrats((contratRes.data ?? []) as Contrat[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [etab]); // eslint-disable-line react-hooks/exhaustive-deps

  // KPIs
  const actifs = employes.filter(e => e.actif);
  const totalHeures = useMemo(() => {
    let total = 0;
    for (const s of shifts) {
      let dur = timeToMin(s.heure_fin) - timeToMin(s.heure_debut);
      if (dur < 0) dur += 1440;
      total += (dur - (s.pause_minutes ?? 0));
    }
    return total / 60;
  }, [shifts]);

  const totalHeuresPrev = useMemo(() => {
    let total = 0;
    for (const s of shiftsPrev) {
      let dur = timeToMin(s.heure_fin) - timeToMin(s.heure_debut);
      if (dur < 0) dur += 1440;
      total += (dur - (s.pause_minutes ?? 0));
    }
    return total / 60;
  }, [shiftsPrev]);

  const masseSalariale = useMemo(() => {
    let total = 0;
    for (const emp of actifs) {
      const c = contrats.find(ct => ct.employe_id === emp.id && ct.actif);
      if (c) total += c.remuneration;
    }
    return total;
  }, [actifs, contrats]);

  const congesEnAttente = absences.filter(a => a.statut === "demande").length;
  const absencesSemaine = absences.length;

  // Complétude des fiches
  const ficheCompletude = useMemo(() => {
    let complete = 0;
    for (const emp of actifs) {
      const fields = [emp.prenom, emp.nom, emp.email, emp.tel_mobile, emp.date_naissance, emp.adresse, emp.numero_secu];
      const filled = fields.filter(f => f && f.trim()).length;
      if (filled >= 5) complete++;
    }
    return actifs.length > 0 ? Math.round((complete / actifs.length) * 100) : 0;
  }, [actifs]);

  // Entrées / sorties du mois
  const thisMonth = now.toISOString().slice(0, 7);
  const entrees = employes.filter(e => e.date_anciennete?.startsWith(thisMonth)).length;
  const sorties = employes.filter(e => !e.actif).length; // simplified

  const deltaHeures = totalHeures - totalHeuresPrev;
  const etabColor = etab?.couleur ?? "#e27f57";

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin", "manager"]}>
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
      </RequireRole>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <span style={{ width: 12, height: 12, borderRadius: "50%", background: etabColor }} />
          <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>
            Personnel — {etab?.nom ?? ""}
          </h1>
        </div>

        {/* KPIs row 1 */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 16 }}>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Heures planifiées</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{fmtH(totalHeures * 60)}</div>
            <div style={{ fontSize: 11, color: deltaHeures >= 0 ? "#2D6A4F" : "#DC2626", fontWeight: 600, marginTop: 4 }}>
              {deltaHeures >= 0 ? "+" : ""}{fmtH(deltaHeures * 60)} vs S-1
            </div>
          </div>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Masse salariale</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>{masseSalariale.toLocaleString("fr-FR")} €</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{actifs.length} salarié{actifs.length > 1 ? "s" : ""} actif{actifs.length > 1 ? "s" : ""}</div>
          </div>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Congés en attente</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: congesEnAttente > 0 ? "#D4775A" : "#2D6A4F" }}>{congesEnAttente}</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{absencesSemaine} absence{absencesSemaine > 1 ? "s" : ""} cette semaine</div>
          </div>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Fiches complètes</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: ficheCompletude >= 80 ? "#2D6A4F" : ficheCompletude >= 50 ? "#D4775A" : "#DC2626" }}>{ficheCompletude}%</div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>{actifs.length} profil{actifs.length > 1 ? "s" : ""}</div>
          </div>
        </div>

        {/* KPIs row 2 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Entrées du mois</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#2D6A4F" }}>{entrees}</div>
          </div>
          <div style={KPI_CARD}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 6 }}>Productivité semaine</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a" }}>
              {actifs.length > 0 ? `${(totalHeures / actifs.length).toFixed(1)}h` : "—"}
            </div>
            <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>par salarié</div>
          </div>
        </div>

        {/* Quick links */}
        <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Accès rapide</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Planning", href: "/plannings", icon: "📅", desc: "Gérer les shifts de la semaine" },
            { label: "Employés", href: "/rh/equipe", icon: "👥", desc: `${actifs.length} salarié${actifs.length > 1 ? "s" : ""} actif${actifs.length > 1 ? "s" : ""}` },
            { label: "Pointage", href: "/rh/pointage", icon: "⏱️", desc: "Heures réelles et pointages" },
            { label: "Congés", href: "/rh/conges", icon: "🌴", desc: `${congesEnAttente} demande${congesEnAttente > 1 ? "s" : ""} en attente` },
            { label: "Émargement", href: "/rh/emargement", icon: "✍️", desc: "Feuilles de présence" },
            { label: "Rapport de paie", href: "/rh/rapports", icon: "📊", desc: "Bilans et exports" },
            { label: "Simulation", href: "/rh/masse-salariale", icon: "📈", desc: "Masse salariale prévisionnelle" },
          ].map(link => (
            <Link key={link.href} href={link.href} style={{
              ...CARD, textDecoration: "none", display: "flex", alignItems: "center", gap: 12,
              transition: "border-color 0.12s",
            }}>
              <span style={{ fontSize: 24 }}>{link.icon}</span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{link.label}</div>
                <div style={{ fontSize: 11, color: "#999" }}>{link.desc}</div>
              </div>
            </Link>
          ))}
        </div>

        {/* Recent absences */}
        {absences.length > 0 && (
          <div style={CARD}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Absences cette semaine</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Salarié</th>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Début</th>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Fin</th>
                  <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {absences.slice(0, 10).map(a => {
                  const emp = employes.find(e => e.id === a.employe_id);
                  return (
                    <tr key={a.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                      <td style={{ padding: "8px 0", fontWeight: 500 }}>{emp ? `${emp.prenom} ${emp.nom}` : "—"}</td>
                      <td style={{ padding: "8px 0" }}>{a.type.replace("_", " ")}</td>
                      <td style={{ padding: "8px 0" }}>{new Date(a.date_debut).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "8px 0" }}>{new Date(a.date_fin).toLocaleDateString("fr-FR")}</td>
                      <td style={{ padding: "8px 0" }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: a.statut === "approuve" ? "#2D6A4F" : a.statut === "refuse" ? "#DC2626" : "#D4775A" }}>
                          {a.statut === "approuve" ? "Approuvé" : a.statut === "refuse" ? "Refusé" : "En attente"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
