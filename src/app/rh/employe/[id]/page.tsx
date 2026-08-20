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

/* ── Component ─────────────────────────────────────────────────── */

export default function EmployeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { current: etab, etablissements } = useEtablissement();
  const [empEtab, setEmpEtab] = useState<{ id: string; nom: string; couleur: string } | null>(null);
  const { canWrite, isGroupAdmin } = useProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);

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
  // IBAN/BIC removed — not displayed, not needed for completude
  const [matricule, setMatricule] = useState("");
  const [dateAnciennete, setDateAnciennete] = useState("");
  const [travailleurEtranger, setTravailleurEtranger] = useState(false);
  const [actif, setActif] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [photoUrl, setPhotoUrl] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [popinaOperateur, setPopinaOperateur] = useState("");
  const [popinaOps, setPopinaOps] = useState<string[]>([]);

  // ── Related data ──
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [, setElements] = useState<ContratElement[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);

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
  const [contratPostes, setContratPostes] = useState<{ id: string; nom: string; equipe: string | null }[]>([]);
  const [posteId, setPosteId] = useState<string>("");
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

  /* ── Sync active contrat fields for inline editing ── */
  useEffect(() => {
    const ac = contrats.find((c) => c.actif);
    if (ac && !editContratId) {
      setCType(ac.type);
      setCDebut(ac.date_debut);
      setCFin(ac.date_fin ?? "");
      setCRemuneration(ac.remuneration);
      setCEmploi(ac.emploi ?? "");
      setCQualification(ac.qualification ?? "");
      setCHeures(ac.heures_semaine);
      setCJours(ac.jours_semaine);
      setCActif(ac.actif);
      setEditContratId(ac.id);
      loadContratEquipes();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contrats]);

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

        // Load postes available on this establishment
        const { data: postesData } = await supabase
          .from("postes")
          .select("id, nom, equipe")
          .eq("etablissement_id", empData.etablissement_id)
          .eq("actif", true)
          .order("equipe", { ascending: true })
          .order("nom", { ascending: true });
        if (postesData && !cancelled) {
          setContratPostes(postesData as { id: string; nom: string; equipe: string | null }[]);
        }
      }
      // Load existing poste_id
      if (empData.poste_id) setPosteId(empData.poste_id);

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
      setMatricule(empData.matricule ?? "");
      setDateAnciennete(empData.date_anciennete ?? "");
      setTravailleurEtranger(empData.travailleur_etranger ?? false);
      setActif(empData.actif ?? true);
      setPhotoUrl(empData.photo_url ?? "");
      setRole(empData.role ?? "");
      setNote(empData.note ?? "");
      setPopinaOperateur(empData.popina_operateur ?? "");

      // Suggestions : operateurs presents dans les ventes des 90 derniers jours
      if (empData.etablissement_id) {
        const since = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
        supabase
          .from("ventes_lignes")
          .select("operateur")
          .eq("etablissement_id", empData.etablissement_id)
          .gte("date_service", since)
          .not("operateur", "is", null)
          .limit(2000)
          .then(({ data: opRows }) => {
            if (cancelled) return;
            const ops = [...new Set((opRows ?? []).map(r => (r.operateur as string).trim()).filter(Boolean))].sort();
            setPopinaOps(ops);
          });
      }

      // Load related
      const [contratsRes, absRes] = await Promise.all([
        supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false }),
        supabase.from("absences").select("*").eq("employe_id", id).order("date_debut", { ascending: false }),
      ]);

      if (cancelled) return;
      const cList = contratsRes.data ?? [];
      setContrats(cList);
      setAbsences(absRes.data ?? []);

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
      matricule: matricule || null, date_anciennete: dateAnciennete || null,
      travailleur_etranger: travailleurEtranger, actif,
      poste_id: posteId || null,
      popina_operateur: popinaOperateur.trim() || null,
    };

    // Only include note if the column exists (graceful handling)
    try {
      payload.note = note || null;
    } catch { /* ignore */ }

    // Also update equipe from the hidden select
    const newEquipe = (document.getElementById("contrat-equipe") as HTMLSelectElement)?.value;
    if (newEquipe) {
      const currentAccess = ((emp as Record<string, unknown>).equipes_access as string[]) ?? [];
      if (!currentAccess.includes(newEquipe)) {
        payload.equipes_access = [newEquipe, ...currentAccess];
      } else if (currentAccess[0] !== newEquipe) {
        payload.equipes_access = [newEquipe, ...currentAccess.filter((e: string) => e !== newEquipe)];
      }
    }

    const { error } = await supabase
      .from("employes")
      .update(payload)
      .eq("id", id);

    if (error) { setSaving(false); alert("Erreur : " + error.message); return; }

    // Update equipe local state
    if (payload.equipes_access) {
      setEmp((prev: Record<string, unknown>) => ({ ...prev, equipes_access: payload.equipes_access }));
    }

    // Also update active contrat fields (type, remuneration) if there is one
    if (editContratId) {
      const { error: cErr } = await supabase
        .from("contrats")
        .update({ type: cType, remuneration: cRemuneration })
        .eq("id", editContratId);
      if (cErr) { setSaving(false); alert("Erreur contrat : " + cErr.message); return; }
      // Reload contrats
      const { data } = await supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false });
      setContrats(data ?? []);
    }

    setSaving(false);
    setSaveOk(true);
    setTimeout(() => setSaveOk(false), 2000);
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      <RequireRole allowedRoles={["group_admin", "manager"]}>
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
      </RequireRole>
    );
  }

  const activeContrat = contrats.find((c) => c.actif);
  const initDisplay = initiales || ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();

  return (
    <RequireRole allowedRoles={["group_admin", "manager"]}>
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
            const finalColor = (c === "#D4775A" && empEtab?.nom?.toLowerCase().includes("piccola")) ? "#e6c428" : c;
            return `linear-gradient(135deg, ${finalColor} 0%, ${finalColor}cc 100%)`;
          })(),
          borderRadius: 14, padding: 20, color: "#fff",
          marginBottom: 24,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
            <div style={{
              width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 18, fontWeight: 700, flexShrink: 0, color: "#fff",
            }}>
              {initDisplay}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
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
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, alignItems: "center" }}>
              {canWrite && (
                <button type="button" onClick={handleSave} disabled={saving} style={{
                  ...saveBtnStyle, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)",
                }}>
                  {saving ? "..." : saveOk ? "OK" : "Sauvegarder"}
                </button>
              )}
            </div>
          </div>

        </div>

        {/* ═══ INFORMATIONS PERSONNELLES ═══ */}
        <InfosTab
          canWrite={canWrite}
          prenom={prenom} setPrenom={setPrenom}
          nom={nom} setNom={setNom}
          email={email} setEmail={setEmail}
          telMobile={telMobile} setTelMobile={setTelMobile}
          popinaOperateur={popinaOperateur} setPopinaOperateur={setPopinaOperateur}
          popinaOps={popinaOps}
        />

        {/* ═══ TUILE: ETABLISSEMENT — parametrable, 2 etabs ═══ */}
        <AccordionSection
          title="Travail"
          icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /></svg>}
          iconColor="#D4775A" iconBg="rgba(212,119,90,0.10)"
        >
          {/* Etab cards — multi-select toggles */}
          {(() => {
            const empEtabIds = ((emp as Record<string, unknown>).etablissements_ids as string[] | null) ?? [];
            const fallbackId = (emp as Record<string, unknown>).etablissement_id as string | null;
            const selectedIds = empEtabIds.length > 0 ? empEtabIds : (fallbackId ? [fallbackId] : []);
            const toggleEtab = async (id: string) => {
              const isOn = selectedIds.includes(id);
              const next = isOn ? selectedIds.filter((x) => x !== id) : [...selectedIds, id];
              // Update DB immediately + local state
              await supabase.from("employes").update({
                etablissements_ids: next,
                // primary etab = first selected (or null if none)
                etablissement_id: next[0] ?? null,
              }).eq("id", emp.id);
              setEmp((prev: Record<string, unknown>) => ({ ...prev, etablissements_ids: next, etablissement_id: next[0] ?? null }));
              // Refresh empEtab display from primary
              if (next[0]) {
                const primary = etablissements.find((x) => x.id === next[0]);
                if (primary) setEmpEtab({ id: primary.id, nom: primary.nom, couleur: primary.couleur ?? "#D4775A" });
              } else {
                setEmpEtab(null);
              }
              // Sync hidden select for handleSave
              const sel = document.getElementById("contrat-etab") as HTMLSelectElement | null;
              if (sel) sel.value = next[0] ?? "";
            };
            return (
              <div style={{ display: "flex", flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                {etablissements.map((e) => {
                  const isActive = selectedIds.includes(e.id);
                  const c = e.couleur ?? "#D4775A";
                  return (
                    <button
                      key={e.id}
                      type="button"
                      disabled={!canWrite}
                      onClick={() => toggleEtab(e.id)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 999,
                        border: isActive ? `1.5px solid ${c}` : "1px solid #e0d8ce",
                        background: isActive ? `${c}12` : "#fff",
                        cursor: canWrite ? "pointer" : "default",
                        display: "inline-flex", alignItems: "center", gap: 8,
                        fontFamily: "inherit",
                        transition: "all 0.15s",
                      }}
                    >
                      <span style={{
                        width: 8, height: 8, borderRadius: "50%",
                        background: c, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 12, fontWeight: 700,
                        color: isActive ? c : "#666",
                        fontFamily: "var(--font-oswald), Oswald, sans-serif",
                        textTransform: "uppercase", letterSpacing: ".04em",
                      }}>
                        {e.nom}
                      </span>
                      {isActive && (
                        <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })()}

          {/* Hidden select read by handleSave */}
          <select
            id="contrat-etab"
            defaultValue={empEtab?.id ?? (emp as Record<string, unknown>).etablissement_id as string ?? ""}
            style={{ display: "none" }}
          >
            <option value="">--</option>
            {etablissements.map((e) => (<option key={e.id} value={e.id}>{e.nom}</option>))}
          </select>

          {/* Equipe + Poste */}
          {(() => {
            const currentEquipe = (((emp as Record<string, unknown>).equipes_access as string[] ?? [])[0]) ?? "";
            const filteredPostes = currentEquipe
              ? contratPostes.filter((p) => p.equipe === currentEquipe)
              : contratPostes;
            return (
              <div style={grid2}>
                <div>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4, fontWeight: 600 }}>Equipe</div>
                  <select
                    id="contrat-equipe"
                    style={inputSt}
                    defaultValue={currentEquipe}
                    disabled={!canWrite}
                  >
                    <option value="">-- Aucune --</option>
                    {contratEquipes.map((eq) => (
                      <option key={eq} value={eq}>{eq}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: "#999", marginBottom: 4, fontWeight: 600 }}>Poste</div>
                  <select
                    style={inputSt}
                    value={posteId}
                    onChange={(e) => setPosteId(e.target.value)}
                    disabled={!canWrite || filteredPostes.length === 0}
                  >
                    <option value="">{filteredPostes.length === 0 ? "Aucun poste configure" : "-- Aucun --"}</option>
                    {filteredPostes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nom}{p.equipe ? ` (${p.equipe})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}

          {/* Type contrat + Salaire (salaire : admins uniquement) */}
          <div style={grid2}>
            <FieldSelect
              label="Type de contrat"
              value={cType}
              onChange={setCType}
              disabled={!canWrite}
              options={Object.entries(CONTRAT_LABELS).map(([k, v]) => [k, v])}
            />
            {isGroupAdmin ? (
              <Field
                label="Salaire brut mensuel (EUR)"
                type="number"
                value={String(cRemuneration)}
                onChange={(v) => setCRemuneration(Number(v))}
                disabled={!canWrite}
              />
            ) : <div />}
          </div>

          {/* Dates d'entree / sortie */}
          {(() => {
            const e = emp as Record<string, unknown>;
            const updateDates = async (field: string, value: string) => {
              await supabase.from("employes").update({ [field]: value || null }).eq("id", emp.id);
              setEmp((prev: Record<string, unknown>) => ({ ...prev, [field]: value || null }));
            };
            return (
              <div style={grid2}>
                <div style={fieldRow}>
                  <label style={labelSt}>Date d&apos;entree</label>
                  <input type="date" style={inputSt} value={(e.date_entree as string) ?? ""} onChange={(ev) => updateDates("date_entree", ev.target.value)} disabled={!canWrite} />
                </div>
                <div style={fieldRow}>
                  <label style={labelSt}>Date de sortie</label>
                  <input type="date" style={inputSt} value={(e.date_sortie as string) ?? ""} onChange={(ev) => updateDates("date_sortie", ev.target.value)} disabled={!canWrite} />
                </div>
              </div>
            );
          })()}
        </AccordionSection>

        {/* ═══ COMPTE & ACCES ═══ */}
        <AccordionSection
          title="Compte & acces"
          icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#7C3AED" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>}
          iconColor="#7C3AED" iconBg="rgba(124,58,237,0.08)"
          defaultOpen
        >
          <CompteAcces
            emp={emp as Record<string, unknown>}
            setEmp={setEmp}
            isGroupAdmin={isGroupAdmin}
            etabIds={((emp as Record<string, unknown>).etablissements_ids as string[] | null) ?? ((emp as Record<string, unknown>).etablissement_id ? [(emp as Record<string, unknown>).etablissement_id as string] : [])}
            prenom={prenom}
            nom={nom}
            email={email}
          />
        </AccordionSection>

        {/* ═══ DOSSIER (paie / legal — replie) ═══ */}
        <AccordionSection
          title="Dossier (paie & legal)"
          defaultOpen={false}
          icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>}
          iconColor="#2563EB" iconBg="rgba(37,99,235,0.08)"
        >
          <div style={grid2}>
            <Field label="Adresse" value={adresse} onChange={setAdresse} disabled={!canWrite} />
            <Field label="Code postal" value={codePostal} onChange={setCodePostal} disabled={!canWrite} />
          </div>
          <div style={grid2}>
            <Field label="Ville" value={ville} onChange={setVille} disabled={!canWrite} />
            <Field label="Date de naissance" type="date" value={dateNaissance} onChange={setDateNaissance} disabled={!canWrite} />
          </div>
          <div style={grid2}>
            <Field label="N° Securite sociale" value={numeroSecu} onChange={setNumeroSecu} disabled={!canWrite} />
            <Field label="Matricule (paie)" value={matricule} onChange={setMatricule} disabled={!canWrite} />
          </div>
          <div style={{ marginTop: 8 }}>
            <a
              href={`/api/rh/rup?etab=${(emp as Record<string, unknown>).etablissement_id ?? ""}`}
              target="_blank" rel="noreferrer"
              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 8, border: "1px solid #ddd6c8", background: "#fff", fontSize: 12, fontWeight: 600, color: "#1a1a1a", textDecoration: "none" }}
            >
              Exporter le Registre Unique du Personnel
            </a>
            <div style={{ fontSize: 10, color: "#999", marginTop: 4 }}>
              Obligation legale (art. L1221-13) — genere a la demande a partir des fiches.
            </div>
          </div>
        </AccordionSection>

        {/* ═══ CONGES ET ABSENCES ═══ */}
        {(() => {
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

          return (
            <>
              {/* Historique absences */}
              <AccordionSection
                title={`Historique des absences (${absences.length})`}
                defaultOpen={false}
                icon={<svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>}
                iconColor="#D4775A" iconBg="rgba(212,119,90,0.1)"
              >
                {absences.length === 0 ? (
                  <p style={{ fontSize: 13, color: "#999", textAlign: "center", margin: 0 }}>Aucune absence enregistree</p>
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
                              <span style={{ fontSize: 11, fontWeight: 600, color: a.statut === "valide" ? "#2D6A4F" : a.statut === "refuse" ? "#DC2626" : "#D4775A" }}>
                                {a.statut === "valide" ? "Approuve" : a.statut === "refuse" ? "Refuse" : "En attente"}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </AccordionSection>
            </>
          );
        })()}

        {/* La section « Rôle et permissions » vivait ici en double de
            « Compte & accès » (elle écrivait même le rôle sans passer par
            /api/admin/set-role) — supprimée le 20/08/2026, demande Paul. */}
        {/* Bouton suppression — sans tuile, avec avertissement */}
        <div style={{
          marginTop: 32, marginBottom: 16,
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
        }}>
          <p style={{
            fontSize: 11, color: "#999", textAlign: "center",
            maxWidth: 360, lineHeight: 1.5, margin: 0,
          }}>
            Action irreversible. La suppression efface definitivement l&apos;employe ainsi que ses contrats, absences et shifts.
          </p>
          <button type="button" onClick={async () => {
            if (!confirm("Supprimer definitivement cet employe ? Ses contrats, absences et shifts seront aussi supprimes. Irreversible.")) return;
            const empId = emp.id as string;
            await supabase.from("contrat_elements").delete().in("contrat_id", contrats.map(c => c.id));
            await supabase.from("contrats").delete().eq("employe_id", empId);
            await supabase.from("absences").delete().eq("employe_id", empId);
            await supabase.from("shifts").delete().eq("employe_id", empId);
            await supabase.from("compteurs_employe").delete().eq("employe_id", empId);
            await supabase.from("combo_presences").delete().eq("employe_id", empId);
            await supabase.from("signatures").delete().eq("employe_id", empId);
            const { error } = await supabase.from("employes").delete().eq("id", empId);
            if (error) { alert("Erreur : " + error.message); return; }
            window.location.href = "/settings/employes";
          }} style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "10px 20px", borderRadius: 999,
            border: "1px solid rgba(220,38,38,0.4)",
            background: "transparent",
            color: "#DC2626",
            fontSize: 12, fontWeight: 700,
            fontFamily: "var(--font-oswald), Oswald, sans-serif",
            textTransform: "uppercase", letterSpacing: ".05em",
            cursor: "pointer",
          }}>
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Supprimer le compte
          </button>
        </div>
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

/* ── InfosTab — Accordion-based layout ─────────────────────────── */


/* ── Compte & accès : etat du compte, role unique, exceptions ── */
function CompteAcces({ emp, setEmp, isGroupAdmin, etabIds, prenom, nom, email }: {
  emp: Record<string, unknown>;
  setEmp: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  isGroupAdmin: boolean;
  etabIds: string[];
  prenom: string;
  nom: string;
  email: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const hasAccount = !!emp.auth_user_id;
  const role = String(emp.role ?? "equipier");
  const permRole = mapToPermRole(role);
  const custom = (emp.custom_permissions as Record<string, boolean> | null) ?? {};

  const ROLE_CHOICES: { perm: PermRole; app: string }[] = [
    { perm: "equipier", app: "equipier" },
    { perm: "manager", app: "manager" },
    { perm: "admin", app: "group_admin" },
  ];

  const setRole = async (appRole: string) => {
    if (!isGroupAdmin || busy) return;
    setBusy(true); setMsg("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/set-role", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ employeId: emp.id, role: appRole }),
    });
    const json = await res.json();
    if (!res.ok) setMsg(json.error ?? "Erreur");
    else {
      setEmp(prev => ({ ...prev, role: appRole }));
      setMsg(json.compteLie ? "Role mis a jour (fiche + compte)" : "Role mis a jour (fiche — pas encore de compte)");
    }
    setBusy(false);
    setTimeout(() => setMsg(""), 4000);
  };

  const sendInvite = async () => {
    if (!email) { setMsg("Renseigne d'abord un email dans Identite"); return; }
    if (!confirm(`Envoyer l'invitation a ${email} ?`)) return;
    setBusy(true); setMsg("");
    const { data: sess } = await supabase.auth.getSession();
    const res = await fetch("/api/admin/invite", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${sess?.session?.access_token ?? ""}` },
      body: JSON.stringify({ email, role, displayName: `${prenom} ${nom}`.trim(), etablissementsAccess: etabIds }),
    });
    const json = await res.json();
    setMsg(res.ok ? `Invitation envoyee a ${email}` : (json.error ?? "Erreur d'envoi"));
    setBusy(false);
  };

  const togglePerm = async (key: string) => {
    if (!isGroupAdmin) return;
    const defaultVal = DEFAULT_PERMS[permRole]?.[key] === true;
    const current = key in custom ? custom[key] : defaultVal;
    const next = { ...custom };
    if (!current === defaultVal) delete next[key]; // retour au defaut → pas d'exception
    else next[key] = !current;
    const value = Object.keys(next).length > 0 ? next : null;
    await supabase.from("employes").update({ custom_permissions: value }).eq("id", emp.id);
    setEmp(prev => ({ ...prev, custom_permissions: value }));
  };

  const resetPerms = async () => {
    if (!confirm("Supprimer toutes les exceptions et revenir aux permissions du role ?")) return;
    await supabase.from("employes").update({ custom_permissions: null }).eq("id", emp.id);
    setEmp(prev => ({ ...prev, custom_permissions: null }));
  };

  return (
    <div>
      {/* Etat du compte */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {hasAccount ? (
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(45,106,79,0.10)", color: "#2D6A4F" }}>
            Compte actif
          </span>
        ) : (
          <>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: "rgba(180,83,9,0.10)", color: "#b45309" }}>
              Jamais invite
            </span>
            {isGroupAdmin && (
              <button type="button" onClick={sendInvite} disabled={busy} style={{
                padding: "6px 14px", borderRadius: 8, border: "none", background: "#D4775A",
                color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: busy ? 0.6 : 1,
              }}>
                Envoyer l&apos;invitation
              </button>
            )}
          </>
        )}
        <span style={{ fontSize: 11, color: "#999" }}>{email || "— pas d'email"}</span>
      </div>

      {/* Role — source unique */}
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", marginBottom: 6 }}>Role</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
        {ROLE_CHOICES.map(({ perm, app }) => {
          const info = ROLE_INFO[perm];
          const active = mapToPermRole(role) === perm;
          return (
            <button key={perm} type="button" onClick={() => setRole(app)} disabled={!isGroupAdmin || busy} style={{
              padding: "7px 14px", borderRadius: 10, fontSize: 12, fontWeight: 700,
              border: active ? `1.5px solid ${info.color}` : "1px solid #ddd6c8",
              background: active ? info.bg : "#fff", color: active ? info.color : "#999",
              cursor: isGroupAdmin ? "pointer" : "default",
            }}>
              {info.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "#999", marginBottom: 4 }}>{ROLE_INFO[permRole].description}</div>
      {msg && <div style={{ fontSize: 11, fontWeight: 600, color: msg.startsWith("Erreur") || msg.startsWith("Renseigne") ? "#DC2626" : "#2D6A4F", marginBottom: 6 }}>{msg}</div>}

      {/* Exceptions de permissions (admins) */}
      {isGroupAdmin && (
        <div style={{ marginTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61" }}>Exceptions de permissions</span>
            {Object.keys(custom).length > 0 && (
              <button type="button" onClick={resetPerms} style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 6, border: "1px solid #ddd6c8", background: "#fff", color: "#999", cursor: "pointer" }}>
                Reinitialiser ({Object.keys(custom).length})
              </button>
            )}
          </div>
          {PERM_SECTIONS.map(sec => (
            <div key={sec.label} style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 9.5, fontWeight: 700, color: "#b0a894", textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 3 }}>{sec.label}</div>
              {sec.permissions.map(p => {
                const defaultVal = DEFAULT_PERMS[permRole]?.[p.key] === true;
                const effective = p.key in custom ? custom[p.key] : defaultVal;
                const isException = p.key in custom;
                return (
                  <button key={p.key} type="button" onClick={() => togglePerm(p.key)} style={{
                    display: "flex", alignItems: "center", gap: 8, width: "100%",
                    padding: "5px 8px", borderRadius: 8, border: "none",
                    background: isException ? "rgba(124,58,237,0.05)" : "transparent",
                    cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                  }}>
                    <span style={{
                      width: 30, height: 17, borderRadius: 999, flexShrink: 0, position: "relative",
                      background: effective ? "#2D6A4F" : "#ddd6c8", transition: "background .15s",
                    }}>
                      <span style={{ position: "absolute", top: 2, left: effective ? 15 : 2, width: 13, height: 13, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
                    </span>
                    <span style={{ fontSize: 12, color: "#1a1a1a", flex: 1 }}>{p.label}</span>
                    {isException && <span style={{ fontSize: 9, fontWeight: 700, color: "#7C3AED" }}>modifie</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AccordionSection({ title, icon, iconBg, defaultOpen = true, children }: {
  title: string; icon: React.ReactNode; iconColor?: string; iconBg?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  // Vraie section repliable : defaultOpen={false} pour les blocs secondaires
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{
      border: "1px solid #e0d8ce",
      borderRadius: 14,
      marginBottom: 14,
      background: "#fff",
      boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      overflow: "hidden",
    }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display: "flex", alignItems: "center", gap: 10, width: "100%",
          padding: open ? "16px 18px 12px" : "16px 18px",
          background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
        }}
      >
        <span style={{
          width: 28, height: 28, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center",
          background: iconBg ?? "rgba(212,119,90,0.1)", flexShrink: 0,
        }}>
          {icon}
        </span>
        <span style={{
          flex: 1, textAlign: "left",
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 14, fontWeight: 700,
          textTransform: "uppercase", letterSpacing: ".05em",
          color: "#1a1a1a",
        }}>{title}</span>
        <span style={{ fontSize: 10, color: "#b0a894", transform: open ? "rotate(0)" : "rotate(-90deg)", transition: "transform .2s" }}>&#x25BC;</span>
      </button>
      {open && (
        <div style={{ padding: "0 18px 18px" }}>
          {children}
        </div>
      )}
    </div>
  );
}

const DEPT_OPTIONS: [string, string][] = [
  ["", "Selectionnez..."],
  ["01", "01 - Ain"], ["02", "02 - Aisne"], ["03", "03 - Allier"], ["04", "04 - Alpes-de-Haute-Provence"], ["05", "05 - Hautes-Alpes"],
  ["06", "06 - Alpes-Maritimes"], ["07", "07 - Ardeche"], ["08", "08 - Ardennes"], ["09", "09 - Ariege"], ["10", "10 - Aube"],
  ["11", "11 - Aude"], ["12", "12 - Aveyron"], ["13", "13 - Bouches-du-Rhone"], ["14", "14 - Calvados"], ["15", "15 - Cantal"],
  ["16", "16 - Charente"], ["17", "17 - Charente-Maritime"], ["18", "18 - Cher"], ["19", "19 - Correze"], ["2A", "2A - Corse-du-Sud"],
  ["2B", "2B - Haute-Corse"], ["21", "21 - Cote-d'Or"], ["22", "22 - Cotes-d'Armor"], ["23", "23 - Creuse"], ["24", "24 - Dordogne"],
  ["25", "25 - Doubs"], ["26", "26 - Drome"], ["27", "27 - Eure"], ["28", "28 - Eure-et-Loir"], ["29", "29 - Finistere"],
  ["30", "30 - Gard"], ["31", "31 - Haute-Garonne"], ["32", "32 - Gers"], ["33", "33 - Gironde"], ["34", "34 - Herault"],
  ["35", "35 - Ille-et-Vilaine"], ["36", "36 - Indre"], ["37", "37 - Indre-et-Loire"], ["38", "38 - Isere"], ["39", "39 - Jura"],
  ["40", "40 - Landes"], ["41", "41 - Loir-et-Cher"], ["42", "42 - Loire"], ["43", "43 - Haute-Loire"], ["44", "44 - Loire-Atlantique"],
  ["45", "45 - Loiret"], ["46", "46 - Lot"], ["47", "47 - Lot-et-Garonne"], ["48", "48 - Lozere"], ["49", "49 - Maine-et-Loire"],
  ["50", "50 - Manche"], ["51", "51 - Marne"], ["52", "52 - Haute-Marne"], ["53", "53 - Mayenne"], ["54", "54 - Meurthe-et-Moselle"],
  ["55", "55 - Meuse"], ["56", "56 - Morbihan"], ["57", "57 - Moselle"], ["58", "58 - Nievre"], ["59", "59 - Nord"],
  ["60", "60 - Oise"], ["61", "61 - Orne"], ["62", "62 - Pas-de-Calais"], ["63", "63 - Puy-de-Dome"], ["64", "64 - Pyrenees-Atlantiques"],
  ["65", "65 - Hautes-Pyrenees"], ["66", "66 - Pyrenees-Orientales"], ["67", "67 - Bas-Rhin"], ["68", "68 - Haut-Rhin"], ["69", "69 - Rhone"],
  ["70", "70 - Haute-Saone"], ["71", "71 - Saone-et-Loire"], ["72", "72 - Sarthe"], ["73", "73 - Savoie"], ["74", "74 - Haute-Savoie"],
  ["75", "75 - Paris"], ["76", "76 - Seine-Maritime"], ["77", "77 - Seine-et-Marne"], ["78", "78 - Yvelines"],
  ["79", "79 - Deux-Sevres"], ["80", "80 - Somme"], ["81", "81 - Tarn"], ["82", "82 - Tarn-et-Garonne"],
  ["83", "83 - Var"], ["84", "84 - Vaucluse"], ["85", "85 - Vendee"], ["86", "86 - Vienne"], ["87", "87 - Haute-Vienne"],
  ["88", "88 - Vosges"], ["89", "89 - Yonne"], ["90", "90 - Territoire de Belfort"],
  ["91", "91 - Essonne"], ["92", "92 - Hauts-de-Seine"], ["93", "93 - Seine-Saint-Denis"], ["94", "94 - Val-de-Marne"], ["95", "95 - Val-d'Oise"],
  ["971", "971 - Guadeloupe"], ["972", "972 - Martinique"], ["973", "973 - Guyane"], ["974", "974 - La Reunion"], ["976", "976 - Mayotte"],
];

const SIT_OPTIONS: [string, string][] = [
  ["", "Selectionnez..."], ["celibataire", "Celibataire"], ["marie", "Marie(e)"], ["pacse", "Pacse(e)"],
  ["divorce", "Divorce(e)"], ["veuf", "Veuf/Veuve"], ["separe", "Separe(e)"], ["concubinage", "Concubinage"],
];

function InfosTab(props: {
  canWrite: boolean;
  prenom: string; setPrenom: (v: string) => void;
  nom: string; setNom: (v: string) => void;
  email: string; setEmail: (v: string) => void;
  telMobile: string; setTelMobile: (v: string) => void;
  popinaOperateur: string; setPopinaOperateur: (v: string) => void;
  popinaOps: string[];
}) {
  const p = props;
  const cw = p.canWrite;
  const ic = (color: string) => <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;

  return (
    <AccordionSection
      title="Identite"
      icon={ic("#2D6A4F")}
      iconColor="#2D6A4F" iconBg="rgba(45,106,79,0.1)"
    >
      <div style={grid2}>
        <Field label="Prenom" value={p.prenom} onChange={p.setPrenom} disabled={!cw} />
        <Field label="Nom" value={p.nom} onChange={p.setNom} disabled={!cw} />
      </div>
      <div style={grid2}>
        <Field label="Email" type="email" value={p.email} onChange={p.setEmail} disabled={!cw} />
        <Field label="Tel. mobile" value={p.telMobile} onChange={p.setTelMobile} disabled={!cw} />
      </div>
      <div style={grid2}>
        <div style={fieldRow}>
          <label style={labelSt}>Caisse Popina (nom d&apos;operateur)</label>
          <input
            style={inputSt}
            value={p.popinaOperateur}
            onChange={(e) => p.setPopinaOperateur(e.target.value)}
            disabled={!cw}
            list="popina-ops"
            placeholder="ex. Elise, Pierrot, Polo…"
          />
          <datalist id="popina-ops">
            {p.popinaOps.map(op => <option key={op} value={op} />)}
          </datalist>
          <div style={{ fontSize: 10, color: "#999", marginTop: 3 }}>
            Relie la fiche aux ventes de la caisse — necessaire pour « Mon tableau ».
          </div>
        </div>
      </div>
    </AccordionSection>
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


const tabsRow: React.CSSProperties = {
  display: "flex",
  gap: 4,
  marginBottom: 16,
  borderBottom: "1px solid #ddd6c8",
  paddingBottom: 0,
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};

const tabBtn = (active: boolean, ec?: string): React.CSSProperties => ({
  padding: "8px 16px",
  border: "none",
  borderBottom: "none",
  borderRadius: 10,
  background: active ? (ec ? ec + "25" : "#fff") : "transparent",
  color: active ? "#1a1a1a" : "#999",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  display: "flex",
  alignItems: "center",
  gap: 6,
  whiteSpace: "nowrap",
  boxShadow: active ? "0 1px 4px rgba(0,0,0,0.1)" : "none",
  transition: "all 0.15s",
  flexShrink: 0,
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
