"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Contrat = {
  id: string;
  type: string;
  date_debut: string;
  date_fin: string | null;
  remuneration: number;
  emploi: string | null;
  qualification: string | null;
  heures_semaine: number;
  jours_semaine: number;
  actif: boolean;
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

type Tab = "identite" | "contrat" | "absences" | "admin";

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

/* ── Component ─────────────────────────────────────────────────── */

export default function EmployeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState(false);
  const [tab, setTab] = useState<Tab>("identite");

  // ── Employee fields ──
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

  // ── Related data ──
  const [contrats, setContrats] = useState<Contrat[]>([]);
  const [elements, setElements] = useState<ContratElement[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);

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

  /* ── Load ── */
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: emp } = await supabase
        .from("employes")
        .select("*")
        .eq("id", id)
        .single();

      if (cancelled || !emp) { setLoading(false); return; }

      setPrenom(emp.prenom ?? "");
      setNom(emp.nom ?? "");
      setInitiales(emp.initiales ?? "");
      setEmail(emp.email ?? "");
      setTelMobile(emp.tel_mobile ?? "");
      setTelFixe(emp.tel_fixe ?? "");
      setAdresse(emp.adresse ?? "");
      setCodePostal(emp.code_postal ?? "");
      setVille(emp.ville ?? "");
      setGenre(emp.genre ?? "");
      setDateNaissance(emp.date_naissance ?? "");
      setLieuNaissance(emp.lieu_naissance ?? "");
      setDeptNaissance(emp.departement_naissance ?? "");
      setNationalite(emp.nationalite ?? "France");
      setSituationFamiliale(emp.situation_familiale ?? "");
      setNbPersonnesCharge(emp.nb_personnes_charge ?? 0);
      setContactUrgPrenom(emp.contact_urgence_prenom ?? "");
      setContactUrgNom(emp.contact_urgence_nom ?? "");
      setContactUrgLien(emp.contact_urgence_lien ?? "");
      setContactUrgTel(emp.contact_urgence_tel ?? "");
      setNumeroSecu(emp.numero_secu ?? "");
      setHandicap(emp.handicap ?? false);
      setTypeHandicap(emp.type_handicap ?? "");
      setDateVisiteMedicale(emp.date_visite_medicale ?? "");
      setVisiteRenforcee(emp.visite_renforcee ?? false);
      setProchaineVisite(emp.prochaine_visite_medicale ?? "");
      setIban(emp.iban ?? "");
      setBic(emp.bic ?? "");
      setTitulaireCompte(emp.titulaire_compte ?? "");
      setMatricule(emp.matricule ?? "");
      setDateAnciennete(emp.date_anciennete ?? "");
      setTravailleurEtranger(emp.travailleur_etranger ?? false);
      setActif(emp.actif ?? true);

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

    const { error } = await supabase
      .from("employes")
      .update({
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
      })
      .eq("id", id);

    setSaving(false);
    if (error) { alert("Erreur : " + error.message); return; }
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

    // Reload contrats
    const { data } = await supabase.from("contrats").select("*").eq("employe_id", id).order("date_debut", { ascending: false });
    setContrats(data ?? []);
    setShowContratModal(false);
    setEditContratId(null);
    setSaving(false);
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

  if (loading) {
    return (
      <RequireRole allowedRoles={["group_admin"]}>
        <NavBar backHref="/rh/equipe" backLabel="Equipe" />
        <div style={{ textAlign: "center", padding: 60, color: "#999" }}>Chargement...</div>
      </RequireRole>
    );
  }

  const activeContrat = contrats.find((c) => c.actif);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <NavBar
        backHref="/rh/equipe"
        backLabel="Equipe"
        primaryAction={
          canWrite ? (
            <button type="button" onClick={handleSave} disabled={saving} style={saveBtnStyle}>
              {saving ? "..." : saveOk ? "OK" : "Sauvegarder"}
            </button>
          ) : undefined
        }
      />

      <div style={pageStyle}>
        {/* ── Header card ── */}
        <div style={headerCard}>
          <div style={avatarLarge}>
            {initiales || ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase()}
          </div>
          <div>
            <h1 style={nameStyle}>{prenom} {nom}</h1>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
              {activeContrat && (
                <>
                  <span style={contratPill(activeContrat.type)}>
                    {CONTRAT_LABELS[activeContrat.type] ?? activeContrat.type}
                  </span>
                  <span style={{ fontSize: 13, color: "#6f6a61" }}>
                    {activeContrat.heures_semaine}h/sem
                  </span>
                  {activeContrat.emploi && (
                    <span style={{ fontSize: 13, color: "#999" }}>· {activeContrat.emploi}</span>
                  )}
                </>
              )}
              <span style={statutPill(actif)}>{actif ? "Actif" : "Inactif"}</span>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div style={tabsRow}>
          {([
            ["identite", "Identite"],
            ["contrat", "Contrat"],
            ["absences", "Absences"],
            ["admin", "Admin"],
          ] as [Tab, string][]).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              style={tabBtn(tab === key)}
            >
              {label}
              {key === "contrat" && contrats.length > 0 && (
                <span style={tabCount}>{contrats.length}</span>
              )}
              {key === "absences" && absences.length > 0 && (
                <span style={tabCount}>{absences.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB: IDENTITE ═══ */}
        {tab === "identite" && (
          <>
            {/* Infos personnelles */}
            <div style={section}>
              <p style={sectionTitle}>Informations personnelles</p>
              <div style={grid2}>
                <Field label="Prenom" value={prenom} onChange={setPrenom} disabled={!canWrite} />
                <Field label="Nom" value={nom} onChange={setNom} disabled={!canWrite} />
              </div>
              <div style={grid3}>
                <FieldSelect label="Genre" value={genre} onChange={setGenre} disabled={!canWrite}
                  options={[["", "—"], ["H", "Homme"], ["F", "Femme"]]} />
                <Field label="Date de naissance" type="date" value={dateNaissance} onChange={setDateNaissance} disabled={!canWrite} />
                <Field label="Nationalite" value={nationalite} onChange={setNationalite} disabled={!canWrite} />
              </div>
              <div style={grid2}>
                <Field label="Lieu de naissance" value={lieuNaissance} onChange={setLieuNaissance} disabled={!canWrite} />
                <Field label="Dept. naissance" value={deptNaissance} onChange={setDeptNaissance} disabled={!canWrite} />
              </div>
              <div style={grid2}>
                <FieldSelect label="Situation familiale" value={situationFamiliale} onChange={setSituationFamiliale} disabled={!canWrite}
                  options={[["", "—"], ["celibataire", "Celibataire"], ["marie", "Marie(e)"], ["pacse", "Pacse(e)"], ["divorce", "Divorce(e)"], ["veuf", "Veuf(ve)"]]} />
                <Field label="Personnes a charge" type="number" value={String(nbPersonnesCharge)} onChange={(v) => setNbPersonnesCharge(Number(v) || 0)} disabled={!canWrite} />
              </div>
            </div>

            {/* Coordonnees */}
            <div style={section}>
              <p style={sectionTitle}>Coordonnees</p>
              <div style={grid2}>
                <Field label="Email" type="email" value={email} onChange={setEmail} disabled={!canWrite} />
                <Field label="Tel. mobile" value={telMobile} onChange={setTelMobile} disabled={!canWrite} />
              </div>
              <Field label="Tel. fixe" value={telFixe} onChange={setTelFixe} disabled={!canWrite} />
              <Field label="Adresse" value={adresse} onChange={setAdresse} disabled={!canWrite} />
              <div style={grid2}>
                <Field label="Code postal" value={codePostal} onChange={setCodePostal} disabled={!canWrite} />
                <Field label="Ville" value={ville} onChange={setVille} disabled={!canWrite} />
              </div>
            </div>

            {/* Contact urgence */}
            <div style={section}>
              <p style={sectionTitle}>Contact d&apos;urgence</p>
              <div style={grid2}>
                <Field label="Prenom" value={contactUrgPrenom} onChange={setContactUrgPrenom} disabled={!canWrite} />
                <Field label="Nom" value={contactUrgNom} onChange={setContactUrgNom} disabled={!canWrite} />
              </div>
              <div style={grid2}>
                <Field label="Lien" value={contactUrgLien} onChange={setContactUrgLien} disabled={!canWrite} placeholder="Conjoint, parent..." />
                <Field label="Telephone" value={contactUrgTel} onChange={setContactUrgTel} disabled={!canWrite} />
              </div>
            </div>
          </>
        )}

        {/* ═══ TAB: CONTRAT ═══ */}
        {tab === "contrat" && (
          <>
            {canWrite && (
              <div style={{ marginBottom: 12 }}>
                <button type="button" onClick={openNewContrat} style={addBtnStyle}>+ Nouveau contrat</button>
              </div>
            )}

            {contrats.length === 0 ? (
              <div style={{ ...section, textAlign: "center", color: "#999" }}>Aucun contrat</div>
            ) : contrats.map((c) => {
              const cElems = elements.filter((e) => e.contrat_id === c.id);
              return (
                <div key={c.id} style={{ ...section, borderLeft: c.actif ? "3px solid #D4775A" : "3px solid #ddd6c8" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={contratPill(c.type)}>{CONTRAT_LABELS[c.type] ?? c.type}</span>
                      {c.actif && <span style={{ fontSize: 11, fontWeight: 700, color: "#4a6741" }}>ACTIF</span>}
                      {!c.actif && <span style={{ fontSize: 11, color: "#bbb" }}>Termine</span>}
                    </div>
                    {canWrite && (
                      <button type="button" onClick={() => openEditContrat(c)} style={editBtnSmall}>Modifier</button>
                    )}
                  </div>

                  <div style={grid3}>
                    <div><span style={miniLabel}>Debut</span><br />{fmtDate(c.date_debut)}</div>
                    <div><span style={miniLabel}>Fin</span><br />{c.date_fin ? fmtDate(c.date_fin) : "—"}</div>
                    <div><span style={miniLabel}>Remuneration</span><br />{c.remuneration.toLocaleString("fr-FR")} EUR</div>
                  </div>
                  <div style={{ ...grid3, marginTop: 8 }}>
                    <div><span style={miniLabel}>Emploi</span><br />{c.emploi ?? "—"}</div>
                    <div><span style={miniLabel}>Heures/sem</span><br />{c.heures_semaine}h</div>
                    <div><span style={miniLabel}>Jours/sem</span><br />{c.jours_semaine}j</div>
                  </div>

                  {cElems.length > 0 && (
                    <div style={{ marginTop: 12, paddingTop: 10, borderTop: "1px solid #f0ebe3" }}>
                      <span style={{ ...miniLabel, marginBottom: 6, display: "block" }}>Elements</span>
                      {cElems.map((el) => (
                        <div key={el.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                          <span>{ELEMENT_LABELS[el.type] ?? el.type} — {el.libelle}</span>
                          <span style={{ fontWeight: 700 }}>{el.montant != null ? `${el.montant.toLocaleString("fr-FR")} EUR` : "—"}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}

        {/* ═══ TAB: ABSENCES ═══ */}
        {tab === "absences" && (
          <>
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
                          {a.date_fin !== a.date_debut && ` → ${fmtDate(a.date_fin)}`}
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

        {/* ═══ TAB: ADMIN ═══ */}
        {tab === "admin" && (
          <>
            <div style={section}>
              <p style={sectionTitle}>Identifiants</p>
              <div style={grid2}>
                <Field label="Matricule" value={matricule} onChange={setMatricule} disabled={!canWrite} />
                <Field label="Date anciennete" type="date" value={dateAnciennete} onChange={setDateAnciennete} disabled={!canWrite} />
              </div>
              <Field label="Numero securite sociale" value={numeroSecu} onChange={setNumeroSecu} disabled={!canWrite} />
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

function Field({ label, value, onChange, type = "text", disabled = false, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; disabled?: boolean; placeholder?: string;
}) {
  return (
    <div style={fieldRow}>
      <label style={labelSt}>{label}</label>
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

function FieldSelect({ label, value, onChange, options, disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  options: [string, string][]; disabled?: boolean;
}) {
  return (
    <div style={fieldRow}>
      <label style={labelSt}>{label}</label>
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
  if (!d) return "—";
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
  alignItems: "center",
  gap: 16,
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #ddd6c8",
  padding: "18px 20px",
  marginBottom: 16,
};

const avatarLarge: React.CSSProperties = {
  width: 52,
  height: 52,
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

const nameStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 22,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
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
  borderBottom: active ? "2px solid #D4775A" : "2px solid transparent",
  background: "none",
  color: active ? "#D4775A" : "#999",
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

const tabCount: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 18,
  height: 18,
  borderRadius: "50%",
  background: "#f0ebe3",
  fontSize: 10,
  fontWeight: 700,
  color: "#999",
};

const section: React.CSSProperties = {
  background: "#fff",
  border: "1px solid #ddd6c8",
  borderRadius: 14,
  padding: "16px 18px 20px",
  marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 14px",
  fontSize: 12,
  fontWeight: 800,
  letterSpacing: 1,
  color: "#D4775A",
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
  outline: "none", boxSizing: "border-box",
};

const miniLabel: React.CSSProperties = {
  fontSize: 10, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 0.5,
};

const saveBtnStyle: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", height: 32, padding: "0 16px",
  borderRadius: 20, border: "none", background: "#D4775A", color: "#fff",
  fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap",
};

const cancelBtn: React.CSSProperties = {
  padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8",
  background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

const addBtnStyle: React.CSSProperties = {
  padding: "7px 16px", borderRadius: 10, border: "1px solid #D4775A",
  background: "rgba(212,119,90,0.08)", color: "#D4775A",
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
