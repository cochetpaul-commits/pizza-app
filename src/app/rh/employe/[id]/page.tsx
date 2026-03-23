"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  heure_debut: string;
  heure_fin: string;
  pause_minutes: number;
  start_time?: string;
  end_time?: string;
};

type MainTab = "infos" | "dossier" | "acces" | "conges" | "documents" | "roles";


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
  const { current: etab, etablissements } = useEtablissement();
  const [empEtab, setEmpEtab] = useState<{ id: string; nom: string; couleur: string } | null>(null);
  const { canWrite } = useProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>("infos");
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  

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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [photoUrl, setPhotoUrl] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");

  // ── Related data ──
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [elements, setElements] = useState<ContratElement[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);

  // ── Absence modal ──
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [absType, setAbsType] = useState("conge_paye");
  const [absDebut, setAbsDebut] = useState(new Date().toISOString().slice(0, 10));
  const [absFin, setAbsFin] = useState(new Date().toISOString().slice(0, 10));
  const [absDebutPeriode, setAbsDebutPeriode] = useState<"matin" | "apres_midi">("matin");
  const [absFinPeriode, setAbsFinPeriode] = useState<"matin" | "apres_midi">("apres_midi");
  const [absNote, setAbsNote] = useState("");

  // ── Prime modal ──
  const [showPrimeModal, setShowPrimeModal] = useState(false);
  const [primeType, setPrimeType] = useState("");
  const [primeMontant, setPrimeMontant] = useState(0);
  const [primeDate, setPrimeDate] = useState(new Date().toISOString().slice(0, 10));

  // ── Transport modal ──
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [transportDispositif, setTransportDispositif] = useState("");

  // ── Disponibilites modal ──
  const [showDispoModal, setShowDispoModal] = useState(false);

  // ── Planification modal ──
  const [showPlanifModal, setShowPlanifModal] = useState(false);

  // ── Avenant modal ──
  const [showAvenantModal, setShowAvenantModal] = useState(false);
  const [avenantStep, setAvenantStep] = useState(1);
  const [avenantType, setAvenantType] = useState<"permanent" | "ponctuel">("permanent");
  const [avenantChanges, setAvenantChanges] = useState<string[]>([]);
  const [avenantDate, setAvenantDate] = useState(new Date().toISOString().slice(0, 10));
  const [avenantHeures, setAvenantHeures] = useState(0);
  const [avenantSalaire, setAvenantSalaire] = useState(0);

  // ── Contrat modal ──
  const [contratTab, setContratTab] = useState<"contrat" | "paie">("contrat");
  const [contratEquipes, setContratEquipes] = useState<string[]>([]);
  const [contratManagers, setContratManagers] = useState<{ id: string; label: string }[]>([]);
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
  const [cSmic, setCSmic] = useState(false);

  // ── Old absence modal (legacy) ──
  const [aType, setAType] = useState("CP");
  const [aDebut, setADebut] = useState("");
  const [aFin, setAFin] = useState("");
  const [aNbJours, setANbJours] = useState<number | "">("");
  const [aNote, setANote] = useState("");

  // ── Salary visibility ──
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

      // Load employee's establishment for correct color
      if (empData.etablissement_id) {
        const { data: etabData } = await supabase.from("etablissements").select("id, nom, couleur").eq("id", empData.etablissement_id).single();
        if (etabData && !cancelled) setEmpEtab(etabData as { id: string; nom: string; couleur: string });
      }

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

    // Also update employee rattachement if changed
    const newEtabId = (document.getElementById("contrat-etab") as HTMLSelectElement)?.value;
    const newEquipe = (document.getElementById("contrat-equipe") as HTMLSelectElement)?.value;
    const empUpdates: Record<string, unknown> = {};
    if (newEtabId && newEtabId !== (emp as Record<string, unknown>).etablissement_id) {
      empUpdates.etablissement_id = newEtabId;
    }
    if (newEquipe) {
      const currentAccess = ((emp as Record<string, unknown>).equipes_access as string[]) ?? [];
      if (!currentAccess.includes(newEquipe)) {
        empUpdates.equipes_access = [newEquipe, ...currentAccess];
      } else if (currentAccess[0] !== newEquipe) {
        // Move to first position (default)
        empUpdates.equipes_access = [newEquipe, ...currentAccess.filter(e => e !== newEquipe)];
      }
    }
    if (Object.keys(empUpdates).length > 0) {
      await supabase.from("employes").update(empUpdates).eq("id", id);
      setEmp((prev: Record<string, unknown>) => ({ ...prev, ...empUpdates }));
      // Reload empEtab if establishment changed
      if (empUpdates.etablissement_id) {
        const { data: etabData } = await supabase.from("etablissements").select("id, nom, couleur").eq("id", empUpdates.etablissement_id).single();
        if (etabData) setEmpEtab(etabData as { id: string; nom: string; couleur: string });
      }
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

  /* ── Load equipes + managers for contrat modal ── */
  const loadContratEquipes = async () => {
    const etabId = (emp as Record<string, unknown>).etablissement_id as string;
    if (!etabId) return;
    const [eqRes, mgrRes] = await Promise.all([
      supabase.from("equipes").select("nom").eq("etablissement_id", etabId).eq("actif", true).order("nom"),
      supabase.from("employes").select("id, prenom, nom, role").eq("etablissement_id", etabId).eq("actif", true).in("role", ["group_admin", "manager", "admin", "direction"]).order("nom"),
    ]);
    if (eqRes.data) setContratEquipes(eqRes.data.map((e: { nom: string }) => e.nom));
    if (mgrRes.data) setContratManagers(mgrRes.data.map((e: { id: string; prenom: string; nom: string }) => ({ id: e.id, label: `${e.prenom} ${e.nom}` })));
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
    setCSmic(false);
    setContratTab("contrat");
    loadContratEquipes();
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
    setCSmic(false);
    setContratTab("contrat");
    loadContratEquipes();
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
          background: (() => {
            const r = (emp as Record<string, unknown>).role as string ?? "employe";
            // Administrateur = couleur iFratelli group #b45f57
            if (r === "group_admin" || r === "proprietaire" || r === "admin") return `linear-gradient(135deg, #b45f57 0%, #8a4842 100%)`;
            // Employé + Manager = couleur du restaurant de l'employé
            const c = empEtab?.couleur ?? etab?.couleur ?? "#e27f57";
            // Fallback si couleur est le défaut Supabase #D4775A
            const finalColor = (c === "#D4775A" && empEtab?.nom?.toLowerCase().includes("piccola")) ? "#efd199" : c;
            return `linear-gradient(135deg, ${finalColor} 0%, ${finalColor}cc 100%)`;
          })(),
          borderRadius: 14, padding: "20px 24px 0", color: "#fff",
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
              {/* Supervise X personnes */}
              <div style={{ marginTop: 6, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ padding: "2px 10px", borderRadius: 12, background: "rgba(255,255,255,0.15)", fontSize: 11, color: "rgba(255,255,255,0.9)", display: "flex", alignItems: "center", gap: 4 }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>
                  Supervise {((emp as Record<string, unknown>).equipes_access as string[] ?? []).length > 0 ? "son equipe" : "—"}
                </span>
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
                  {completionPct}% {completionPct === 100 ? "complet" : "incomplet"}
                </span>
              </div>
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
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>{empEtab?.nom ?? etab?.nom ?? "—"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Equipe</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>{((emp as Record<string, unknown>).equipes_access as string[] ?? []).join(", ") || "—"}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>Responsable hierarchique</div>
              <div style={{ color: "#fff", fontSize: 12, marginTop: 2 }}>—</div>
            </div>
          </div>
        </div>

        {/* Completion bar */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0" }}>
          <div style={completionBarBg}>
            <div style={{ ...completionBarFill, width: `${completionPct}%` }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: completionPct === 100 ? "#4a6741" : "#e27f57" }}>
            {completionPct}% {completionPct === 100 ? "Complet" : "Incomplet"}
          </span>
        </div>

        {/* ── Tabs — separated from header ── */}
        <div style={{ ...tabsRow, marginBottom: 16 }}>
          {([
            ["infos", "Informations personnelles"],
            ["dossier", "Contrats"],
            ["acces", "Temps et planification"],
            ["conges", "Conges et Absences"],
            ["documents", "Documents"],
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
            <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 16 }}>Informations personnelles</h2>

            {/* 2-column layout */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {/* Left: Etat civil */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(45,106,79,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Etat civil</span>
                </div>
                <FieldSelect label="Genre" value={genre} onChange={setGenre} disabled={!canWrite}
                  options={[["", "— Sélectionner —"], ["M", "Homme"], ["F", "Femme"]]} />
                <Field label="Prénom" value={prenom} onChange={setPrenom} disabled={!canWrite} />
                <Field label="Nom de naissance" value={nom} onChange={setNom} disabled={!canWrite} />
                <Field label="Nationalite" value={nationalite} onChange={setNationalite} disabled={!canWrite} />
                <Field label="Date de naissance" type="date" value={dateNaissance} onChange={setDateNaissance} disabled={!canWrite} />
                <Field label="Lieu de naissance" value={lieuNaissance} onChange={setLieuNaissance} disabled={!canWrite} />
                <FieldSelect label="Département de naissance" value={deptNaissance} onChange={setDeptNaissance} disabled={!canWrite}
                  options={[["", "Sélectionnez..."],
                    ["01", "01 - Ain"], ["02", "02 - Aisne"], ["03", "03 - Allier"], ["04", "04 - Alpes-de-Haute-Provence"], ["05", "05 - Hautes-Alpes"],
                    ["06", "06 - Alpes-Maritimes"], ["07", "07 - Ardèche"], ["08", "08 - Ardennes"], ["09", "09 - Ariège"], ["10", "10 - Aube"],
                    ["11", "11 - Aude"], ["12", "12 - Aveyron"], ["13", "13 - Bouches-du-Rhône"], ["14", "14 - Calvados"], ["15", "15 - Cantal"],
                    ["16", "16 - Charente"], ["17", "17 - Charente-Maritime"], ["18", "18 - Cher"], ["19", "19 - Corrèze"], ["2A", "2A - Corse-du-Sud"],
                    ["2B", "2B - Haute-Corse"], ["21", "21 - Côte-d'Or"], ["22", "22 - Côtes-d'Armor"], ["23", "23 - Creuse"], ["24", "24 - Dordogne"],
                    ["25", "25 - Doubs"], ["26", "26 - Drôme"], ["27", "27 - Eure"], ["28", "28 - Eure-et-Loir"], ["29", "29 - Finistère"],
                    ["30", "30 - Gard"], ["31", "31 - Haute-Garonne"], ["32", "32 - Gers"], ["33", "33 - Gironde"], ["34", "34 - Hérault"],
                    ["35", "35 - Ille-et-Vilaine"], ["36", "36 - Indre"], ["37", "37 - Indre-et-Loire"], ["38", "38 - Isère"], ["39", "39 - Jura"],
                    ["40", "40 - Landes"], ["41", "41 - Loir-et-Cher"], ["42", "42 - Loire"], ["43", "43 - Haute-Loire"], ["44", "44 - Loire-Atlantique"],
                    ["45", "45 - Loiret"], ["46", "46 - Lot"], ["47", "47 - Lot-et-Garonne"], ["48", "48 - Lozère"], ["49", "49 - Maine-et-Loire"],
                    ["50", "50 - Manche"], ["51", "51 - Marne"], ["52", "52 - Haute-Marne"], ["53", "53 - Mayenne"], ["54", "54 - Meurthe-et-Moselle"],
                    ["55", "55 - Meuse"], ["56", "56 - Morbihan"], ["57", "57 - Moselle"], ["58", "58 - Nièvre"], ["59", "59 - Nord"],
                    ["60", "60 - Oise"], ["61", "61 - Orne"], ["62", "62 - Pas-de-Calais"], ["63", "63 - Puy-de-Dôme"], ["64", "64 - Pyrénées-Atlantiques"],
                    ["65", "65 - Hautes-Pyrénées"], ["66", "66 - Pyrénées-Orientales"], ["67", "67 - Bas-Rhin"], ["68", "68 - Haut-Rhin"], ["69", "69 - Rhône"],
                    ["70", "70 - Haute-Saône"], ["71", "71 - Saône-et-Loire"], ["72", "72 - Sarthe"], ["73", "73 - Savoie"], ["74", "74 - Haute-Savoie"],
                    ["75", "75 - Paris"], ["76", "76 - Seine-Maritime"], ["77", "77 - Seine-et-Marne"], ["78", "78 - Yvelines"],
                    ["79", "79 - Deux-Sèvres"], ["80", "80 - Somme"], ["81", "81 - Tarn"], ["82", "82 - Tarn-et-Garonne"],
                    ["83", "83 - Var"], ["84", "84 - Vaucluse"], ["85", "85 - Vendée"], ["86", "86 - Vienne"], ["87", "87 - Haute-Vienne"],
                    ["88", "88 - Vosges"], ["89", "89 - Yonne"], ["90", "90 - Territoire de Belfort"],
                    ["91", "91 - Essonne"], ["92", "92 - Hauts-de-Seine"], ["93", "93 - Seine-Saint-Denis"], ["94", "94 - Val-de-Marne"], ["95", "95 - Val-d'Oise"],
                    ["971", "971 - Guadeloupe"], ["972", "972 - Martinique"], ["973", "973 - Guyane"], ["974", "974 - La Réunion"], ["976", "976 - Mayotte"],
                  ]} />
                <FieldSelect label="Situation familiale" value={situationFamiliale} onChange={setSituationFamiliale} disabled={!canWrite}
                  options={[["", "Sélectionnez..."], ["celibataire", "Célibataire"], ["marie", "Marié(e)"], ["pacse", "Pacsé(e)"], ["divorce", "Divorcé(e)"], ["veuf", "Veuf/Veuve"], ["separe", "Séparé(e)"], ["concubinage", "Concubinage"]]} />
                <Field label="Nb personnes a charge" type="number" value={String(nbPersonnesCharge)} onChange={(v) => setNbPersonnesCharge(Number(v))} disabled={!canWrite} />
              </div>

              {/* Right: Coordonnees + Contact urgence */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></svg>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Coordonnees</span>
                  </div>
                  <Field label="Email" type="email" value={email} onChange={setEmail} disabled={!canWrite} />
                  <Field label="Tel. mobile" value={telMobile} onChange={setTelMobile} disabled={!canWrite} />
                  <Field label="Tel. fixe" value={telFixe} onChange={setTelFixe} disabled={!canWrite} />
                  <Field label="Adresse" value={adresse} onChange={setAdresse} disabled={!canWrite} />
                  <Field label="Code postal" value={codePostal} onChange={setCodePostal} disabled={!canWrite} />
                  <Field label="Ville" value={ville} onChange={setVille} disabled={!canWrite} />
                </div>

                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                    </span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Contact d&apos;urgence</span>
                  </div>
                  <Field label="Prenom" value={contactUrgPrenom} onChange={setContactUrgPrenom} disabled={!canWrite} />
                  <Field label="Nom" value={contactUrgNom} onChange={setContactUrgNom} disabled={!canWrite} />
                  <Field label="Lien" value={contactUrgLien} onChange={setContactUrgLien} disabled={!canWrite} />
                  <Field label="Tel. mobile" value={contactUrgTel} onChange={setContactUrgTel} disabled={!canWrite} />
                </div>
              </div>
            </div>

            {/* Infos professionnelles */}
            <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(160,132,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Informations professionnelles</span>
              </div>
              <div style={grid2}>
                <Field label="Date d'anciennete" type="date" value={dateAnciennete} onChange={setDateAnciennete} disabled={!canWrite} />
                <Field label="Matricule" value={matricule} onChange={setMatricule} disabled={!canWrite} />
              </div>
            </div>

            {/* Bancaire */}
            <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(160,132,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="2"><rect x="1" y="5" width="22" height="16" rx="2" /><path d="M1 10h22" /></svg>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Informations administratives et bancaires</span>
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", marginBottom: 12, fontSize: 12, color: "#666" }}>
                Depuis le 27 decembre 2022, le salaire doit imperativement etre verse sur un compte bancaire dont le collaborateur est titulaire ou co-titulaire.
              </div>
              <Field label="Nom du titulaire du compte" value={titulaireCompte} onChange={setTitulaireCompte} disabled={!canWrite} />
              <Field label="IBAN" value={iban} onChange={setIban} disabled={!canWrite} />
              <Field label="BIC" value={bic} onChange={setBic} disabled={!canWrite} />
            </div>

            {/* Medical */}
            <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Informations medicales</span>
              </div>
              <div style={{ padding: 10, borderRadius: 8, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", marginBottom: 12, fontSize: 12, color: "#2563eb" }}>
                Le numero doit comporter 15 chiffres et commencer par 1 ou 2. Si le numero commence par 7 ou 8, il s&apos;agit d&apos;un NIA (numero provisoire).
              </div>
              <Field label="Numero de Securite sociale" value={numeroSecu} onChange={setNumeroSecu} disabled={!canWrite} />
              <Checkbox label="Personne en situation de handicap" checked={handicap} onChange={setHandicap} disabled={!canWrite} />
              {handicap && <Field label="Type de handicap" value={typeHandicap} onChange={setTypeHandicap} disabled={!canWrite} />}
              <div style={grid2}>
                <Field label="Date derniere visite medicale" type="date" value={dateVisiteMedicale} onChange={setDateVisiteMedicale} disabled={!canWrite} />
                <Field label="Prochaine visite medicale" type="date" value={prochaineVisite} onChange={setProchaineVisite} disabled={!canWrite} />
              </div>
              <Checkbox label="Visite medicale renforcee" checked={visiteRenforcee} onChange={setVisiteRenforcee} disabled={!canWrite} />
            </div>

            {/* Autorisations de travail */}
            <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(123,31,162,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#7B1FA2" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
                </span>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Autorisations de travail</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 14, color: "#1a1a1a" }}>Travailleur etranger avec autorisation de travail</span>
                <button type="button" onClick={() => setTravailleurEtranger(!travailleurEtranger)} disabled={!canWrite} style={{
                  width: 40, height: 22, borderRadius: 11, border: "none", cursor: canWrite ? "pointer" : "default",
                  background: travailleurEtranger ? "#2D6A4F" : "#ddd6c8", position: "relative",
                }}>
                  <span style={{
                    position: "absolute", top: 2, left: travailleurEtranger ? 20 : 2,
                    width: 18, height: 18, borderRadius: "50%", background: "#fff",
                    transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>
            </div>

            {/* Save bar */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16, padding: "16px 0", borderTop: "1px solid #f0ebe3" }}>
              <button type="button" onClick={() => window.location.reload()} style={{ padding: "8px 20px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", color: "#1a1a1a" }}>
                Annuler
              </button>
              <button type="button" onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
                {saving ? "..." : "Enregistrer les modifications"}
              </button>
            </div>
          </>
        )}

        {/* ═══ TAB: CONTRATS (was Dossier RH) ═══ */}
        {mainTab === "dossier" && (
          <>
            {/* Contrats content only — legacy sub-tabs removed */}
            {/* Legacy removed */}

            {/* ─── SUB: Contrats ─── */}
            
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a", margin: 0 }}>Contrats</h2>
                  {canWrite && (
                    <button type="button" onClick={openNewContrat} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      + Nouveau contrat
                    </button>
                  )}
                </div>

                {/* Contrat en cours */}
                {activeContrat && (() => {
                  const c = activeContrat;
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  const cElems = elements.filter((e) => e.contrat_id === c.id);
                  return (
                    <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                          </span>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Contrat en cours</span>
                        </div>
                        {canWrite && (
                          <div style={{ position: "relative" }}>
                            <button type="button" onClick={() => {
                              const el = document.getElementById("contract-actions");
                              if (el) el.style.display = el.style.display === "block" ? "none" : "block";
                            }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#1a1a1a", display: "flex", alignItems: "center", gap: 4 }}>
                              ... Actions
                              <svg width={10} height={10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                            </button>
                            <div id="contract-actions" style={{ display: "none", position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #ddd6c8", borderRadius: 8, padding: "4px 0", zIndex: 10, boxShadow: "0 4px 12px rgba(0,0,0,0.1)", minWidth: 200 }}>
                              <button type="button" onClick={() => { openEditContrat(c); document.getElementById("contract-actions")!.style.display = "none"; }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1a1a1a", textAlign: "left" }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                Afficher le detail
                              </button>
                              <button type="button" onClick={() => {
                                document.getElementById("contract-actions")!.style.display = "none";
                                setAvenantStep(1);
                                setAvenantChanges([]);
                                setAvenantHeures(c.heures_semaine);
                                setAvenantSalaire(c.remuneration);
                                setAvenantDate(new Date().toISOString().slice(0, 10));
                                setShowAvenantModal(true);
                              }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#1a1a1a", textAlign: "left" }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                                Declarer un changement
                              </button>
                              <button type="button" onClick={() => { handleTerminateContrat(c.id); document.getElementById("contract-actions")!.style.display = "none"; }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "8px 16px", background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#DC2626", textAlign: "left" }}>
                                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="8 12 12 16 16 12" /></svg>
                                Terminer le contrat
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <tbody>
                          {[
                            ["Type", CONTRAT_LABELS[c.type] ?? c.type],
                            ["Debut du contrat", fmtDate(c.date_debut)],
                            ["Remuneration", `${c.remuneration.toLocaleString("fr-FR")} EUR`],
                            ["Emploi", c.emploi ?? "—"],
                            ["Duree de travail hebdomadaire", `${c.heures_semaine} heures`],
                            ["Nb. de jours travailles par semaine", `${c.jours_semaine} jours`],
                            ["Qualification", c.qualification ?? "—"],
                          ].map(([label, value]) => (
                            <tr key={label} style={{ borderBottom: "1px solid #f0ebe3" }}>
                              <td style={{ padding: "10px 0", color: "#1a1a1a", fontWeight: 500 }}>{label}</td>
                              <td style={{ padding: "10px 0", color: "#1a1a1a", textAlign: "right" }}>{value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}

                {/* Historique contrats */}
                {contrats.length > 0 && (
                  <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(160,132,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="2"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Tous les contrats et avenants</span>
                    </div>
                    {contrats.map(c => (
                      <div key={c.id} style={{ marginBottom: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                          <span style={{ fontSize: 12, color: "#999" }}>{fmtDate(c.date_debut)}</span>
                          <span style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600 }}>{c.actif ? "Contrat actif" : "Nouveau contrat"}</span>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: "#faf7f2", borderRadius: 8, overflow: "hidden" }}>
                          <tbody>
                            {[
                              ["Type", CONTRAT_LABELS[c.type] ?? c.type],
                              ["Debut du contrat", fmtDate(c.date_debut)],
                              ["Remuneration", `${c.remuneration.toLocaleString("fr-FR")} EUR`],
                              ["Emploi", c.emploi ?? "—"],
                              ["Duree de travail hebdomadaire", `${c.heures_semaine} heures`],
                              ["Nb. de jours travailles par semaine", `${c.jours_semaine} jours`],
                              ["Qualification", c.qualification ?? "—"],
                            ].map(([label, value]) => (
                              <tr key={label} style={{ borderBottom: "1px solid #f0ebe3" }}>
                                <td style={{ padding: "8px 12px", color: "#666" }}>{label}</td>
                                <td style={{ padding: "8px 12px", color: "#1a1a1a" }}>{value}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}

                {/* Mutuelle */}
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Mutuelle</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center" }}>
                    Aucune dispense de mutuelle n&apos;a ete enregistree pour ce collaborateur. Il est donc automatiquement considere comme couvert par une mutuelle.
                  </p>
                </div>

                {/* Indemnites transport */}
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(45,106,79,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Indemnites de transport mensuelles</span>
                    </div>
                    <button type="button" onClick={() => setShowTransportModal(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Ajouter</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Nom du dispositif</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Montant mensuel</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Periode</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Etat</th>
                    </tr></thead>
                  </table>
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center" }}>Aucune indemnite de transport</p>
                </div>

                {/* Primes et acomptes */}
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(160,132,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="2"><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Primes, acomptes et indemnites</span>
                    </div>
                    <button type="button" onClick={() => setShowPrimeModal(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Ajouter</button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 8 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Date</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Montant</th>
                    </tr></thead>
                    <tbody>
                      {elements.length === 0 ? (
                        <tr><td colSpan={3} style={{ padding: "16px 0", textAlign: "center", color: "#999" }}>Pas de prime ou d&apos;acompte</td></tr>
                      ) : elements.map(el => (
                        <tr key={el.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                          <td style={{ padding: "8px 0" }}>{el.date_debut ? fmtDate(el.date_debut) : "—"}</td>
                          <td style={{ padding: "8px 0" }}>{ELEMENT_LABELS[el.type] ?? el.type} — {el.libelle}</td>
                          <td style={{ padding: "8px 0" }}>{el.montant ? `${el.montant} EUR` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
          </>
        )}

        {/* ═══ TAB: Conges et Absences ═══ */}
        {mainTab === "conges" && (() => {
          const ABSENCE_TYPES: Record<string, { label: string; color: string }> = {
            conge_paye: { label: "Conge paye", color: "#2D6A4F" },
            maladie: { label: "Maladie", color: "#DC2626" },
            rtt: { label: "RTT", color: "#2563eb" },
            absence_injustifiee: { label: "Absence injustifiee", color: "#DC2626" },
            ferie: { label: "Jour ferie", color: "#7B1FA2" },
            repos_compensateur: { label: "Repos compensateur", color: "#D4775A" },
            formation: { label: "Formation", color: "#2563eb" },
            evenement_familial: { label: "Evenement familial", color: "#A0845C" },
            sans_solde: { label: "Sans solde", color: "#999" },
            accident_travail: { label: "Accident du travail", color: "#DC2626" },
            maternite: { label: "Maternite/Paternite", color: "#7B1FA2" },
          };
          const cpAcquis = absences.filter(a => a.type === "conge_paye").length;

          return (
            <>
              {/* Compteurs CP */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                {[
                  { label: "CP Acquis", value: `${(cpAcquis * 2.5).toFixed(1)} j`, color: "#2D6A4F" },
                  { label: "CP Pris", value: `${cpAcquis} j`, color: "#D4775A" },
                  { label: "Solde CP", value: `${((cpAcquis * 2.5) - cpAcquis).toFixed(1)} j`, color: "#2563eb" },
                ].map(kpi => (
                  <div key={kpi.label} style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 16, textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", marginBottom: 4 }}>{kpi.label}</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: kpi.color }}>{kpi.value}</div>
                  </div>
                ))}
              </div>

              {/* Liste des absences */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(45,106,79,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Absences</span>
                  </div>
                  <button type="button" onClick={() => setShowAbsenceModal(true)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    + Demande d&apos;absence
                  </button>
                </div>
                {absences.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center", padding: "20px 0" }}>Aucune absence enregistree</p>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Type</th>
                      <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Debut</th>
                      <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Fin</th>
                      <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Statut</th>
                    </tr></thead>
                    <tbody>
                      {absences.map(a => {
                        const t = ABSENCE_TYPES[a.type] ?? { label: a.type, color: "#999" };
                        return (
                          <tr key={a.id} style={{ borderBottom: "1px solid #f0ebe3" }}>
                            <td style={{ padding: "10px 0" }}>
                              <span style={{ padding: "2px 8px", borderRadius: 4, background: `${t.color}15`, color: t.color, fontSize: 11, fontWeight: 600 }}>{t.label}</span>
                            </td>
                            <td style={{ padding: "10px 0" }}>{new Date(a.date_debut).toLocaleDateString("fr-FR")}</td>
                            <td style={{ padding: "10px 0" }}>{new Date(a.date_fin).toLocaleDateString("fr-FR")}</td>
                            <td style={{ padding: "10px 0" }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: a.statut === "approuve" ? "#2D6A4F" : a.statut === "refuse" ? "#DC2626" : "#D4775A" }}>
                                {a.statut === "approuve" ? "Approuve" : a.statut === "refuse" ? "Refuse" : "En attente"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}

        {/* ═══ TAB: Documents ═══ */}
        {mainTab === "documents" && (() => {
          const DOSSIERS = [
            { key: "contrats", label: "Contrats de travail", icon: "fileText" },
            { key: "fiches_paie", label: "Fiches de paie", icon: "wallet" },
            { key: "documents_sociaux", label: "Documents sociaux", icon: "clipboard" },
            { key: "arrets_maladie", label: "Arrets maladie", icon: "beach" },
            { key: "formations", label: "Formations", icon: "book" },
            { key: "autres", label: "Autres documents", icon: "package" },
          ];

          return (
            <>
              {/* Documents */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                    </span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Documents</span>
                  </div>
                  <button type="button" onClick={() => {
                    const input = document.createElement("input");
                    input.type = "file";
                    input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0];
                      if (!file) return;
                      const path = `employes/${emp.id}/documents/${Date.now()}_${file.name}`;
                      await supabase.storage.from("public").upload(path, file, { upsert: true });
                      setSaveOk(true); setTimeout(() => setSaveOk(false), 2000);
                    };
                    input.click();
                  }} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                    + Ajouter un document
                  </button>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  <span style={{ padding: "4px 10px", borderRadius: 20, border: "1px solid #ddd6c8", fontSize: 11, fontWeight: 600, color: "#1a1a1a" }}>
                    Type de document 0/{DOSSIERS.length}
                  </span>
                  <input type="text" placeholder="Rechercher par nom de document" style={{ flex: 1, padding: "4px 10px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 12, minWidth: 200 }} />
                </div>

                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Document</th>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Type</th>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Signature</th>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "8px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Actions</th>
                  </tr></thead>
                </table>
                <div style={{ textAlign: "center", padding: "30px 0" }}>
                  <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#ddd6c8" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  <p style={{ fontSize: 13, color: "#999", marginTop: 8 }}>Pas de document a afficher</p>
                  <p style={{ fontSize: 12, color: "#999" }}>Ajoutez votre premier document et faites-le signer simplement</p>
                </div>
              </div>

              {/* Bulletins de paie */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Bulletins de paie</span>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, marginBottom: 8 }}>
                  <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Document</th>
                  </tr></thead>
                </table>
                <div style={{ textAlign: "center", padding: "30px 0" }}>
                  <svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#ddd6c8" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>
                  <p style={{ fontSize: 13, color: "#1a1a1a", fontWeight: 600, marginTop: 8 }}>Aucun bulletin de paie importe</p>
                  <p style={{ fontSize: 12, color: "#999" }}>Pour importer des bulletins de paie, vous pouvez vous rendre dans l&apos;espace &quot;distribution des bulletins de paie&quot;</p>
                  <button type="button" style={{ marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Distribution des bulletins de paie
                  </button>
                </div>
              </div>

              {/* Dossiers */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(160,132,92,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Dossiers</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {DOSSIERS.map(d => (
                    <div key={d.key} onClick={() => {
                      const input = document.createElement("input");
                      input.type = "file";
                      input.accept = ".pdf,.jpg,.jpeg,.png,.doc,.docx";
                      input.onchange = async (e) => {
                        const file = (e.target as HTMLInputElement).files?.[0];
                        if (!file) return;
                        const path = `employes/${emp.id}/${d.key}/${Date.now()}_${file.name}`;
                        const { error: uploadErr } = await supabase.storage.from("public").upload(path, file, { upsert: true });
                        if (uploadErr) { /* silently fail */ }
                        else { setSaveOk(true); setTimeout(() => setSaveOk(false), 2000); }
                      };
                      input.click();
                    }} style={{ padding: 14, borderRadius: 10, border: "1px solid #f0ebe3", background: "#faf7f2", textAlign: "center", cursor: "pointer", transition: "background 0.12s" }}
                      onMouseOver={e => (e.currentTarget.style.background = "#f0ebe3")}
                      onMouseOut={e => (e.currentTarget.style.background = "#faf7f2")}
                    >
                      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#A0845C" strokeWidth="1.5" style={{ marginBottom: 6 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>{d.label}</div>
                      <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Cliquez pour deposer</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          );
        })()}

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
                  if (!confirm("Supprimer définitivement cet employé ? Cette opération supprimera aussi ses contrats, absences et shifts. C'est irréversible.")) return;
                  const empId = emp.id as string;
                  // Supprimer les données liées d'abord (contraintes FK)
                  await supabase.from("contrat_elements").delete().in("contrat_id", contrats.map(c => c.id));
                  await supabase.from("contrats").delete().eq("employe_id", empId);
                  await supabase.from("absences").delete().eq("employe_id", empId);
                  await supabase.from("shifts").delete().eq("employe_id", empId);
                  // Supprimer l'employé
                  const { error } = await supabase.from("employes").delete().eq("id", empId);
                  if (error) { alert("Erreur : " + error.message); return; }
                  window.location.href = "/settings/employes";
                }} style={{ padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(220,38,38,0.3)", background: "rgba(220,38,38,0.06)", color: "#DC2626", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                  Supprimer le compte
                </button>
              </div>
            </div>
          );
        })()}

        {mainTab === "acces" && (() => {
          const empEquipes = ((emp as Record<string, unknown>).equipes_access as string[] ?? []);
          const affichagePlanning = (emp as Record<string, unknown>).affichage_planning !== false;
          const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

          return (
            <>
              {/* Planification et acces */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(45,106,79,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2D6A4F" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", fontFamily: "var(--font-oswald), Oswald, sans-serif" }}>Planification et acces</span>
                </div>

                {/* Acces aux equipes */}
                <div style={{ border: "1px solid #f0ebe3", borderRadius: 10, padding: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Acces aux equipes</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Donne de la visibilite au salarie sur plus d&apos;equipes (exemple : plannings). Necessaire pour etre planifie.</p>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Etablissement</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Equipes</th>
                    </tr></thead>
                    <tbody>
                      <tr style={{ borderBottom: "1px solid #f0ebe3" }}>
                        <td style={{ padding: "10px 0" }}>{etab?.nom ?? "—"}</td>
                        <td style={{ padding: "10px 0" }}>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {empEquipes.length > 0 ? empEquipes.map(eq => (
                              <span key={eq} style={{ padding: "2px 8px", borderRadius: 4, background: "#f0ebe3", fontSize: 12, fontWeight: 500 }}>{eq}</span>
                            )) : <span style={{ color: "#999" }}>—</span>}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Affichage sur le planning */}
                <div style={{ border: "1px solid #f0ebe3", borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>Affichage sur le planning</span>
                  </div>
                  <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Permet au salarie d&apos;etre planifie sur plus d&apos;equipes. Necessite d&apos;avoir acces aux equipes ci-dessus.</p>

                  <div style={{ padding: 12, borderRadius: 8, background: "#faf7f2", marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>Afficher le salarie sur le planning</span>
                      <button type="button" onClick={async () => {
                        const next = !affichagePlanning;
                        await supabase.from("employes").update({ affichage_planning: next }).eq("id", emp.id);
                        setEmp((prev: Record<string, unknown>) => ({ ...prev, affichage_planning: next }));
                      }} style={{
                        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                        background: affichagePlanning ? "#2D6A4F" : "#ddd6c8", position: "relative",
                      }}>
                        <span style={{ position: "absolute", top: 2, left: affichagePlanning ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                      </button>
                    </div>
                    <p style={{ fontSize: 11, color: "#999", margin: 0, lineHeight: 1.4 }}>
                      Permet de faire apparaitre le salarie sur le planning aux dates de son contrat. En le desactivant, tout l&apos;historique de planification sera cache.
                    </p>
                  </div>

                  <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
                    <button type="button" onClick={() => setShowPlanifModal(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Modifier
                    </button>
                  </div>

                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Etablissement</th>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Equipes</th>
                    </tr></thead>
                    <tbody>
                      <tr>
                        <td style={{ padding: "10px 0" }}>{etab?.nom ?? "—"}</td>
                        <td style={{ padding: "10px 0" }}>
                          <div style={{ display: "flex", gap: 6 }}>
                            {empEquipes.map(eq => (
                              <span key={eq} style={{ padding: "2px 8px", borderRadius: 4, background: "#f0ebe3", fontSize: 12 }}>{eq}</span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Temps de travail + Disponibilites — 2 columns */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {/* Temps de travail */}
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Temps de travail</span>
                    </div>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Periode</th>
                      <th style={{ textAlign: "right", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Heures travaillees</th>
                    </tr></thead>
                    <tbody>
                      {(() => {
                        const now = new Date();
                        // Calculate hours per month from shifts
                        const monthlyHours: Record<string, number> = {};
                        for (const s of shifts) {
                          const d = new Date(s.date);
                          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                          const start = s.heure_debut ?? s.start_time ?? "00:00";
                          const end = s.heure_fin ?? s.end_time ?? "00:00";
                          const [sh, sm] = start.split(":").map(Number);
                          const [eh, em] = end.split(":").map(Number);
                          let dur = (eh * 60 + em) - (sh * 60 + sm);
                          if (dur < 0) dur += 1440;
                          dur -= (s.pause_minutes ?? 0);
                          monthlyHours[key] = (monthlyHours[key] ?? 0) + dur / 60;
                        }
                        return Array.from({ length: 6 }, (_, i) => {
                          const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                          const h = monthlyHours[key] ?? 0;
                          const hh = Math.floor(h);
                          const mm = Math.round((h - hh) * 60);
                          return (
                            <tr key={i} style={{ borderBottom: "1px solid #f0ebe3" }}>
                              <td style={{ padding: "8px 0", textTransform: "capitalize" }}>{d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}</td>
                              <td style={{ padding: "8px 0", textAlign: "right", fontWeight: h > 0 ? 600 : 400, color: h > 0 ? "#1a1a1a" : "#999" }}>
                                {h > 0 ? `${hh}h${mm > 0 ? String(mm).padStart(2, "0") : "00"}` : "—"}
                              </td>
                            </tr>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                </div>

                {/* Disponibilites */}
                <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                      </span>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Disponibilites</span>
                    </div>
                    <button type="button" onClick={() => setShowDispoModal(true)} style={{ padding: "4px 12px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      Modifier
                    </button>
                  </div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ borderBottom: "1px solid #ddd6c8" }}>
                      <th style={{ textAlign: "left", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", width: 100 }}>Jour</th>
                      <th style={{ textAlign: "center", padding: "6px 0", fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase" }}>Disponibilité</th>
                    </tr></thead>
                    <tbody>
                      {JOURS.map((j, idx) => {
                        const dispos = ((emp as Record<string, unknown>).disponibilites as Record<string, unknown>) ?? {};
                        const val = String(dispos[String(idx)] ?? "journee");
                        return (
                          <tr key={j} style={{ borderBottom: "1px solid #f0ebe3" }}>
                            <td style={{ padding: "8px 0", fontWeight: 500 }}>{j}</td>
                            <td style={{ padding: "4px 0", textAlign: "center" }}>
                              <select id={`dispo-inline-${idx}`} defaultValue={val === "false" || val === "indisponible" ? "indisponible" : val === "matin" ? "matin" : val === "soir" ? "soir" : "journee"} style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #ddd6c8", fontSize: 12, cursor: "pointer" }}>
                                <option value="journee">Journée</option>
                                <option value="matin">Matin</option>
                                <option value="soir">Soir</option>
                                <option value="indisponible">Indisponible</option>
                              </select>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" onClick={async () => {
                      const dispos: Record<string, string> = {};
                      for (let i = 0; i < 7; i++) {
                        const sel = document.getElementById(`dispo-inline-${i}`) as HTMLSelectElement;
                        if (sel) dispos[String(i)] = sel.value;
                      }
                      await supabase.from("employes").update({ disponibilites: dispos }).eq("id", emp.id);
                      setEmp((prev: Record<string, unknown>) => ({ ...prev, disponibilites: dispos }));
                      setSaveOk(true); setTimeout(() => setSaveOk(false), 2000);
                    }} style={{
                      padding: "6px 14px", borderRadius: 6, border: "none",
                      background: "#1a1a1a", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer",
                    }}>
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>

              {/* Invitation */}
              <div style={{ ...section, border: "1px solid #ddd6c8", borderRadius: 14, padding: 20, marginTop: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(37,99,235,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M22 7l-10 7L2 7" /></svg>
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>Invitation</span>
                </div>
                <p style={{ fontSize: 12, color: "#999", marginBottom: 12 }}>Envoyer une invitation par email pour acceder a l&apos;application.</p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button type="button" onClick={async () => {
                    if (!email) return;
                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch("/api/admin/invite", {
                      method: "POST",
                      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
                      body: JSON.stringify({ email, displayName: `${prenom} ${nom}`, role: (emp as Record<string, unknown>).role ?? "employe" }),
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
          );
        })()}
      </div>

      {/* ═══ MODAL: Contrat ═══ */}
      {showContratModal && (
        <div style={overlayStyle} onClick={() => setShowContratModal(false)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            <h2 style={modalTitle}>Contrat de {prenom}</h2>

            {editContratId && (
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(123,31,162,0.04)", border: "1px solid rgba(123,31,162,0.15)", marginBottom: 16, fontSize: 12, color: "#7B1FA2", lineHeight: 1.4 }}>
                <strong>Vous souhaitez modifier un élément du contrat ?</strong><br />
                L&apos;avenant est obligatoire lorsque vous modifiez un élément essentiel du contrat de travail.
              </div>
            )}

            {/* ── Onglets Contrat / Paie ── */}
            <div style={{ display: "flex", borderRadius: 20, border: "1px solid #ddd6c8", overflow: "hidden", marginBottom: 16 }}>
              <button type="button" onClick={() => setContratTab("contrat")} style={{ flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: contratTab === "contrat" ? "#f0ebe3" : "#fff" }}>Contrat</button>
              <button type="button" onClick={() => setContratTab("paie")} style={{ flex: 1, padding: "8px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: contratTab === "paie" ? "#f0ebe3" : "#fff" }}>Paie</button>
            </div>

            {/* ── Section Contrat ── */}
            <div style={{ display: contratTab === "contrat" ? "block" : "none" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>CONTRAT</div>

              <div style={fieldRow}>
                <label style={labelSt}>Type de contrat *</label>
                <select style={inputSt} value={cType} onChange={(e) => setCType(e.target.value)}>
                  {Object.entries(CONTRAT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>

              <Checkbox label="Ce contrat est en forfait jour" checked={false} onChange={() => {}} />

              <div style={fieldRow}>
                <label style={labelSt}>Temps de travail hebdomadaire</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" style={inputSt} value={cHeures} onChange={(e) => setCHeures(Number(e.target.value))} />
                  <span style={{ fontSize: 12, color: "#999" }}>h</span>
                </div>
              </div>

              <div style={grid2}>
                <div style={fieldRow}>
                  <label style={labelSt}>Date de début de contrat *</label>
                  <input type="date" style={inputSt} value={cDebut} onChange={(e) => setCDebut(e.target.value)} />
                </div>
                <div style={fieldRow}>
                  <label style={labelSt}>Heure de début de contrat</label>
                  <input type="time" style={inputSt} defaultValue="08:00" />
                </div>
              </div>

              {(cType === "CDD" || cType === "extra" || cType === "interim") && (
                <div style={grid2}>
                  <div style={fieldRow}>
                    <label style={labelSt}>Date de fin de contrat *</label>
                    <input type="date" style={inputSt} value={cFin} onChange={(e) => setCFin(e.target.value)} />
                  </div>
                  <div style={fieldRow}>
                    <label style={labelSt}>Motif du CDD</label>
                    <select style={inputSt} defaultValue="">
                      <option value="">Sélectionnez...</option>
                      <option value="remplacement">Remplacement d&apos;un salarié absent</option>
                      <option value="accroissement">Accroissement temporaire d&apos;activité</option>
                      <option value="saisonnier">Emploi saisonnier</option>
                      <option value="usage">Contrat d&apos;usage</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={fieldRow}>
                <label style={labelSt}>Date de fin de période d&apos;essai</label>
                <input type="date" style={inputSt} defaultValue="" />
              </div>

              <div style={fieldRow}>
                <label style={labelSt}>Jours travaillés par semaine *</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" style={inputSt} value={cJours} onChange={(e) => setCJours(Number(e.target.value))} min={1} max={7} />
                  <span style={{ fontSize: 12, color: "#999" }}>j</span>
                </div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 }}>EMPLOI ET QUALIFICATION</div>

              <div style={fieldRow}>
                <label style={labelSt}>Intitulé de l&apos;emploi <span style={{ fontSize: 9, color: "#999", fontWeight: 400 }}>RUP</span></label>
                <input style={inputSt} value={cEmploi} onChange={(e) => setCEmploi(e.target.value)} placeholder="Pizzaiolo, Serveur..." />
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4, marginTop: 8 }}>QUALIFICATION</div>

              <div style={grid2}>
                <div style={fieldRow}>
                  <label style={labelSt}>Niveau *</label>
                  <select style={inputSt} id="contrat-niveau" defaultValue={cQualification?.split(" E")[0] ?? ""} onChange={() => {
                    const niv = (document.getElementById("contrat-niveau") as HTMLSelectElement)?.value ?? "";
                    const ech = (document.getElementById("contrat-echelon") as HTMLSelectElement)?.value ?? "";
                    setCQualification(ech ? `${niv} ${ech}` : niv);
                  }}>
                    <option value="">Sélectionnez...</option>
                    <option value="Employé N1">Employé - Niveau I</option>
                    <option value="Employé N2">Employé qualifié - Niveau II</option>
                    <option value="Employé N3">Employé qualifié - Niveau III</option>
                    <option value="Agent maîtrise N4">Agent de maîtrise - Niveau IV</option>
                    <option value="Cadre N5">Cadre - Niveau V</option>
                    <option value="Gérant">Gérant / TNS</option>
                  </select>
                </div>
                <div style={fieldRow}>
                  <label style={labelSt}>Échelon</label>
                  <select style={inputSt} id="contrat-echelon" defaultValue="" onChange={() => {
                    const niv = (document.getElementById("contrat-niveau") as HTMLSelectElement)?.value ?? "";
                    const ech = (document.getElementById("contrat-echelon") as HTMLSelectElement)?.value ?? "";
                    setCQualification(ech ? `${niv} ${ech}` : niv);
                  }}>
                    <option value="">—</option>
                    <option value="E1">Échelon 1</option>
                    <option value="E2">Échelon 2</option>
                    <option value="E3">Échelon 3</option>
                  </select>
                </div>
              </div>

              <div style={fieldRow}>
                <label style={labelSt}>Personnaliser la qualification</label>
                <input style={inputSt} defaultValue="" placeholder="Ex : Chef de rang, Second de cuisine..." />
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Si vous n&apos;indiquez pas de qualification, la mention &quot;Autre qualification&quot; sera indiquée par défaut dans le Registre Unique du Personnel.</div>
              </div>

              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8, marginTop: 16 }}>RATTACHEMENT</div>

              <div style={fieldRow}>
                <label style={labelSt}>Établissement par défaut *</label>
                <select style={inputSt} id="contrat-etab" defaultValue={empEtab?.id ?? (emp as Record<string, unknown>).etablissement_id as string ?? ""} onChange={async (e) => {
                  const newEtabId = e.target.value;
                  if (!newEtabId) return;
                  // Recharger équipes et managers pour le nouvel établissement
                  const [eqRes, mgrRes] = await Promise.all([
                    supabase.from("equipes").select("nom").eq("etablissement_id", newEtabId).eq("actif", true).order("nom"),
                    supabase.from("employes").select("id, prenom, nom, role").eq("etablissement_id", newEtabId).eq("actif", true).in("role", ["group_admin", "manager", "admin", "direction"]).order("nom"),
                  ]);
                  if (eqRes.data) setContratEquipes(eqRes.data.map((eq: { nom: string }) => eq.nom));
                  if (mgrRes.data) setContratManagers(mgrRes.data.map((m: { id: string; prenom: string; nom: string }) => ({ id: m.id, label: `${m.prenom} ${m.nom}` })));
                }}>
                  {etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
                </select>
              </div>

              <div style={fieldRow}>
                <label style={labelSt}>Équipe par défaut *</label>
                <select style={inputSt} id="contrat-equipe" defaultValue={((emp as Record<string, unknown>).equipes_access as string[] ?? [])[0] ?? ""}>
                  {contratEquipes.length > 0 ? contratEquipes.map(eq => (
                    <option key={eq} value={eq}>{eq}</option>
                  )) : ((emp as Record<string, unknown>).equipes_access as string[] ?? []).map(eq => (
                    <option key={eq} value={eq}>{eq}</option>
                  ))}
                </select>
              </div>

              <div style={fieldRow}>
                <label style={labelSt}>Responsable hiérarchique</label>
                <select style={inputSt} id="contrat-responsable" defaultValue="">
                  <option value="">Sélectionnez...</option>
                  {contratManagers.filter(m => m.id !== (emp as Record<string, unknown>).id).map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
                <div style={{ fontSize: 10, color: "#999", marginTop: 2 }}>Le responsable recevra les notifications relatives aux demandes d&apos;absence et aux absences de pointage de ce salarié.</div>
              </div>

              <Checkbox label="Ne pas afficher dans le registre du personnel" checked={(emp as Record<string, unknown>).affichage_rup === false} onChange={async (v) => {
                await supabase.from("employes").update({ affichage_rup: !v }).eq("id", emp.id);
                setEmp((prev: Record<string, unknown>) => ({ ...prev, affichage_rup: !v }));
              }} />
            </div>

            {/* ── Section Paie ── */}
            <div style={{ display: contratTab === "paie" ? "block" : "none" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>SALAIRE</div>

              <Checkbox label="Salarié au SMIC" checked={cSmic} onChange={(v) => {
                setCSmic(v);
                if (v && cHeures > 0) {
                  // SMIC horaire brut 2026 : 11,88 €
                  const smicMensuel = Math.round(11.88 * cHeures * 52 / 12 * 100) / 100;
                  setCRemuneration(smicMensuel);
                }
              }} />
              {cSmic && cHeures <= 0 && (
                <div style={{ padding: 8, borderRadius: 8, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", marginBottom: 12, fontSize: 11, color: "#2563eb" }}>
                  Pour appliquer le SMIC, renseignez d&apos;abord le temps de travail hebdomadaire dans l&apos;onglet Contrat.
                </div>
              )}
              {cSmic && cHeures > 0 && (
                <div style={{ padding: 8, borderRadius: 8, background: "rgba(45,106,79,0.06)", border: "1px solid rgba(45,106,79,0.15)", marginBottom: 12, fontSize: 11, color: "#2D6A4F" }}>
                  SMIC horaire brut 2026 : <strong>11,88 €/h</strong> — Salaire mensuel calculé sur {cHeures}h/sem : <strong>{(Math.round(11.88 * cHeures * 52 / 12 * 100) / 100).toLocaleString("fr-FR")} €</strong>
                </div>
              )}

              <div style={fieldRow}>
                <label style={labelSt}>Salaire brut mensuel</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" style={{ ...inputSt, background: cSmic ? "#f0ebe3" : "#fff" }} value={cRemuneration} onChange={(e) => { if (!cSmic) setCRemuneration(Number(e.target.value)); }} disabled={cSmic} />
                  <span style={{ fontSize: 12, color: "#999" }}>€</span>
                </div>
              </div>

              <div style={fieldRow}>
                <label style={labelSt}>Taux horaire brut</label>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input type="number" style={inputSt} value={cHeures > 0 ? Math.round(cRemuneration / (cHeures * 52 / 12) * 100) / 100 : 0} disabled />
                  <span style={{ fontSize: 12, color: "#999" }}>€</span>
                </div>
              </div>

              <div style={{ padding: 10, borderRadius: 8, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.12)", marginBottom: 12, fontSize: 11, color: "#DC2626", lineHeight: 1.4 }}>
                Pour le calcul des heures supplémentaires, il ne peut y avoir qu&apos;un seul temps de travail hebdomadaire par semaine civile (du lundi au dimanche). Combo utilise le temps de travail contractuel effectif en début de semaine pour calculer les heures supplémentaires.
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

      {/* ═══ MODAL: Demande d'absence ═══ */}
      {showAbsenceModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={() => setShowAbsenceModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 460, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Demande d&apos;absence</h2>
              <button type="button" onClick={() => setShowAbsenceModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>Les demandes d&apos;absences sont envoyees a votre responsable qui pourra valider ou refuser votre demande.</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Type d&apos;absence</label>
              <select value={absType} onChange={e => setAbsType(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const }}>
                <option value="conge_paye">Conge paye</option>
                <option value="sans_solde">Conge sans solde</option>
                <option value="evenement_familial">Evenement familial</option>
                <option value="maladie">Maladie</option>
                <option value="rtt">RTT</option>
                <option value="repos_compensateur">Repos compensateur</option>
                <option value="formation">Formation</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Date de debut</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={absDebut} onChange={e => setAbsDebut(e.target.value)} style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }} />
                <div style={{ display: "flex", borderRadius: 8, border: "1px solid #ddd6c8", overflow: "hidden" }}>
                  <button type="button" onClick={() => setAbsDebutPeriode("matin")} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: absDebutPeriode === "matin" ? "#f0ebe3" : "#fff", color: "#1a1a1a" }}>Matin</button>
                  <button type="button" onClick={() => setAbsDebutPeriode("apres_midi")} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: absDebutPeriode === "apres_midi" ? "#f0ebe3" : "#fff", color: "#1a1a1a", borderLeft: "1px solid #ddd6c8" }}>Apres-midi</button>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Date de fin</label>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="date" value={absFin} onChange={e => setAbsFin(e.target.value)} style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }} />
                <div style={{ display: "flex", borderRadius: 8, border: "1px solid #ddd6c8", overflow: "hidden" }}>
                  <button type="button" onClick={() => setAbsFinPeriode("matin")} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: absFinPeriode === "matin" ? "#f0ebe3" : "#fff", color: "#1a1a1a" }}>Matin</button>
                  <button type="button" onClick={() => setAbsFinPeriode("apres_midi")} style={{ padding: "8px 12px", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: absFinPeriode === "apres_midi" ? "#f0ebe3" : "#fff", color: "#1a1a1a", borderLeft: "1px solid #ddd6c8" }}>Apres-midi</button>
                </div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Commentaire (facultatif)</label>
              <textarea value={absNote} onChange={e => setAbsNote(e.target.value)} rows={3} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const, resize: "vertical" }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={async () => {
                // Calculer nb_jours
                const d1 = new Date(absDebut); const d2 = new Date(absFin);
                let nbJours = Math.max(1, Math.ceil((d2.getTime() - d1.getTime()) / 86400000) + 1);
                if (absDebutPeriode === "apres_midi") nbJours -= 0.5;
                if (absFinPeriode === "matin") nbJours -= 0.5;

                await supabase.from("absences").insert({
                  employe_id: emp.id,
                  etablissement_id: empEtab?.id ?? etab?.id,
                  type: absType,
                  date_debut: absDebut,
                  date_fin: absFin,
                  nb_jours: nbJours,
                  note: absNote || null,
                  statut: "demande",
                });
                setAbsences(prev => [...prev, { id: crypto.randomUUID(), type: absType, date_debut: absDebut, date_fin: absFin, statut: "demande" } as Absence]);
                setShowAbsenceModal(false);
                setAbsNote("");
              }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Ajouter prime ═══ */}
      {showPrimeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={() => setShowPrimeModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Ajouter une prime, un acompte ou autre indemnite</h2>
              <button type="button" onClick={() => setShowPrimeModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Choix du contrat <span style={{ color: "#DC2626" }}>*</span></label>
              <select style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}>
                {contrats.filter(c => c.actif).map(c => <option key={c.id} value={c.id}>{CONTRAT_LABELS[c.type] ?? c.type} du {fmtDate(c.date_debut)}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Type <span style={{ color: "#DC2626" }}>*</span></label>
              <select value={primeType} onChange={e => setPrimeType(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}>
                <option value="">Selectionnez un type de prime...</option>
                <option value="prime">Prime</option>
                <option value="acompte">Acompte</option>
                <option value="transport">Indemnite de transport</option>
                <option value="mutuelle_dispense">Dispense de mutuelle</option>
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Montant <span style={{ color: "#DC2626" }}>*</span></label>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <input type="number" value={primeMontant} onChange={e => setPrimeMontant(Number(e.target.value))} style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }} />
                <span style={{ fontSize: 13, color: "#999" }}>EUR</span>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Date <span style={{ color: "#DC2626" }}>*</span></label>
              <input type="date" value={primeDate} onChange={e => setPrimeDate(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }} />
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={async () => {
                const ac = contrats.find(c => c.actif);
                if (!ac) return;
                await supabase.from("contrat_elements").insert({ contrat_id: ac.id, type: primeType || "prime", libelle: primeType || "Prime", montant: primeMontant, date_debut: primeDate });
                setElements(prev => [...prev, { id: crypto.randomUUID(), contrat_id: ac.id, type: primeType || "prime", libelle: primeType || "Prime", montant: primeMontant, code_silae: null, date_debut: primeDate, date_fin: null }]);
                setShowPrimeModal(false);
              }} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Creer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Transport ═══ */}
      {showTransportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 }} onClick={() => setShowTransportModal(false)}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, width: "100%", maxWidth: 420, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Ajouter une indemnite de transport mensuelle</h2>
              <button type="button" onClick={() => setShowTransportModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Dispositif <span style={{ color: "#DC2626" }}>*</span></label>
              <select value={transportDispositif} onChange={e => setTransportDispositif(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}>
                <option value="">Selectionnez un dispositif</option>
                <option value="abonnement_collectif">Abonnement transport collectif</option>
                <option value="forfait_mobilite">Forfait mobilite durable</option>
                <option value="indemnite_soumise">Autre indemnite de transport (soumise a cotisation)</option>
                <option value="indemnite_non_soumise">Autre indemnite de transport (non soumise a cotisation)</option>
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" onClick={async () => {
                const ac = contrats.find(c => c.actif);
                if (!ac) return;
                await supabase.from("contrat_elements").insert({ contrat_id: ac.id, type: "transport", libelle: transportDispositif, montant: 0 });
                setElements(prev => [...prev, { id: crypto.randomUUID(), contrat_id: ac.id, type: "transport", libelle: transportDispositif, montant: 0, code_silae: null, date_debut: null, date_fin: null }]);
                setShowTransportModal(false);
              }} disabled={!transportDispositif} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: transportDispositif ? "#1a1a1a" : "#ddd6c8", color: "#fff", fontSize: 13, fontWeight: 600, cursor: transportDispositif ? "pointer" : "default" }}>
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Disponibilites ═══ */}
      {showDispoModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "flex-end", zIndex: 200 }} onClick={() => setShowDispoModal(false)}>
          <div style={{ background: "#fff", width: 380, height: "100%", padding: 24, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Disponibilites</h2>
              <button type="button" onClick={() => setShowDispoModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
            </div>
            {["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"].map((j, idx) => {
              const dispos = ((emp as Record<string, unknown>).disponibilites as Record<string, unknown>) ?? {};
              const val = String(dispos[String(idx)] ?? "journee");
              return (
                <div key={j} style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>{j}</label>
                  <select id={`dispo-modal-${idx}`} defaultValue={val === "false" || val === "indisponible" ? "indisponible" : val === "matin" ? "matin" : val === "soir" ? "soir" : "journee"} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14 }}>
                    <option value="journee">Journée</option>
                    <option value="matin">Matin</option>
                    <option value="soir">Soir</option>
                    <option value="indisponible">Indisponible</option>
                  </select>
                </div>
              );
            })}
            <div style={{ position: "sticky", bottom: 0, paddingTop: 16 }}>
              <button type="button" onClick={async () => {
                const dispos: Record<string, string> = {};
                for (let i = 0; i < 7; i++) {
                  const sel = document.getElementById(`dispo-modal-${i}`) as HTMLSelectElement;
                  if (sel) dispos[String(i)] = sel.value;
                }
                await supabase.from("employes").update({ disponibilites: dispos }).eq("id", emp.id);
                setEmp((prev: Record<string, unknown>) => ({ ...prev, disponibilites: dispos }));
                setShowDispoModal(false);
              }} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL: Planification ═══ */}
      {showPlanifModal && (() => {
        const currentAccess = ((emp as Record<string, unknown>).equipes_access as string[]) ?? [];
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "flex-end", zIndex: 200 }} onClick={() => setShowPlanifModal(false)}>
            <div style={{ background: "#fff", width: 400, height: "100%", padding: 24, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>Planification</h2>
                <button type="button" onClick={() => setShowPlanifModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
              </div>
              <div style={{ padding: 12, borderRadius: 8, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", marginBottom: 16, fontSize: 12, color: "#2563eb", lineHeight: 1.4 }}>
                <strong>L&apos;employé est toujours planifiable sur son équipe de rattachement au contrat</strong><br />
                L&apos;établissement et l&apos;équipe par défaut dépendent du contrat de travail en cours.
              </div>
              <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>Sélectionnez les équipes sur lesquelles {prenom} peut être planifié(e) :</p>

              {etablissements.map(et => {
                const isDefault = et.id === (emp as Record<string, unknown>).etablissement_id;
                return (
                  <div key={et.id} style={{ border: "1px solid #ddd6c8", borderRadius: 10, padding: 14, marginBottom: 10 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 8 }}>
                      {et.nom} {isDefault ? "(par défaut)" : ""}
                    </div>
                    {/* Load equipes for this etab inline */}
                    <PlanifEquipes etabId={et.id} currentAccess={currentAccess} empId={emp.id as string} onUpdate={(newAccess) => {
                      setEmp((prev: Record<string, unknown>) => ({ ...prev, equipes_access: newAccess }));
                    }} />
                  </div>
                );
              })}

              <div style={{ position: "sticky", bottom: 0, paddingTop: 16 }}>
                <button type="button" onClick={() => setShowPlanifModal(false)} style={{ width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══ MODAL: Avenant ═══ */}
      {showAvenantModal && (() => {
        const ac = activeContrat;
        if (!ac) return null;

        const saveAvenant = async () => {
          const updates: Record<string, unknown> = {};
          if (avenantChanges.includes("heures")) updates.heures_semaine = avenantHeures;
          if (avenantChanges.includes("salaire")) updates.remuneration = avenantSalaire;

          if (Object.keys(updates).length > 0) {
            await supabase.from("contrats").update(updates).eq("id", ac.id);
            setContrats(prev => prev.map(c => c.id === ac.id ? { ...c, ...updates } as Contrat : c));
          }
          setShowAvenantModal(false);
        };

        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "flex-end", zIndex: 200 }} onClick={() => setShowAvenantModal(false)}>
            <div style={{ background: "#fff", width: 420, height: "100%", padding: 24, overflowY: "auto", boxShadow: "-4px 0 20px rgba(0,0,0,0.15)" }} onClick={e => e.stopPropagation()}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <h2 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700 }}>
                  {avenantStep === 1 ? "Declarer un changement" : `Creer un avenant au contrat de ${prenom}`}
                </h2>
                <button type="button" onClick={() => setShowAvenantModal(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
              </div>

              {avenantStep === 1 && (
                <>
                  <div style={{ padding: 12, borderRadius: 8, background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", marginBottom: 16, fontSize: 12, color: "#666" }}>
                    Le changement sur le contrat necessite-t-il un avenant ?
                  </div>

                  <label style={{ display: "block", padding: 14, borderRadius: 10, marginBottom: 8, cursor: "pointer", border: avenantType === "permanent" ? "2px solid #2D6A4F" : "1px solid #ddd6c8", background: avenantType === "permanent" ? "rgba(45,106,79,0.04)" : "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <input type="radio" name="avenantChoice" checked={avenantType === "permanent"} onChange={() => setAvenantType("permanent")} />
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Creer un avenant</span>
                    </div>
                    <p style={{ fontSize: 11, color: "#666", margin: "0 0 0 26px", lineHeight: 1.4 }}>
                      L&apos;avenant est necessaire en cas de modification d&apos;une information essentielle telle que le type de contrat, le temps de travail, la qualification ou le poste.
                    </p>
                  </label>

                  <label style={{ display: "block", padding: 14, borderRadius: 10, marginBottom: 16, cursor: "pointer", border: avenantType === "ponctuel" ? "2px solid #2D6A4F" : "1px solid #ddd6c8", background: avenantType === "ponctuel" ? "rgba(45,106,79,0.04)" : "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <input type="radio" name="avenantChoice" checked={avenantType === "ponctuel"} onChange={() => setAvenantType("ponctuel")} />
                      <span style={{ fontSize: 14, fontWeight: 700 }}>Rectifier des informations du contrat</span>
                    </div>
                    <p style={{ fontSize: 11, color: "#666", margin: "0 0 0 26px", lineHeight: 1.4 }}>
                      Les informations non essentielles peuvent etre modifiees sans avenant. Important : Toute modification s&apos;applique retroactivement.
                    </p>
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <button type="button" onClick={() => setAvenantStep(2)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      Suivant
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                </>
              )}

              {avenantStep === 2 && (
                <>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 12 }}>{avenantStep} sur 2 — {avenantType === "permanent" ? "Details de l'avenant" : "Rectification"}</div>

                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 4 }}>Date d&apos;effet de l&apos;avenant <span style={{ color: "#DC2626" }}>*</span></label>
                    <input type="date" value={avenantDate} onChange={e => setAvenantDate(e.target.value)} style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const }} />
                  </div>

                  {avenantType === "permanent" && (
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", display: "block", marginBottom: 8 }}>Que souhaitez-vous faire ? <span style={{ color: "#DC2626" }}>*</span></label>
                      {[
                        { key: "heures", label: "Changer le temps de travail hebdomadaire et/ou la remuneration" },
                        { key: "jours", label: "Changer le nombre de jours travailles par semaine" },
                        { key: "emploi", label: "Changer l'intitule de l'emploi" },
                        { key: "qualification", label: "Changer la qualification" },
                      ].map(opt => (
                        <label key={opt.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", cursor: "pointer" }}>
                          <input type="checkbox" checked={avenantChanges.includes(opt.key)} onChange={e => {
                            if (e.target.checked) setAvenantChanges(prev => [...prev, opt.key]);
                            else setAvenantChanges(prev => prev.filter(k => k !== opt.key));
                          }} />
                          <span style={{ fontSize: 13 }}>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {avenantChanges.includes("heures") && (
                    <div style={{ padding: 16, borderRadius: 10, border: "1px solid #ddd6c8", marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Temps de travail hebdomadaire</div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 12, color: "#999" }}>Temps actuel</label>
                        <div style={{ fontSize: 14, fontWeight: 600, padding: "6px 0" }}>{ac.heures_semaine} hrs</div>
                      </div>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600 }}>Nouveau temps de travail hebdomadaire <span style={{ color: "#DC2626" }}>*</span></label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={avenantHeures} onChange={e => setAvenantHeures(Number(e.target.value))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const }} />
                          <span style={{ fontSize: 12, color: "#999" }}>hrs</span>
                        </div>
                      </div>
                      <div style={{ padding: 10, borderRadius: 8, background: "rgba(220,38,38,0.04)", border: "1px solid rgba(220,38,38,0.12)", fontSize: 11, color: "#DC2626", lineHeight: 1.4 }}>
                        Pour le calcul des heures supplementaires, il ne peut y avoir qu&apos;un seul temps de travail hebdomadaire par semaine civile. Combo utilise le temps contractuel effectif en debut de semaine.
                      </div>
                    </div>
                  )}

                  {(avenantChanges.includes("heures") || avenantChanges.includes("salaire")) && (
                    <div style={{ padding: 16, borderRadius: 10, border: "1px solid #ddd6c8", marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Salaire brut mensuel</div>
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 12, color: "#999" }}>Salaire actuel</label>
                        <div style={{ fontSize: 14, fontWeight: 600, padding: "6px 0" }}>{ac.remuneration.toLocaleString("fr-FR")} EUR</div>
                      </div>
                      <div>
                        <label style={{ fontSize: 12, color: "#1a1a1a", fontWeight: 600 }}>Nouveau salaire brut mensuel <span style={{ color: "#DC2626" }}>*</span></label>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <input type="number" value={avenantSalaire} onChange={e => setAvenantSalaire(Number(e.target.value))} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const }} />
                          <span style={{ fontSize: 12, color: "#999" }}>EUR</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16 }}>
                    <button type="button" onClick={() => setAvenantStep(1)} style={{ padding: "10px 16px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                      Retour
                    </button>
                    <button type="button" onClick={saveAvenant} disabled={avenantChanges.length === 0 && avenantType === "permanent"} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      Enregistrer l&apos;avenant
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
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

/* eslint-disable @typescript-eslint/no-unused-vars */
/* ── PlanifEquipes sub-component ── */
function PlanifEquipes({ etabId, currentAccess, empId, onUpdate }: {
  etabId: string; currentAccess: string[]; empId: string;
  onUpdate: (newAccess: string[]) => void;
}) {
  const [equipes, setEquipes] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("equipes").select("nom").eq("etablissement_id", etabId).eq("actif", true).order("nom");
      if (data) setEquipes(data.map((e: { nom: string }) => e.nom));
    })();
  }, [etabId]);

  const toggle = async (eq: string) => {
    const newAccess = currentAccess.includes(eq)
      ? currentAccess.filter(e => e !== eq)
      : [...currentAccess, eq];
    await supabase.from("employes").update({ equipes_access: newAccess }).eq("id", empId);
    onUpdate(newAccess);
  };

  return (
    <div>
      {equipes.length === 0 ? (
        <span style={{ fontSize: 12, color: "#999" }}>Aucune équipe configurée</span>
      ) : equipes.map(eq => {
        const isOn = currentAccess.includes(eq);
        return (
          <div key={eq} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0" }}>
            <span style={{ fontSize: 13, color: isOn ? "#1a1a1a" : "#999" }}>{eq} {currentAccess[0] === eq ? "(par défaut)" : ""}</span>
            <button type="button" onClick={() => toggle(eq)} style={{
              width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer",
              background: isOn ? "#2D6A4F" : "#ddd6c8", position: "relative",
            }}>
              <span style={{ position: "absolute", top: 2, left: isOn ? 18 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Styles ────────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "16px 16px 60px",
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



const section: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 10,
  padding: "16px 18px 20px",
  marginBottom: 14,
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


const absencePill: React.CSSProperties = {
  display: "inline-block", padding: "2px 10px", borderRadius: 8,
  fontSize: 12, fontWeight: 700,
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
