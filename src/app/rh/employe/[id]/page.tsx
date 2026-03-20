"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import Image from "next/image";
import { PERM_SECTIONS, DEFAULT_PERMS, ROLE_INFO, mapToPermRole, type PermRole } from "@/lib/permissions";

/* ── Types ─────────────────────────────────────────────────────── */

type Contrat = {
  id: string;
  type: string;
  date_debut: string;
  date_fin: string | null;
  date_fin_essai: string | null;
  remuneration: number;
  emploi: string | null;
  qualification: string | null;
  heures_semaine: number;
  jours_semaine: number;
  actif: boolean;
  statut: string | null;
};

type ContratElement = {
  id: string;
  contrat_id: string;
  type: string;
  libelle: string;
  montant: number | null;
  code_silae: string | null;
  date_debut: string | null;
  date_fin: string | null;
};

type Absence = {
  id: string;
  date_debut: string;
  date_fin: string;
  type: string;
  nb_jours: number | null;
  statut: string;
  note: string | null;
};

type Shift = {
  employe_id: string;
  date: string;
  start_time: string;
  end_time: string;
};

type MainTab = "infos" | "dossier" | "acces" | "roles";
type DossierSubTab = "perso" | "contrats" | "temps" | "conges" | "notes" | "primes" | "dispo";

/* ── Constants ─────────────────────────────────────────────────── */

const CONTRAT_LABELS: Record<string, string> = {
  CDI: "CDI", CDD: "CDD", extra: "Extra", interim: "Interim",
  apprenti: "Apprenti", stagiaire: "Stagiaire", TNS: "TNS",
};

const ABSENCE_LABELS: Record<string, string> = {
  CP: "Conges payes", maladie: "Maladie", RTT: "RTT",
  absence_injustifiee: "Absence injustifiee", ferie: "Ferie",
  repos_compensateur: "Repos compensateur", formation: "Formation",
  evenement_familial: "Evenement familial",
};

const ABSENCE_COLORS: Record<string, { bg: string; fg: string }> = {
  CP: { bg: "#e8ede6", fg: "#4a6741" },
  maladie: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
  RTT: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  absence_injustifiee: { bg: "#FFF3E0", fg: "#E65100" },
  ferie: { bg: "#F3E5F5", fg: "#7B1FA2" },
  repos_compensateur: { bg: "#E0F7FA", fg: "#00695C" },
  formation: { bg: "#e8e0d0", fg: "#999" },
  evenement_familial: { bg: "#FCE4EC", fg: "#AD1457" },
};

const ELEMENT_LABELS: Record<string, string> = {
  prime: "Prime", transport: "Transport",
  acompte: "Acompte", mutuelle_dispense: "Dispense mutuelle",
};

/* ── Completion fields ─────────────────────────────────────────── */

const COMPLETION_FIELDS = [
  "prenom", "nom", "email", "tel_mobile", "date_naissance",
  "adresse", "code_postal", "ville", "nationalite", "numero_secu",
  "genre", "iban", "contact_urgence_tel",
] as const;

/* ── Component ─────────────────────────────────────────────────── */

export default function EmployeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("infos");
  const [dossierSub, setDossierSub] = useState<DossierSubTab>("perso");

  // ── Employee fields ──
  const [emp, setEmp] = useState<Record<string, unknown>>({});
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [initiales, setInitiales] = useState("");
  const [email, setEmail] = useState("");
  const [telMobile, setTelMobile] = useState("");
  const [telFixe, setTelFixe] = useState("");
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [genre, setGenre] = useState("");
  const [dateNaissance, setDateNaissance] = useState("");
  const [lieuNaissance, setLieuNaissance] = useState("");
  const [deptNaissance, setDeptNaissance] = useState("");
  const [nationalite, setNationalite] = useState("France");
  const [situationFamiliale, setSituationFamiliale] = useState("");
  const [nbPersonnesCharge, setNbPersonnesCharge] = useState(0);
  const [contactUrgPrenom, setContactUrgPrenom] = useState("");
  const [contactUrgNom, setContactUrgNom] = useState("");
  const [contactUrgLien, setContactUrgLien] = useState("");
  const [contactUrgTel, setContactUrgTel] = useState("");
  const [numeroSecu, setNumeroSecu] = useState("");
  const [handicap, setHandicap] = useState(false);
  const [typeHandicap, setTypeHandicap] = useState("");
  const [dateVisiteMedicale, setDateVisiteMedicale] = useState("");
  const [visiteRenforcee, setVisiteRenforcee] = useState(false);
  const [prochaineVisite, setProchaineVisite] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [titulaireCompte, setTitulaireCompte] = useState("");
  const [matricule, setMatricule] = useState("");
  const [dateAnciennete, setDateAnciennete] = useState("");
  const [travailleurEtranger, setTravailleurEtranger] = useState(false);
  const [actif, setActif] = useState(true);
  const [photoUrl, setPhotoUrl] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");

  // ── Related data ──
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [elements, setElements] = useState<ContratElement[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // ── Contrat modal ──
  const [showContratModal, setShowContratModal] = useState(false);
  const [editContratId, setEditContratId] = useState<string | null>(null);
  const [cType, setCType] = useState("CDI");
  const [cDebut, setCDebut] = useState("");
  const [cFin, setCFin] = useState("");
  const [cRemuneration, setCRemuneration] = useState(0);
  const [cEmploi, setCEmploi] = useState("");
  const [cQualification, setCQualification] = useState("");
  const [cHeures, setCHeures] = useState(39);
  const [cJours, setCJours] = useState(5);
  const [cActif, setCActif] = useState(true);

  // ── Absence modal ──
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [aType, setAType] = useState("CP");
  const [aDebut, setADebut] = useState("");
  const [aFin, setAFin] = useState("");
  const [aNbJours, setANbJours] = useState<number | "">("");
  const [aNote, setANote] = useState("");

  // ── Salary visibility ──
  const [showSalary, setShowSalary] = useState(false);

  /* ── Completion % ── */
  const completionPct = useMemo(() => {
    const values: Record<string, unknown> = {
      prenom, nom, email, tel_mobile: telMobile, date_naissance: dateNaissance,
      adresse, code_postal: codePostal, ville, nationalite, numero_secu: numeroSecu,
      genre, iban, contact_urgence_tel: contactUrgTel,
    };
    let filled = 0;
    for (const k of COMPLETION_FIELDS) {
      if (values[k]) filled++;
    }
    return Math.round((filled / COMPLETION_FIELDS.length) * 100);
  }, [prenom, nom, email, telMobile, dateNaissance, adresse, codePostal, ville, nationalite, numeroSecu, genre, iban, contactUrgTel]);

  /* ── Load ── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: empData } = await supabase
        .from("employes")
        .select("*")
        .eq("id", id)
        .single();

      if (cancelled || !empData) { setLoading(false); return; }
      setEmp(empData);

      setPrenom(empData.prenom ?? "");
      setNom(empData.nom ?? "");
      setInitiales(empData.initiales ?? "");
      setEmail(empData.email ?? "");
      setTelMobile(empData.tel_mobile ?? "");
      setTelFixe(empData.tel_fixe ?? "");
      setAdresse(empData.adresse ?? "");
      setCodePostal(empData.code_postal ?? "");
      setVille(empData.ville ?? "");
      setGenre(empData.genre ?? "");
      setDateNaissance(empData.date_naissance ?? "");
      setLieuNaissance(empData.lieu_naissance ?? "");
      setDeptNaissance(empData.departement_naissance ?? "");
      setNationalite(empData.nationalite ?? "France");
      setSituationFamiliale(empData.situation_familiale ?? "");
      setNbPersonnesCharge(empData.nb_personnes_charge ?? 0);
      setContactUrgPrenom(empData.contact_urgence_prenom ?? "");
      setContactUrgNom(empData.contact_urgence_nom ?? "");
      setContactUrgLien(empData.contact_urgence_lien ?? "");
      setContactUrgTel(empData.contact_urgence_tel ?? "");
      setNumeroSecu(empData.numero_secu ?? "");
      setHandicap(empData.handicap ?? false);
      setTypeHandicap(empData.type_handicap ?? "");
      setDateVisiteMedicale(empData.date_visite_medicale ?? "");
      setVisiteRenforcee(empData.visite_renforcee ?? false);
      setProchaineVisite(empData.prochaine_visite_medicale ?? "");
      setIban(empData.iban ?? "");
      setBic(empData.bic ?? "");
      setTitulaireCompte(empData.titulaire_compte ?? "");
      setMatricule(empData.matricule ?? "");
      setDateAnciennete(empData.date_anciennete ?? "");
      setTravailleurEtranger(empData.travailleur_etranger ?? false);
      setActif(empData.actif ?? true);
      setPhotoUrl(empData.photo_url ?? "");
      setRole(empData.role ?? "");
      setNote(empData.note ?? "");

      // Load related
      const [contratsRes, absRes, shiftsRes] = await Promise.all([
        supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false }),
        supabase.from("absences").select("*").eq("employe_id", id).order("date_debut", { ascending: false }),
        supabase.from("shifts").select("*").eq("employe_id", id).order("date", { ascending: false }).limit(200),
      ]);

      if (cancelled) return;
      const cList = contratsRes.data ?? [];
      setContrats(cList);
      setAbsences(absRes.data ?? []);
      setShifts(shiftsRes.data ?? []);

      // Load elements for all contrats
      if (cList.length > 0) {
        const cIds = cList.map((c) => c.id);
        const { data: elems } = await supabase
          .from("contrat_elements")
          .select("*")
          .in("contrat_id", cIds)
          .order("created_at", { ascending: true });
        if (!cancelled) setElements(elems ?? []);
      }

      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  /* ── Save employee ── */
  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveOk(false);

    const payload: Record<string, unknown> = {
      prenom, nom, email: email || null,
      tel_mobile: telMobile || null, tel_fixe: telFixe || null,
      adresse: adresse || null, code_postal: codePostal || null, ville: ville || null,
      genre: genre || null, date_naissance: dateNaissance || null,
      lieu_naissance: lieuNaissance || null, departement_naissance: deptNaissance || null,
      nationalite: nationalite || null, situation_familiale: situationFamiliale || null,
      nb_personnes_charge: nbPersonnesCharge,
      contact_urgence_prenom: contactUrgPrenom || null,
      contact_urgence_nom: contactUrgNom || null,
      contact_urgence_lien: contactUrgLien || null,
      contact_urgence_tel: contactUrgTel || null,
      numero_secu: numeroSecu || null,
      handicap, type_handicap: typeHandicap || null,
      date_visite_medicale: dateVisiteMedicale || null,
      visite_renforcee: visiteRenforcee,
      prochaine_visite_medicale: prochaineVisite || null,
      iban: iban || null, bic: bic || null, titulaire_compte: titulaireCompte || null,
      matricule: matricule || null, date_anciennete: dateAnciennete || null,
      travailleur_etranger: travailleurEtranger, actif,
    };

    // Only include note if the column exists (graceful handling)
    try {
      payload.note = note || null;
    } catch { /* ignore */ }

    const { error } = await supabase
      .from("employes")
      .update(payload)
      .eq("id", id);

    setSaving(false);
    if (error) { alert("Erreur : " + error.message); return; }
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 2000);
  };

  /* ── Archive employee ── */
  const handleArchive = async () => {
    if (!id) return;
    if (!confirm("Archiver cet employe ? Il sera marque comme inactif.")) return;
    const { error } = await supabase.from("employes").update({ actif: false }).eq("id", id);
    if (error) { alert("Erreur : " + error.message); return; }
    setActif(false);
  };

  /* ── Save contrat ── */
  const handleSaveContrat = async () => {
    if (!id) return;
    setSaving(true);

    const payload = {
      employe_id: id,
      type: cType,
      date_debut: cDebut,
      date_fin: cFin || null,
      remuneration: cRemuneration,
      emploi: cEmploi || null,
      qualification: cQualification || null,
      heures_semaine: cHeures,
      jours_semaine: cJours,
      actif: cActif,
    };

    if (editContratId) {
      await supabase.from("contrats").update(payload).eq("id", editContratId);
    } else {
      await supabase.from("contrats").insert(payload);
    }

    // Reload contrats
    const { data } = await supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false });
    setContrats(data ?? []);
    setShowContratModal(false);
    setEditContratId(null);
    setSaving(false);
  };

  /* ── Terminate contrat ── */
  const handleTerminateContrat = async (contratId: string) => {
    if (!confirm("Terminer ce contrat ? La date de fin sera fixee a aujourd'hui.")) return;
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("contrats").update({ actif: false, date_fin: today }).eq("id", contratId);
    const { data } = await supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false });
    setContrats(data ?? []);
  };

  /* ── Save absence ── */
  const handleSaveAbsence = async () => {
    if (!id || !etab) return;
    setSaving(true);

    await supabase.from("absences").insert({
      employe_id: id,
      etablissement_id: etab.id,
      type: aType,
      date_debut: aDebut,
      date_fin: aFin || aDebut,
      nb_jours: aNbJours || null,
      note: aNote || null,
    });

    const { data } = await supabase.from("absences").select("*").eq("employe_id", id).order("date_debut", { ascending: false });
    setAbsences(data ?? []);
    setShowAbsenceModal(false);
    setAType("CP");
    setADebut("");
    setAFin("");
    setANbJours("");
    setANote("");
    setSaving(false);
  };

  /* ── Delete absence ── */
  const deleteAbsence = async (absId: string) => {
    if (!confirm("Supprimer cette absence ?")) return;
    await supabase.from("absences").delete().eq("id", absId);
    setAbsences((prev) => prev.filter((a) => a.id !== absId));
  };

  /* ── Open contrat edit ── */
  const openEditContrat = (c: Contrat) => {
    setEditContratId(c.id);
    setCType(c.type);
    setCDebut(c.date_debut);
    setCFin(c.date_fin ?? "");
    setCRemuneration(c.remuneration);
    setCEmploi(c.emploi ?? "");
    setCQualification(c.qualification ?? "");
    setCHeures(c.heures_semaine);
    setCJours(c.jours_semaine);
    setCActif(c.actif);
    setShowContratModal(true);
  };

  const openNewContrat = () => {
    setEditContratId(null);
    setCType("CDI");
    setCDebut(new Date().toISOString().slice(0, 10));
    setCFin("");
    setCRemuneration(0);
    setCEmploi("");
    setCQualification("");
    setCHeures(39);
    setCJours(5);
    setCActif(true);
    setShowContratModal(true);
  };

  /* ── Computed: weekly hours from shifts ── */
  const weeklyHours = useMemo(() => {
    if (shifts.length === 0) return [];
    const byWeek: Record<string, number> = {};
    for (const s of shifts) {
      try {
        const d = new Date(s.date + "T00:00:00");
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        const weekKey = monday.toISOString().slice(0, 10);

        const [sh, sm] = (s.start_time || "").split(":").map(Number);
        const [eh, em] = (s.end_time || "").split(":").map(Number);
        if (!isNaN(sh) && !isNaN(eh)) {
          let hours = (eh + em / 60) - (sh + sm / 60);
          if (hours < 0) hours += 24;
          byWeek[weekKey] = (byWeek[weekKey] ?? 0) + hours;
        }
      } catch { /* skip malformed */ }
    }
    return Object.entries(byWeek)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([week, hours]) => ({ week, hours: Math.round(hours * 100) / 100 }));
  }, [shifts]);

  /* ── CP / RC counters ── */
  const cpCount = useMemo(() => {
    return absences.filter(a => a.type === "CP").reduce((sum, a) => sum + (a.nb_jours ?? 0), 0);
  }, [absences]);
  const rcCount = useMemo(() => {
    return absences.filter(a => a.type === "repos_compensateur").reduce((sum, a) => sum + (a.nb_jours ?? 0), 0);
  }, [absences]);

  /* ── Role label ── */
  const roleLabel = useMemo(() => {
    const r = role || (emp as Record<string, unknown>)?.role as string || "";
    if (r === "admin" || r === "group_admin") return "Administrateur";
    if (r === "direction" || r === "manager") return "Manager";
    return "Employe";
  }, [role, emp]);

  /* ── Avatar color from name ── */
  const avatarColor = useMemo(() => {
    const colors = ["#D4775A", "#5A8FD4", "#6B9E5A", "#9B6BD4", "#D4A55A", "#5AD4C3"];
    const hash = (prenom + nom).split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return colors[hash % colors.length];
  }, [prenom, nom]);

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
      </RequireRole>
    );
  }

  const activeContrat = contrats.find((c) => c.actif);
  const initDisplay = initiales || ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={pageStyle}>
        {/* ── Back link ── */}
        <a href="/settings/employes" style={{ fontSize: 13, color: "#1a1a1a", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
          Retour a la liste des employes
        </a>

        {/* ── Combo-style colored header ── */}
        <div style={{
          background: `linear-gradient(135deg, ${etab?.couleur ?? "#2D6A4F"} 0%, ${etab?.couleur ?? "#2D6A4F"}cc 100%)`,
          borderRadius: "14px 14px 0 0", padding: "20px 24px 0", color: "#fff",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, flexShrink: 0, color: "#fff",
            }}>
              {initDisplay}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 22, fontWeight: 700, color: "#fff", margin: 0 }}>
                  {prenom} {nom.toUpperCase()}
                </h1>
                <span style={{
                  padding: "2px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
                  background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.3)",
                }}>
                  {roleLabel}
                </span>
              </div>
              {activeContrat?.emploi && (
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 2 }}>{activeContrat.emploi}</div>
              )}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {canWrite && (
                <button type="button" onClick={handleSave} disabled={saving} style={{
                  ...saveBtnStyle, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
                }}>
                  {saving ? "..." : saveOk ? "OK" : "Sauvegarder"}
                </button>
              )}
              {canWrite && actif && (
                <button type="button" onClick={handleArchive} style={{
                  ...archiveBtnStyle, background: "transparent", border: "1px solid rgba(255,255,255,0.3)", color: "#fff",
                }}>
                  Archiver
                </button>
              )}
            </div>
          </div>

          {/* Contract info band */}
          <div style={{
            display: "flex", gap: 24, marginTop: 16, padding: "10px 0",
            borderTop: "1px solid rgba(255,255,255,0.15)",
            fontSize: 11, color: "rgba(255,255,255,0.7)",
          }}>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Debut du contrat</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>
                {activeContrat?.date_debut ? new Date(activeContrat.date_debut).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Fin du contrat</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>
                {activeContrat?.date_fin ? new Date(activeContrat.date_fin).toLocaleDateString("fr-FR") : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Type de contrat</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>{activeContrat?.type ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Etablissement</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>{etab?.nom ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Equipe</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>{((emp as Record<string, unknown>).equipes_access as string[] ?? [])[0] ?? "—"}</div>
            </div>
          </div>
        </div>

        {/* ── 6 Tabs ── */}
        <div style={{ ...tabsRow, background: "#fff", borderRadius: "0 0 14px 14px", marginBottom: 16, borderTop: "none" }}>
          {([
            ["infos", "Informations personnelles"],
            ["dossier", "Contrats"],
            ["acces", "Temps et planification"],
            ["roles", "Role et permissions"],
          ] as [MainTab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMainTab(key)}
              style={tabBtn(mainTab === key)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ═══ TAB: INFORMATIONS GENERALES ═══ */}
        {mainTab === "infos" && (
          <>
            <div style={section}>
              <p style={sectionTitle}>Identite</p>
              <div style={grid2}>
                <Field label="Prenom" value={prenom} onChange={setPrenom} disabled={!canWrite} />
                <Field label="Nom" value={nom} onChange={setNom} disabled={!canWrite} />
              </div>
              <div style={grid2}>
                <Field label="Email" type="email" value={email} onChange={setEmail} disabled={!canWrite} />
                <Field label="Telephone" value={telMobile} onChange={setTelMobile} disabled={!canWrite} />
              </div>
              <Field label="Telephone fixe" value={telFixe} onChange={setTelFixe} disabled={!canWrite} />
            </div>

            <div style={section}>
              <p style={sectionTitle}>Poste</p>
              <div style={grid2}>
                <Field label="Matricule" value={matricule} onChange={setMatricule} disabled={!canWrite} />
                <Field label="Date anciennete" type="date" value={dateAnciennete} onChange={setDateAnciennete} disabled={!canWrite} />
              </div>
              {activeContrat && (
                <div style={grid3}>
                  <div><span style={miniLabel}>Type contrat</span><br />{CONTRAT_LABELS[activeContrat.type] ?? activeContrat.type}</div>
                  <div><span style={miniLabel}>Emploi</span><br />{activeContrat.emploi ?? "---"}</div>
                  <div><span style={miniLabel}>Heures/sem</span><br />{activeContrat.heures_semaine}h</div>
                </div>
              )}
            </div>

            <div style={section}>
              <p style={sectionTitle}>Coordonnees bancaires</p>
              <Field label="IBAN" value={iban} onChange={setIban} disabled={!canWrite} />
              <div style={grid2}>
                <Field label="BIC" value={bic} onChange={setBic} disabled={!canWrite} />
                <Field label="Titulaire du compte" value={titulaireCompte} onChange={setTitulaireCompte} disabled={!canWrite} />
              </div>
            </div>

            <div style={section}>
              <p style={sectionTitle}>Sante</p>
              <div style={grid2}>
                <Field label="Date visite medicale" type="date" value={dateVisiteMedicale} onChange={setDateVisiteMedicale} disabled={!canWrite} />
                <Field label="Prochaine visite" type="date" value={prochaineVisite} onChange={setProchaineVisite} disabled={!canWrite} />
              </div>
              <div style={{ display: "flex", gap: 20, marginTop: 8 }}>
                <Checkbox label="Visite renforcee" checked={visiteRenforcee} onChange={setVisiteRenforcee} disabled={!canWrite} />
                <Checkbox label="Handicap" checked={handicap} onChange={setHandicap} disabled={!canWrite} />
                <Checkbox label="Travailleur etranger" checked={travailleurEtranger} onChange={setTravailleurEtranger} disabled={!canWrite} />
              </div>
              {handicap && (
                <Field label="Type de handicap" value={typeHandicap} onChange={setTypeHandicap} disabled={!canWrite} />
              )}
            </div>

            <div style={section}>
              <p style={sectionTitle}>Statut</p>
              <Checkbox label="Employe actif" checked={actif} onChange={setActif} disabled={!canWrite} />
            </div>
          </>
        )}

        {/* ═══ TAB: DOSSIER RH ═══ */}
        {mainTab === "dossier" && (
          <>
            {/* Sub-tabs (pill style) */}
            <div style={subTabsRow}>
              {([
                ["perso", "Infos personnelles"],
                ["contrats", "Contrats"],
                ["temps", "Temps travailles"],
                ["conges", "Conges"],
                ["notes", "Notes & documents"],
                ["primes", "Primes & avances"],
                ["dispo", "Disponibilite"],
              ] as [DossierSubTab, string][]).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setDossierSub(key)}
                  style={subTabPill(dossierSub === key)}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* ─── SUB: Informations personnelles ─── */}
            {dossierSub === "perso" && (
              <>
                <div style={section}>
                  <p style={sectionTitle}>Etat civil</p>
                  <div style={grid3}>
                    <FieldSelect label="Genre" value={genre} onChange={setGenre} disabled={!canWrite}
                      options={[["", "---"], ["H", "Homme"], ["F", "Femme"]]}
                      tag="DPAE" />
                    <Field label="Date de naissance" type="date" value={dateNaissance} onChange={setDateNaissance} disabled={!canWrite} tag="DPAE" />
                    <Field label="Nationalite" value={nationalite} onChange={setNationalite} disabled={!canWrite} tag="DPAE" />
                  </div>
                  <div style={grid2}>
                    <Field label="Lieu de naissance" value={lieuNaissance} onChange={setLieuNaissance} disabled={!canWrite} tag="DPAE" />
                    <Field label="Dept. naissance" value={deptNaissance} onChange={setDeptNaissance} disabled={!canWrite} tag="DPAE" />
                  </div>
                  <Field label="Numero securite sociale" value={numeroSecu} onChange={setNumeroSecu} disabled={!canWrite} tag="DPAE" />
                  <div style={grid2}>
                    <FieldSelect label="Situation familiale" value={situationFamiliale} onChange={setSituationFamiliale} disabled={!canWrite}
                      options={[["", "---"], ["celibataire", "Celibataire"], ["marie", "Marie(e)"], ["pacse", "Pacse(e)"], ["divorce", "Divorce(e)"], ["veuf", "Veuf(ve)"]]} />
                    <Field label="Personnes a charge" type="number" value={String(nbPersonnesCharge)} onChange={(v) => setNbPersonnesCharge(Number(v) || 0)} disabled={!canWrite} />
                  </div>
                </div>

                <div style={section}>
                  <p style={sectionTitle}>Adresse</p>
                  <Field label="Adresse" value={adresse} onChange={setAdresse} disabled={!canWrite} tag="DPAE" />
                  <div style={grid2}>
                    <Field label="Code postal" value={codePostal} onChange={setCodePostal} disabled={!canWrite} tag="DPAE" />
                    <Field label="Ville" value={ville} onChange={setVille} disabled={!canWrite} tag="DPAE" />
                  </div>
                </div>

                <div style={section}>
                  <p style={sectionTitle}>Contact d&apos;urgence</p>
                  <div style={grid2}>
                    <Field label="Prenom" value={contactUrgPrenom} onChange={setContactUrgPrenom} disabled={!canWrite} tag="RUP" />
                    <Field label="Nom" value={contactUrgNom} onChange={setContactUrgNom} disabled={!canWrite} tag="RUP" />
                  </div>
                  <div style={grid2}>
                    <Field label="Lien" value={contactUrgLien} onChange={setContactUrgLien} disabled={!canWrite} placeholder="Conjoint, parent..." />
                    <Field label="Telephone" value={contactUrgTel} onChange={setContactUrgTel} disabled={!canWrite} tag="RUP" />
                  </div>
                </div>

                <div style={section}>
                  <p style={sectionTitle}>Note interne</p>
                  <textarea
                    style={{ ...inputSt, minHeight: 80, resize: "vertical" }}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    disabled={!canWrite}
                    placeholder="Notes internes sur l'employe..."
                  />
                </div>
              </>
            )}

            {/* ─── SUB: Contrats ─── */}
            {dossierSub === "contrats" && (
              <>
                {canWrite && (
                  <div style={{ marginBottom: 12, display: "flex", gap: 8 }}>
                    <button type="button" onClick={openNewContrat} style={addBtnStyle}>+ Nouveau contrat</button>
                    <button type="button" onClick={() => alert("Generation de contrat : fonctionnalite a venir")} style={{ ...addBtnStyle, borderColor: "#999", color: "#999", background: "transparent" }}>
                      Generer contrat
                    </button>
                  </div>
                )}

                {contrats.length === 0 ? (
                  <div style={{ ...section, textAlign: "center", color: "#999" }}>Aucun contrat</div>
                ) : contrats.map((c) => {
                  const cElems = elements.filter((e) => e.contrat_id === c.id);
                  return (
                    <div key={c.id} style={{ ...section, borderLeft: c.actif ? "3px solid #e27f57" : "3px solid #ddd6c8" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={contratPill(c.type)}>{CONTRAT_LABELS[c.type] ?? c.type}</span>
                          {c.actif && <span style={{ fontSize: 11, fontWeight: 700, color: "#4a6741" }}>ACTIF</span>}
                          {!c.actif && <span style={{ fontSize: 11, color: "#bbb" }}>Termine</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {canWrite && c.actif && (
                            <button type="button" onClick={() => handleTerminateContrat(c.id)} style={{ ...editBtnSmall, color: "#DC2626", borderColor: "rgba(220,38,38,0.3)" }}>
                              Terminer
                            </button>
                          )}
                          {canWrite && (
                            <button type="button" onClick={() => openEditContrat(c)} style={editBtnSmall}>Modifier</button>
                          )}
                        </div>
                      </div>

                      <div style={grid3}>
                        <div><span style={miniLabel}>Debut</span><br />{fmtDate(c.date_debut)}</div>
                        <div><span style={miniLabel}>Fin</span><br />{c.date_fin ? fmtDate(c.date_fin) : "---"}</div>
                        <div>
                          <span style={miniLabel}>
                            Remuneration brute
                            <button type="button" onClick={() => setShowSalary(!showSalary)} style={eyeBtn}>
                              {showSalary ? "masquer" : "voir"}
                            </button>
                          </span>
                          <br />{showSalary ? `${c.remuneration.toLocaleString("fr-FR")} EUR` : "****"}
                        </div>
                      </div>
                      <div style={{ ...grid3, marginTop: 8 }}>
                        <div><span style={miniLabel}>Emploi</span><br />{c.emploi ?? "---"}</div>
                        <div><span style={miniLabel}>Qualification</span><br />{c.qualification ?? "---"}</div>
                        <div><span style={miniLabel}>Heures/sem</span><br />{c.heures_semaine}h / {c.jours_semaine}j</div>
                      </div>

                      {cElems.length > 0 && (
                        <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                          <span style={{ ...miniLabel, marginBottom: 6, display: "block" }}>Elements</span>
                          {cElems.map((el) => (
                            <div key={el.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                              <span>{ELEMENT_LABELS[el.type] ?? el.type} --- {el.libelle}</span>
                              <span style={{ fontWeight: 700 }}>{el.montant != null ? `${el.montant.toLocaleString("fr-FR")} EUR` : "---"}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}

            {/* ─── SUB: Temps travailles ─── */}
            {dossierSub === "temps" && (
              <div style={section}>
                <p style={sectionTitle}>Heures par semaine</p>
                {weeklyHours.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#999", padding: 20 }}>Aucun shift enregistre</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Semaine du</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Heures</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Heures sup.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeklyHours.map((w) => {
                        const contractHours = activeContrat?.heures_semaine ?? 35;
                        const overtime = Math.max(0, w.hours - contractHours);
                        return (
                          <tr key={w.week} style={{ borderBottom: "1px solid #f0ebe3" }}>
                            <td style={{ padding: "6px 8px" }}>{fmtDate(w.week)}</td>
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 600 }}>
                              {w.hours.toFixed(1)}h
                            </td>
                            <td style={{ padding: "6px 8px", textAlign: "right", color: overtime > 0 ? "#e27f57" : "#999" }}>
                              {overtime > 0 ? `+${overtime.toFixed(1)}h` : "---"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ─── SUB: Conges ─── */}
            {dossierSub === "conges" && (
              <>
                <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={counterCard}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>CP pris</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{cpCount}j</span>
                  </div>
                  <div style={counterCard}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5 }}>RC pris</span>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), 'Oswald', sans-serif" }}>{rcCount}j</span>
                  </div>
                </div>

                {canWrite && (
                  <div style={{ marginBottom: 12 }}>
                    <button type="button" onClick={() => {
                      setADebut(new Date().toISOString().slice(0, 10));
                      setAFin("");
                      setAType("CP");
                      setANbJours("");
                      setANote("");
                      setShowAbsenceModal(true);
                    }} style={addBtnStyle}>+ Nouvelle absence</button>
                  </div>
                )}

                {absences.length === 0 ? (
                  <div style={{ ...section, textAlign: "center", color: "#999" }}>Aucune absence enregistree</div>
                ) : (
                  <div style={section}>
                    {absences.map((a) => {
                      const c = ABSENCE_COLORS[a.type] ?? { bg: "#e8e0d0", fg: "#999" };
                      return (
                        <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #f0ebe3" }}>
                          <div>
                            <span style={{ ...absencePill, background: c.bg, color: c.fg }}>
                              {ABSENCE_LABELS[a.type] ?? a.type}
                            </span>
                            <span style={{ fontSize: 13, marginLeft: 10, color: "#6f6a61" }}>
                              {fmtDate(a.date_debut)}
                              {a.date_fin !== a.date_debut && ` -> ${fmtDate(a.date_fin)}`}
                            </span>
                            {a.nb_jours != null && (
                              <span style={{ fontSize: 12, marginLeft: 8, color: "#999" }}>{a.nb_jours}j</span>
                            )}
                            {a.note && <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{a.note}</div>}
                          </div>
                          {canWrite && (
                            <button type="button" onClick={() => deleteAbsence(a.id)} style={{ ...editBtnSmall, color: "#DC2626", borderColor: "rgba(220,38,38,0.3)" }}>Suppr.</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {/* ─── SUB: Notes et documents ─── */}
            {dossierSub === "notes" && (
              <div style={section}>
                <p style={sectionTitle}>Notes internes</p>
                <textarea
                  style={{ ...inputSt, minHeight: 120, resize: "vertical" }}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={!canWrite}
                  placeholder="Notes internes, observations, remarques..."
                />

                <p style={{ ...sectionTitle, marginTop: 20 }}>Documents</p>
                <div style={placeholderBox}>
                  <span style={{ color: "#999" }}>Zone de depot de fichiers (a venir)</span>
                  <button type="button" disabled style={{ ...addBtnStyle, opacity: 0.5, cursor: "default", marginTop: 10 }}>
                    + Ajouter un document
                  </button>
                </div>
              </div>
            )}

            {/* ─── SUB: Primes et avances ─── */}
            {dossierSub === "primes" && (
              <div style={section}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <p style={{ ...sectionTitle, margin: 0 }}>Primes & avances</p>
                  <button type="button" onClick={() => alert("Ajout de prime : fonctionnalite a venir")} style={addBtnStyle}>
                    + Ajouter
                  </button>
                </div>

                {elements.length === 0 ? (
                  <div style={{ textAlign: "center", color: "#999", padding: 20 }}>Aucune prime ou avance enregistree</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Type</th>
                        <th style={thStyle}>Libelle</th>
                        <th style={{ ...thStyle, textAlign: "right" }}>Montant</th>
                        <th style={thStyle}>Periode</th>
                      </tr>
                    </thead>
                    <tbody>
                      {elements.map((el) => (
                        <tr key={el.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "6px 8px" }}>
                            <span style={{ ...absencePill, background: "#f6eedf", color: "#e27f57" }}>
                              {ELEMENT_LABELS[el.type] ?? el.type}
                            </span>
                          </td>
                          <td style={{ padding: "6px 8px" }}>{el.libelle}</td>
                          <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 700 }}>
                            {el.montant != null ? `${el.montant.toLocaleString("fr-FR")} EUR` : "---"}
                          </td>
                          <td style={{ padding: "6px 8px", color: "#999" }}>
                            {el.date_debut ? fmtDate(el.date_debut) : ""}
                            {el.date_fin ? ` -> ${fmtDate(el.date_fin)}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* ─── SUB: Disponibilite ─── */}
            {dossierSub === "dispo" && (
              <div style={section}>
                <p style={sectionTitle}>Disponibilite</p>
                <div style={placeholderBox}>
                  <span style={{ color: "#999" }}>Gestion des creneaux de disponibilite (a venir)</span>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 14, width: "100%" }}>
                    {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map(day => (
                      <div key={day} style={{ background: "#f6eedf", borderRadius: 8, padding: "10px 12px", textAlign: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#6f6a61" }}>{day}</span>
                        <div style={{ fontSize: 11, color: "#999", marginTop: 4 }}>---</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ TAB: ACCES ═══ */}
        {/* ═══ TAB: Role et Permissions ═══ */}
        {mainTab === "roles" && (() => {
          const empRole = mapToPermRole((emp as Record<string, unknown>)?.role as string ?? "employe");
          const perms = DEFAULT_PERMS[empRole] ?? DEFAULT_PERMS.employe;
          const customPerms: Record<string, boolean> = ((emp as Record<string, unknown>)?.custom_permissions as Record<string, boolean>) ?? {};

          const changeRole = async (newRole: PermRole) => {
            const dbRole = newRole === "admin" ? "group_admin" : newRole === "manager" ? "manager" : "employe";
            await supabase.from("employes").update({ role: dbRole, custom_permissions: {} }).eq("id", emp.id);
            setEmp((prev: Record<string, unknown>) => ({ ...prev, role: dbRole, custom_permissions: {} }));
          };

          const togglePerm = async (key: string, currentOn: boolean) => {
            const next = { ...customPerms, [key]: !currentOn };
            await supabase.from("employes").update({ custom_permissions: next }).eq("id", emp.id);
            setEmp((prev: Record<string, unknown>) => ({ ...prev, custom_permissions: next }));
          };

          const CheckIcon = () => (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" opacity="0.15" /><polyline points="9 12 11.5 14.5 15 9.5" />
            </svg>
          );
          const XIcon = () => (
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6">
              <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
            </svg>
          );

          return (
            <div style={section}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                <span style={{ fontSize: 17, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Role et Permissions</span>
              </div>

              {/* 3 Role cards */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 }}>
                {(["employe", "manager", "admin"] as PermRole[]).map(r => {
                  const info = ROLE_INFO[r];
                  const active = empRole === r;
                  return (
                    <button key={r} type="button" onClick={() => changeRole(r)} style={{
                      padding: 16, borderRadius: 12, cursor: "pointer", textAlign: "left",
                      border: active ? `2px solid ${info.color}` : "1px solid #ddd6c8",
                      background: active ? info.bg : "#fff",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: "50%",
                          border: active ? `5px solid ${info.color}` : "2px solid #ddd6c8",
                          background: active ? info.color : "#fff",
                        }} />
                        <span style={{ fontSize: 14, fontWeight: 700, color: active ? info.color : "#1a1a1a" }}>{info.label}</span>
                      </div>
                      <p style={{ fontSize: 11, color: "#666", lineHeight: 1.4, margin: 0 }}>{info.description}</p>
                    </button>
                  );
                })}
              </div>

              {/* Permission matrix with functional toggles */}
              {PERM_SECTIONS.map(sec => (
                <div key={sec.label} style={{ marginBottom: 12 }}>
                  <div style={{ padding: "8px 12px", background: "#faf7f2", borderRadius: 6, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#1a1a1a" }}>{sec.label}</span>
                  </div>
                  {sec.permissions.map(p => {
                    const defaultVal = perms[p.key];
                    const isToggle = defaultVal === "toggle";
                    const isOn = isToggle ? (customPerms[p.key] ?? false) : defaultVal === true;

                    return (
                      <div key={p.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #f0ebe3" }}>
                        <span style={{ fontSize: 13, color: "#1a1a1a" }}>{p.label}</span>
                        <span style={{ flexShrink: 0, marginLeft: 12 }}>
                          {isToggle ? (
                            <button type="button" onClick={() => togglePerm(p.key, isOn)} style={{
                              width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                              background: isOn ? "#2D6A4F" : "#ddd6c8", position: "relative",
                            }}>
                              <span style={{
                                position: "absolute", top: 2, left: isOn ? 20 : 2,
                                width: 18, height: 18, borderRadius: "50%", background: "#fff",
                                transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                              }} />
                            </button>
                          ) : defaultVal === true ? <CheckIcon /> : <XIcon />}
                        </span>
                      </div>
                    );
                  })}
                </div>
              ))}

              {/* Delete account */}
              <div style={{ marginTop: 24, padding: "16px 12px", borderTop: "1px solid #f0ebe3", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Supprimer le compte employe</div>
                  <div style={{ fontSize: 11, color: "#999" }}>Effacer definitivement l&apos;employe de votre etablissement.</div>
                </div>
                <button type="button" onClick={async () => {
                  if (!confirm("Supprimer definitivement cet employe ? Cette operation est irreversible.")) return;
                  await supabase.from("employes").delete().eq("id", emp.id);
                  window.location.href = "/settings/employes";
                }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Supprimer le compte
                </button>
              </div>
            </div>
          );
        })()}

        {mainTab === "acces" && (
          <>
            <div style={section}>
              <p style={sectionTitle}>Code PIN</p>
              <p style={{ fontSize: 13, color: "#6f6a61", margin: "0 0 12px" }}>
                Le code PIN est utilise pour pointer sur le terminal.
              </p>
              <div style={{ maxWidth: 200 }}>
                <Field label="Code PIN" value={(emp as Record<string, unknown>)?.pin_code as string ?? ""} onChange={() => {}} disabled placeholder="----" />
              </div>
            </div>

            <div style={section}>
              <p style={sectionTitle}>Invitation</p>
              <p style={{ fontSize: 13, color: "#6f6a61", margin: "0 0 12px" }}>
                Envoyer une invitation par email pour acceder a l&apos;application.
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" onClick={async () => {
                  if (!email) return;
                  const { data: { session } } = await supabase.auth.getSession();
                  const res = await fetch("/api/admin/invite", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
                    },
                    body: JSON.stringify({ email, displayName: `${(emp as Record<string, unknown>).prenom} ${(emp as Record<string, unknown>).nom}`, role: (emp as Record<string, unknown>).role ?? "employe" }),
                  });
                  if (res.ok) alert("Invitation envoyee a " + email);
                  else alert("Erreur: " + (await res.text()));
                }} style={addBtnStyle} disabled={!email}>
                  Envoyer une invitation
                </button>
              </div>
              {!email && <p style={{ fontSize: 12, color: "#e27f57", marginTop: 6 }}>Ajoutez un email pour pouvoir envoyer une invitation.</p>}
            </div>
          </>
        )}
      </div>

      {/* ═══ MODAL: Contrat ═══ */}
      {showContratModal && (
        <div style={overlayStyle} onClick={() => setShowContratModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>{editContratId ? "Modifier le contrat" : "Nouveau contrat"}</h2>

            <div style={grid2}>
              <div style={fieldRow}>
                <label style={labelSt}>Type *</label>
                <select style={inputSt} value={cType} onChange={(e) => setCType(e.target.value)}>
                  {Object.entries(CONTRAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Remuneration brute</label>
                <input type="number" style={inputSt} value={cRemuneration} onChange={(e) => setCRemuneration(Number(e.target.value))} />
              </div>
            </div>

            <div style={grid2}>
              <div style={fieldRow}>
                <label style={labelSt}>Date debut *</label>
                <input type="date" style={inputSt} value={cDebut} onChange={(e) => setCDebut(e.target.value)} />
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Date fin</label>
                <input type="date" style={inputSt} value={cFin} onChange={(e) => setCFin(e.target.value)} />
              </div>
            </div>

            <div style={fieldRow}>
              <label style={labelSt}>Emploi</label>
              <input style={inputSt} value={cEmploi} onChange={(e) => setCEmploi(e.target.value)} placeholder="Pizzaiolo, Serveur..." />
            </div>

            <div style={fieldRow}>
              <label style={labelSt}>Qualification</label>
              <input style={inputSt} value={cQualification} onChange={(e) => setCQualification(e.target.value)} />
            </div>

            <div style={grid2}>
              <div style={fieldRow}>
                <label style={labelSt}>Heures / semaine</label>
                <input type="number" style={inputSt} value={cHeures} onChange={(e) => setCHeures(Number(e.target.value))} />
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Jours / semaine</label>
                <input type="number" style={inputSt} value={cJours} onChange={(e) => setCJours(Number(e.target.value))} />
              </div>
            </div>

            <Checkbox label="Contrat actif" checked={cActif} onChange={setCActif} />

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowContratModal(false)} style={cancelBtn}>Annuler</button>
              <button type="button" onClick={handleSaveContrat} disabled={saving || !cDebut} style={{ ...saveBtnStyle, opacity: saving || !cDebut ? 0.5 : 1 }}>
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Absence ═══ */}
      {showAbsenceModal && (
        <div style={overlayStyle} onClick={() => setShowAbsenceModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Nouvelle absence</h2>

            <div style={fieldRow}>
              <label style={labelSt}>Type</label>
              <select style={inputSt} value={aType} onChange={(e) => setAType(e.target.value)}>
                {Object.entries(ABSENCE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>

            <div style={grid2}>
              <div style={fieldRow}>
                <label style={labelSt}>Date debut</label>
                <input type="date" style={inputSt} value={aDebut} onChange={(e) => setADebut(e.target.value)} />
              </div>
              <div style={fieldRow}>
                <label style={labelSt}>Date fin</label>
                <input type="date" style={inputSt} value={aFin} onChange={(e) => setAFin(e.target.value)} />
              </div>
            </div>

            <div style={fieldRow}>
              <label style={labelSt}>Nb jours</label>
              <input type="number" style={inputSt} value={aNbJours} onChange={(e) => setANbJours(e.target.value ? Number(e.target.value) : "")} />
            </div>

            <div style={fieldRow}>
              <label style={labelSt}>Note</label>
              <input style={inputSt} value={aNote} onChange={(e) => setANote(e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setShowAbsenceModal(false)} style={cancelBtn}>Annuler</button>
              <button type="button" onClick={handleSaveAbsence} disabled={saving || !aDebut} style={{ ...saveBtnStyle, opacity: saving || !aDebut ? 0.5 : 1 }}>
                {saving ? "..." : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </RequireRole>
  );
}

/* ── Reusable field components ─────────────────────────────────── */

function Field({ label, value, onChange, type = "text", disabled = false, placeholder, tag }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; disabled?: boolean; placeholder?: string; tag?: string;
}) {
  return (
    <div style={fieldRow}>
      <label style={labelSt}>
        {label}
        {tag && <span style={tagStyle(tag)}>{tag}</span>}
      </label>
      <input
        type={type}
        style={{ ...inputSt, opacity: disabled ? 0.6 : 1 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
      />
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, disabled = false, tag }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; disabled?: boolean; tag?: string;
}) {
  return (
    <div style={fieldRow}>
      <label style={labelSt}>
        {label}
        {tag && <span style={tagStyle(tag)}>{tag}</span>}
      </label>
      <select style={{ ...inputSt, opacity: disabled ? 0.6 : 1 }} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        {options.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
    </div>
  );
}

function Checkbox({ label, checked, onChange, disabled = false }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#1a1a1a", cursor: disabled ? "default" : "pointer", marginTop: 6 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      {label}
    </label>
  );
}

/* ── Helpers ── */

function fmtDate(d: string) {
  if (!d) return "---";
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "16px 16px 60px",
};

const headerCard: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: 16,
  background: "#fff",
  borderRadius: 10,
  border: "1px solid #ddd6c8",
  padding: "20px 22px",
  marginBottom: 16,
};

const avatarLarge: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  background: "#D4775A",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  flexShrink: 0,
};

const avatarImg: React.CSSProperties = {
  width: 56,
  height: 56,
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
};

const nameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
};

const rolePill: React.CSSProperties = {
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 8,
  fontSize: 11,
  fontWeight: 700,
  background: "#f6eedf",
  color: "#e27f57",
};

const contratPill = (type: string): React.CSSProperties => {
  const colors: Record<string, { bg: string; fg: string }> = {
    CDI: { bg: "#e8ede6", fg: "#4a6741" },
    CDD: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
    extra: { bg: "#FFF3E0", fg: "#E65100" },
    interim: { bg: "#F3E5F5", fg: "#7B1FA2" },
    apprenti: { bg: "#E0F7FA", fg: "#00695C" },
    stagiaire: { bg: "#e8e0d0", fg: "#999" },
  };
  const c = colors[type] ?? { bg: "#e8e0d0", fg: "#999" };
  return { display: "inline-block", padding: "2px 10px", borderRadius: 8, fontSize: 12, fontWeight: 700, background: c.bg, color: c.fg };
};

const statutPill = (actif: boolean): React.CSSProperties => ({
  display: "inline-block", padding: "2px 10px", borderRadius: 8, fontSize: 11, fontWeight: 700,
  background: actif ? "#e8ede6" : "#f0f0f0", color: actif ? "#4a6741" : "#bbb",
});

const completionBarBg: React.CSSProperties = {
  width: 120,
  height: 6,
  borderRadius: 3,
  background: "#f0ebe3",
  overflow: "hidden",
};

const completionBarFill: React.CSSProperties = {
  height: "100%",
  borderRadius: 3,
  background: "#e27f57",
  transition: "width 0.3s ease",
};

const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 16,
  borderBottom: "1px solid #ddd6c8",
  paddingBottom: 0,
};

const tabBtn = (active: boolean): React.CSSProperties => ({
  padding: "8px 16px",
  border: "none",
  borderBottom: active ? "2px solid #e27f57" : "2px solid transparent",
  background: "none",
  color: active ? "#e27f57" : "#999",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "flex",
  alignItems: "center",
  gap: 6,
});

const subTabsRow: React.CSSProperties = {
  display: "flex",
  gap: 6,
  marginBottom: 16,
  flexWrap: "wrap",
};

const subTabPill = (active: boolean): React.CSSProperties => ({
  padding: "6px 14px",
  borderRadius: 20,
  border: active ? "1px solid #e27f57" : "1px solid #ddd6c8",
  background: active ? "rgba(226,127,87,0.10)" : "#fff",
  color: active ? "#e27f57" : "#6f6a61",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
});

const section: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 10,
  padding: "16px 18px 20px",
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  color: "#e27f57",
  textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const grid2: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 14px" };
const grid3: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 14px" };

const fieldRow: React.CSSProperties = { marginBottom: 10 };

const labelSt: React.CSSProperties = {
  display: "block", fontSize: 11, fontWeight: 700, color: "#6f6a61",
  marginBottom: 3, letterSpacing: 0.3,
};

const inputSt: React.CSSProperties = {
  width: "100%", padding: "7px 10px", borderRadius: 8,
  border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
  outline: "none", boxSizing: "border-box", fontFamily: "inherit",
};

const miniLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5,
};

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", height: 32, padding: "0 16px",
  borderRadius: 6, border: "none", background: "#e27f57", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};

const archiveBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", height: 28, padding: "0 12px",
  borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", color: "#999",
  fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 6, border: "1px solid #ddd6c8",
  background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const addBtnStyle: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 6, border: "1px solid #e27f57",
  background: "rgba(226,127,87,0.08)", color: "#e27f57",
  fontSize: 13, fontWeight: 700, cursor: "pointer",
};

const editBtnSmall: React.CSSProperties = {
  padding: "3px 10px", borderRadius: 6, border: "1px solid #ddd6c8",
  background: "#fff", color: "#6f6a61", fontSize: 11, fontWeight: 600, cursor: "pointer",
};

const eyeBtn: React.CSSProperties = {
  marginLeft: 6, padding: "0 4px", border: "none", background: "none",
  color: "#e27f57", fontSize: 10, fontWeight: 600, cursor: "pointer", textDecoration: "underline",
};

const absencePill: React.CSSProperties = {
  display: "inline-block", padding: "2px 10px", borderRadius: 8,
  fontSize: 12, fontWeight: 700,
};

const counterCard: React.CSSProperties = {
  flex: 1, background: "#fff", border: "1px solid #ddd6c8", borderRadius: 10,
  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 4,
};

const placeholderBox: React.CSSProperties = {
  background: "#f6eedf", borderRadius: 10, padding: "24px 20px",
  display: "flex", flexDirection: "column", alignItems: "center",
  textAlign: "center",
};

const thStyle: React.CSSProperties = {
  textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700,
  color: "#999", textTransform: "uppercase", letterSpacing: 0.5,
  borderBottom: "1px solid #ddd6c8",
};

const tagStyle = (tag: string): React.CSSProperties => ({
  marginLeft: 6, padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
  background: tag === "DPAE" ? "rgba(37,99,235,0.10)" : "rgba(226,127,87,0.10)",
  color: tag === "DPAE" ? "#2563eb" : "#e27f57",
  verticalAlign: "middle",
});

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
  display: "flex", alignItems: "center", justifyContent: "center",
  zIndex: 200, padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#fff", borderRadius: 16, padding: 28,
  width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto",
  boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
};

const modalTitle: React.CSSProperties = {
  margin: "0 0 20px", fontSize: 20, fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a",
};
