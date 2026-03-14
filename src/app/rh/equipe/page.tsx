"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";

/* ── Types ─────────────────────────────────────────────────────── */

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  initiales: string | null;
  avatar_url: string | null;
  actif: boolean;
  etablissement_id: string;
  equipes_access: string[];
  contrats: {
    type: string;
    heures_semaine: number;
    emploi: string | null;
    actif: boolean;
  }[];
};

type Poste = {
  id: string;
  equipe: string;
  nom: string;
  couleur: string;
  emoji: string | null;
  actif: boolean;
};

type EquipeFilter = "tous" | "Cuisine" | "Salle" | "Shop";
type StatutFilter = "actif" | "inactif" | "tous";

/* ── Helpers ───────────────────────────────────────────────────── */

const CONTRAT_LABELS: Record<string, string> = {
  CDI: "CDI",
  CDD: "CDD",
  extra: "Extra",
  interim: "Intérim",
  apprenti: "Apprenti",
  stagiaire: "Stagiaire",
  TNS: "TNS",
};

const CONTRAT_COLORS: Record<string, { bg: string; fg: string }> = {
  CDI: { bg: "#e8ede6", fg: "#4a6741" },
  CDD: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  extra: { bg: "#FFF3E0", fg: "#E65100" },
  interim: { bg: "#F3E5F5", fg: "#7B1FA2" },
  TNS: { bg: "rgba(160,132,92,0.12)", fg: "#A0845C" },
  apprenti: { bg: "#E0F7FA", fg: "#00695C" },
  stagiaire: { bg: "#e8e0d0", fg: "#999999" },
};

function getInitials(prenom: string, nom: string): string {
  return ((prenom?.[0] ?? "") + (nom?.[0] ?? "")).toUpperCase();
}

/* ── Component ─────────────────────────────────────────────────── */

export default function EquipePage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const { canWrite } = useProfile();

  const [employes, setEmployes] = useState<Employe[]>([]);
  const [postes, setPostes] = useState<Poste[]>([]);
  const [loading, setLoading] = useState(true);
  const [equipeFilter, setEquipeFilter] = useState<EquipeFilter>("tous");
  const [statutFilter, setStatutFilter] = useState<StatutFilter>("actif");
  const [search, setSearch] = useState("");

  // ── DPAE wizard state ──
  const [showModal, setShowModal] = useState(false);
  const [dpaeStep, setDpaeStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [createdEmpId, setCreatedEmpId] = useState<string | null>(null);

  // Step 1 — Identite
  const [civilite, setCivilite] = useState<"M" | "Mme">("M");
  const [newPrenom, setNewPrenom] = useState("");
  const [newNom, setNewNom] = useState("");
  const [nomUsage, setNomUsage] = useState("");
  const [nationalite, setNationalite] = useState("Francaise");
  const [dateNaissance, setDateNaissance] = useState("");
  const [deptNaissance, setDeptNaissance] = useState("");
  const [communeNaissance, setCommuneNaissance] = useState("");
  const [numSecu, setNumSecu] = useState("");

  // Step 2 — Coordonnees
  const [email, setEmail] = useState("");
  const [telMobile, setTelMobile] = useState("");
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");

  // Step 3 — Contrat
  const [newContratType, setNewContratType] = useState("CDI");
  const [newEquipe, setNewEquipe] = useState("Cuisine");
  const [newEmploi, setNewEmploi] = useState("");
  const [newQualification, setNewQualification] = useState("");
  const [newHeures, setNewHeures] = useState(39);
  const [newSalaireBrut, setNewSalaireBrut] = useState(0);
  const [newDateDebut, setNewDateDebut] = useState(new Date().toISOString().slice(0, 10));

  /* ── Load data ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!etab) return;
      setLoading(true);
      const [empRes, postesRes] = await Promise.all([
        supabase
          .from("employes")
          .select("id, prenom, nom, initiales, avatar_url, actif, etablissement_id, equipes_access, contrats(type, heures_semaine, emploi, actif)")
          .eq("etablissement_id", etab.id)
          .order("nom", { ascending: true }),
        supabase
          .from("postes")
          .select("id, equipe, nom, couleur, emoji, actif")
          .eq("etablissement_id", etab.id)
          .eq("actif", true)
          .order("equipe")
          .order("nom"),
      ]);
      if (cancelled) return;
      setEmployes(empRes.data ?? []);
      setPostes(postesRes.data ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [etab]);

  /* ── Filtered list ── */
  const filtered = employes.filter((e) => {
    // Statut
    if (statutFilter === "actif" && !e.actif) return false;
    if (statutFilter === "inactif" && e.actif) return false;

    // Equipe
    if (equipeFilter !== "tous") {
      const access = e.equipes_access ?? [];
      if (access.length > 0 && !access.includes(equipeFilter)) return false;
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      const full = `${e.prenom} ${e.nom}`.toLowerCase();
      if (!full.includes(q)) return false;
    }

    return true;
  });

  /* ── DPAE field validation ── */
  const dpaeFields = [
    { label: "Civilite", ok: !!civilite },
    { label: "Prenom", ok: !!newPrenom.trim() },
    { label: "Nom de naissance", ok: !!newNom.trim() },
    { label: "Date de naissance", ok: !!dateNaissance },
    { label: "N° Securite sociale", ok: numSecu.replace(/\s/g, "").length === 15 },
    { label: "Nationalite", ok: !!nationalite.trim() },
    { label: "Dept. naissance", ok: !!deptNaissance.trim() },
    { label: "Commune naissance", ok: !!communeNaissance.trim() },
    { label: "Email", ok: !!email.trim() },
    { label: "Telephone", ok: !!telMobile.trim() },
    { label: "Adresse", ok: !!adresse.trim() },
    { label: "Code postal", ok: !!codePostal.trim() },
    { label: "Ville", ok: !!ville.trim() },
    { label: "Type contrat", ok: !!newContratType },
    { label: "Emploi", ok: !!newEmploi.trim() },
    { label: "Heures/semaine", ok: newHeures > 0 || newContratType === "extra" || newContratType === "TNS" },
    { label: "Date debut", ok: !!newDateDebut },
  ];
  const dpaeReady = dpaeFields.every((f) => f.ok);
  const step1Valid = !!newPrenom.trim() && !!newNom.trim();

  const resetModal = () => {
    setDpaeStep(1);
    setCreatedEmpId(null);
    setCivilite("M");
    setNewPrenom("");
    setNewNom("");
    setNomUsage("");
    setNationalite("Francaise");
    setDateNaissance("");
    setDeptNaissance("");
    setCommuneNaissance("");
    setNumSecu("");
    setEmail("");
    setTelMobile("");
    setAdresse("");
    setCodePostal("");
    setVille("");
    setNewContratType("CDI");
    setNewEquipe("Cuisine");
    setNewEmploi("");
    setNewQualification("");
    setNewHeures(39);
    setNewSalaireBrut(0);
    setNewDateDebut(new Date().toISOString().slice(0, 10));
  };

  /* ── Create employee + contrat ── */
  const handleCreate = async () => {
    if (!etab || !newPrenom.trim() || !newNom.trim()) return;
    setSaving(true);

    const { data: emp, error } = await supabase
      .from("employes")
      .insert({
        etablissement_id: etab.id,
        prenom: newPrenom.trim(),
        nom: newNom.trim(),
        civilite,
        nom_usage: nomUsage.trim() || null,
        nationalite: nationalite.trim() || null,
        date_naissance: dateNaissance || null,
        departement_naissance: deptNaissance.trim() || null,
        lieu_naissance: communeNaissance.trim() || null,
        numero_secu: numSecu.replace(/\s/g, "") || null,
        email: email.trim() || null,
        tel_mobile: telMobile.trim() || null,
        adresse: adresse.trim() || null,
        code_postal: codePostal.trim() || null,
        ville: ville.trim() || null,
        equipes_access: [newEquipe],
        role: "employe",
        actif: true,
        date_anciennete: newDateDebut || null,
      })
      .select("id")
      .single();

    if (error || !emp) {
      alert("Erreur : " + (error?.message ?? "inconnu"));
      setSaving(false);
      return;
    }

    await supabase.from("contrats").insert({
      employe_id: emp.id,
      type: newContratType,
      heures_semaine: newHeures,
      emploi: newEmploi.trim() || null,
      qualification: newQualification.trim() || null,
      remuneration: newSalaireBrut,
      date_debut: newDateDebut || new Date().toISOString().slice(0, 10),
      actif: true,
    });

    setSaving(false);
    setCreatedEmpId(emp.id);
    setDpaeStep(5); // success screen
  };

  /* ── Postes by equipe (for summary) ── */
  const equipes = ["Cuisine", "Salle", "Shop"] as const;
  const postesByEquipe = equipes.reduce(
    (acc, eq) => {
      acc[eq] = postes.filter((p) => p.equipe === eq);
      return acc;
    },
    {} as Record<string, Poste[]>,
  );

  /* ── Counts ── */
  const countActif = employes.filter((e) => e.actif).length;
  const countInactif = employes.filter((e) => !e.actif).length;

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <NavBar
        backHref="/"
        backLabel="Accueil"
        primaryAction={
          canWrite ? (
            <button
              type="button"
              onClick={() => setShowModal(true)}
              style={primaryBtnStyle}
            >
              + Employe
            </button>
          ) : undefined
        }
      />

      <div style={pageStyle}>
        {/* ── Header ── */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={h1Style}>Equipe</h1>
          <p style={subtitleStyle}>
            {countActif} actif{countActif > 1 ? "s" : ""}
            {countInactif > 0 && (
              <span style={{ color: "#bbb" }}> · {countInactif} inactif{countInactif > 1 ? "s" : ""}</span>
            )}
          </p>
        </div>

        {/* ── Postes summary ── */}
        <div style={postesSummaryStyle}>
          {equipes.map((eq) => {
            const list = postesByEquipe[eq] ?? [];
            if (list.length === 0) return null;
            return (
              <div key={eq} style={{ marginBottom: 8 }}>
                <div style={equipeLabelStyle}>{eq}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {list.map((p) => (
                    <span key={p.id} style={postePillStyle(p.couleur)}>
                      {p.emoji && <span style={{ marginRight: 4 }}>{p.emoji}</span>}
                      {p.nom}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Filters ── */}
        <div style={filtersRow}>
          {/* Search */}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher..."
            style={searchStyle}
          />

          {/* Equipe filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["tous", "Cuisine", "Salle", "Shop"] as EquipeFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setEquipeFilter(f)}
                style={pillBtn(equipeFilter === f)}
              >
                {f === "tous" ? "Tous" : f}
              </button>
            ))}
          </div>

          {/* Statut filter */}
          <div style={{ display: "flex", gap: 4 }}>
            {(["actif", "inactif", "tous"] as StatutFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatutFilter(f)}
                style={pillBtn(statutFilter === f)}
              >
                {f === "tous" ? "Tous" : f === "actif" ? "Actifs" : "Inactifs"}
              </button>
            ))}
          </div>
        </div>

        {/* ── Table ── */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 40, color: "#999" }}>
            Aucun employe trouve.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={thStyle}></th>
                  <th style={{ ...thStyle, textAlign: "left" }}>Nom</th>
                  <th style={{ ...thStyle, textAlign: "left" }} className="hide-mobile">Emploi</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Contrat</th>
                  <th style={{ ...thStyle, textAlign: "center" }} className="hide-mobile">Heures</th>
                  <th style={{ ...thStyle, textAlign: "center" }}>Statut</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const contrat = emp.contrats?.find((c) => c.actif) ?? emp.contrats?.[0];
                  const initials = emp.initiales || getInitials(emp.prenom, emp.nom);

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => router.push(`/rh/employe/${emp.id}`)}
                      style={trStyle}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "#f5f0e8";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      {/* Avatar */}
                      <td style={{ ...tdStyle, width: 44, paddingRight: 0 }}>
                        {emp.avatar_url ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={emp.avatar_url}
                            alt=""
                            style={avatarImgStyle}
                          />
                        ) : (
                          <div style={avatarStyle}>
                            {initials}
                          </div>
                        )}
                      </td>

                      {/* Nom */}
                      <td style={{ ...tdStyle, fontWeight: 600 }}>
                        <div>{emp.prenom} {emp.nom}</div>
                        {/* Mobile: show emploi inline */}
                        {contrat?.emploi && (
                          <div className="show-mobile" style={{ fontSize: 12, color: "#999", fontWeight: 400, marginTop: 2 }}>
                            {contrat.emploi}
                          </div>
                        )}
                      </td>

                      {/* Emploi */}
                      <td style={{ ...tdStyle, color: "#6f6a61" }} className="hide-mobile">
                        {contrat?.emploi ?? "—"}
                      </td>

                      {/* Contrat */}
                      <td style={{ ...tdStyle, textAlign: "center" }} className="hide-mobile">
                        {contrat ? (
                          <span style={contratBadge(contrat.type)}>
                            {CONTRAT_LABELS[contrat.type] ?? contrat.type}
                          </span>
                        ) : "—"}
                      </td>

                      {/* Heures */}
                      <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600 }} className="hide-mobile">
                        {contrat ? `${contrat.heures_semaine}h` : "—"}
                      </td>

                      {/* Statut */}
                      <td style={{ ...tdStyle, textAlign: "center" }}>
                        <span style={statutBadge(emp.actif)}>
                          {emp.actif ? "Actif" : "Inactif"}
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

      {/* ── DPAE Wizard Modal ── */}
      {showModal && (
        <div style={overlayStyle} onClick={() => { setShowModal(false); resetModal(); }}>
          <div style={wizardModalStyle} onClick={(e) => e.stopPropagation()}>

            {/* ── Step indicator ── */}
            {dpaeStep <= 4 && (
              <div style={stepIndicatorRow}>
                {[1, 2, 3, 4].map((s) => (
                  <div key={s} style={{ display: "flex", alignItems: "center", gap: 0 }}>
                    <div style={stepDot(s === dpaeStep, s < dpaeStep)}>
                      {s < dpaeStep ? "\u2713" : s}
                    </div>
                    {s < 4 && <div style={stepLine(s < dpaeStep)} />}
                  </div>
                ))}
              </div>
            )}

            {/* ════════════════════ STEP 1 — Identite ════════════════════ */}
            {dpaeStep === 1 && (
              <>
                <h2 style={modalTitleStyle}>Identite</h2>

                <div style={fieldRow}>
                  <label style={labelStyle}>Civilite *</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {(["M", "Mme"] as const).map((c) => (
                      <button key={c} type="button" onClick={() => setCivilite(c)}
                        style={pillBtn(civilite === c)}>
                        {c === "M" ? "Monsieur" : "Madame"}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Prenom *</label>
                    <input style={inputStyle} value={newPrenom}
                      onChange={(e) => setNewPrenom(e.target.value)} placeholder="Jean" autoFocus />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Nom de naissance *</label>
                    <input style={inputStyle} value={newNom}
                      onChange={(e) => setNewNom(e.target.value)} placeholder="Dupont" />
                  </div>
                </div>

                <div style={fieldRow}>
                  <label style={labelStyle}>Nom d&apos;usage</label>
                  <input style={inputStyle} value={nomUsage}
                    onChange={(e) => setNomUsage(e.target.value)} placeholder="(si different)" />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Nationalite</label>
                    <input style={inputStyle} value={nationalite}
                      onChange={(e) => setNationalite(e.target.value)} />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Date de naissance</label>
                    <input type="date" style={inputStyle} value={dateNaissance}
                      onChange={(e) => setDateNaissance(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Dept. naissance</label>
                    <input style={inputStyle} value={deptNaissance}
                      onChange={(e) => setDeptNaissance(e.target.value)} placeholder="29" />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Commune naissance</label>
                    <input style={inputStyle} value={communeNaissance}
                      onChange={(e) => setCommuneNaissance(e.target.value)} placeholder="Quimper" />
                  </div>
                </div>

                <div style={fieldRow}>
                  <label style={labelStyle}>
                    N° Securite sociale
                    <span style={{ color: "#D4775A", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                      obligatoire DPAE
                    </span>
                  </label>
                  <input style={inputStyle} value={numSecu}
                    onChange={(e) => setNumSecu(e.target.value)}
                    placeholder="1 85 05 29 019 123 45" maxLength={21} />
                </div>

                <div style={wizardFooter}>
                  <button type="button" onClick={() => { setShowModal(false); resetModal(); }}
                    style={cancelBtnStyle}>Annuler</button>
                  <button type="button" onClick={() => setDpaeStep(2)}
                    disabled={!step1Valid}
                    style={{ ...primaryBtnStyle, opacity: step1Valid ? 1 : 0.5 }}>
                    Suivant
                  </button>
                </div>
              </>
            )}

            {/* ════════════════════ STEP 2 — Coordonnees ════════════════════ */}
            {dpaeStep === 2 && (
              <>
                <h2 style={modalTitleStyle}>Coordonnees</h2>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" style={inputStyle} value={email}
                      onChange={(e) => setEmail(e.target.value)} placeholder="jean@mail.com" autoFocus />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Tel. mobile</label>
                    <input type="tel" style={inputStyle} value={telMobile}
                      onChange={(e) => setTelMobile(e.target.value)} placeholder="06 12 34 56 78" />
                  </div>
                </div>

                <div style={fieldRow}>
                  <label style={labelStyle}>Adresse</label>
                  <input style={inputStyle} value={adresse}
                    onChange={(e) => setAdresse(e.target.value)} placeholder="12 rue de la Paix" />
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: "0 0 120px" }}>
                    <label style={labelStyle}>Code postal</label>
                    <input style={inputStyle} value={codePostal}
                      onChange={(e) => setCodePostal(e.target.value)} placeholder="29000" maxLength={5} />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Ville</label>
                    <input style={inputStyle} value={ville}
                      onChange={(e) => setVille(e.target.value)} placeholder="Quimper" />
                  </div>
                </div>

                <div style={wizardFooter}>
                  <button type="button" onClick={() => setDpaeStep(1)} style={cancelBtnStyle}>
                    Retour
                  </button>
                  <button type="button" onClick={() => setDpaeStep(3)} style={primaryBtnStyle}>
                    Suivant
                  </button>
                </div>
              </>
            )}

            {/* ════════════════════ STEP 3 — Contrat ════════════════════ */}
            {dpaeStep === 3 && (
              <>
                <h2 style={modalTitleStyle}>Contrat</h2>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Type *</label>
                    <select style={inputStyle} value={newContratType}
                      onChange={(e) => setNewContratType(e.target.value)}>
                      {Object.entries(CONTRAT_LABELS).filter(([k]) => k !== "TNS").map(([k, v]) => (
                        <option key={k} value={k}>{v}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Date debut *</label>
                    <input type="date" style={inputStyle} value={newDateDebut}
                      onChange={(e) => setNewDateDebut(e.target.value)} />
                  </div>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Equipe *</label>
                    <select style={inputStyle} value={newEquipe}
                      onChange={(e) => setNewEquipe(e.target.value)}>
                      <option value="Cuisine">Cuisine</option>
                      <option value="Salle">Salle</option>
                      <option value="Shop">Shop</option>
                    </select>
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Emploi *</label>
                    <input style={inputStyle} value={newEmploi}
                      onChange={(e) => setNewEmploi(e.target.value)}
                      placeholder="Pizzaiolo, Serveur..." autoFocus />
                  </div>
                </div>

                <div style={fieldRow}>
                  <label style={labelStyle}>Qualification HCR</label>
                  <select style={inputStyle} value={newQualification}
                    onChange={(e) => setNewQualification(e.target.value)}>
                    <option value="">— Choisir —</option>
                    <option value="Employe">Employe (Niveau I)</option>
                    <option value="Employe qualifie">Employe qualifie (Niveau II)</option>
                    <option value="Agent de maitrise">Agent de maitrise (Niveau III)</option>
                    <option value="Cadre">Cadre (Niveau IV-V)</option>
                  </select>
                </div>

                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Heures / semaine</label>
                    <input type="number" style={inputStyle} value={newHeures}
                      onChange={(e) => setNewHeures(Number(e.target.value))} min={0} max={48} />
                  </div>
                  <div style={{ ...fieldRow, flex: 1 }}>
                    <label style={labelStyle}>Salaire brut mensuel</label>
                    <input type="number" style={inputStyle} value={newSalaireBrut}
                      onChange={(e) => setNewSalaireBrut(Number(e.target.value))} min={0} step={50}
                      placeholder="0" />
                  </div>
                </div>

                <div style={wizardFooter}>
                  <button type="button" onClick={() => setDpaeStep(2)} style={cancelBtnStyle}>
                    Retour
                  </button>
                  <button type="button" onClick={() => setDpaeStep(4)} style={primaryBtnStyle}>
                    Suivant
                  </button>
                </div>
              </>
            )}

            {/* ════════════════════ STEP 4 — DPAE Recap ════════════════════ */}
            {dpaeStep === 4 && (
              <>
                <h2 style={modalTitleStyle}>DPAE — Recapitulatif</h2>

                {/* Entreprise info */}
                <div style={recapSection}>
                  <div style={recapSectionTitle}>Etablissement</div>
                  <div style={recapGrid}>
                    <span style={recapLabel}>SIRET</span><span style={recapValue}>913 217 386 00014</span>
                    <span style={recapLabel}>APE</span><span style={recapValue}>5610A</span>
                    <span style={recapLabel}>Medecin travail</span><span style={recapValue}>MT090</span>
                    <span style={recapLabel}>Convention</span><span style={recapValue}>HCR — IDCC 1979</span>
                  </div>
                </div>

                {/* Employee recap */}
                <div style={recapSection}>
                  <div style={recapSectionTitle}>Salarie</div>
                  <div style={recapGrid}>
                    <span style={recapLabel}>Nom</span>
                    <span style={recapValue}>{civilite} {newPrenom} {newNom}{nomUsage ? ` (${nomUsage})` : ""}</span>
                    <span style={recapLabel}>Ne(e) le</span>
                    <span style={recapValue}>{dateNaissance || "—"} a {communeNaissance || "—"} ({deptNaissance || "—"})</span>
                    <span style={recapLabel}>Securite sociale</span>
                    <span style={recapValue}>{numSecu || "—"}</span>
                    <span style={recapLabel}>Nationalite</span>
                    <span style={recapValue}>{nationalite || "—"}</span>
                  </div>
                </div>

                <div style={recapSection}>
                  <div style={recapSectionTitle}>Contrat</div>
                  <div style={recapGrid}>
                    <span style={recapLabel}>Type</span>
                    <span style={recapValue}>{CONTRAT_LABELS[newContratType]} — {newHeures}h/sem</span>
                    <span style={recapLabel}>Emploi</span>
                    <span style={recapValue}>{newEmploi || "—"}</span>
                    <span style={recapLabel}>Qualification</span>
                    <span style={recapValue}>{newQualification || "—"}</span>
                    <span style={recapLabel}>Date debut</span>
                    <span style={recapValue}>{newDateDebut}</span>
                    <span style={recapLabel}>Salaire brut</span>
                    <span style={recapValue}>{newSalaireBrut > 0 ? `${newSalaireBrut} \u20AC` : "—"}</span>
                  </div>
                </div>

                {/* Missing fields */}
                <div style={{ marginTop: 16, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                    Champs DPAE
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {dpaeFields.map((f) => (
                      <span key={f.label} style={dpaeBadge(f.ok)}>
                        {f.ok ? "\u2713" : "\u2717"} {f.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={wizardFooter}>
                  <button type="button" onClick={() => setDpaeStep(3)} style={cancelBtnStyle}>
                    Retour
                  </button>
                  <button type="button" onClick={handleCreate} disabled={saving}
                    style={{ ...primaryBtnStyle, padding: "0 18px", opacity: saving ? 0.5 : 1 }}>
                    {saving ? "..." : dpaeReady ? "Creer + generer DPAE" : "Creer le collaborateur"}
                  </button>
                </div>
              </>
            )}

            {/* ════════════════════ STEP 5 — Success ════════════════════ */}
            {dpaeStep === 5 && createdEmpId && (
              <>
                <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
                  <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u2705"}</div>
                  <h2 style={{ ...modalTitleStyle, marginBottom: 6 }}>Collaborateur cree</h2>
                  <p style={{ fontSize: 14, color: "#6f6a61", margin: 0 }}>
                    {newPrenom} {newNom} — {CONTRAT_LABELS[newContratType]} {newHeures}h
                  </p>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
                  <button type="button"
                    onClick={() => { setShowModal(false); resetModal(); router.push(`/rh/employe/${createdEmpId}`); }}
                    style={actionBtn("#D4775A")}>
                    Voir la fiche employe
                  </button>
                  <button type="button"
                    onClick={() => window.open("https://www.net-entreprises.fr/", "_blank")}
                    style={actionBtn("#2563eb")}>
                    Envoyer DPAE (net-entreprises.fr)
                  </button>
                  <button type="button"
                    onClick={() => { setShowModal(false); resetModal(); router.push(`/rh/employe/${createdEmpId}`); }}
                    style={actionBtn("#4a6741")}>
                    Generer contrat {newContratType}
                  </button>
                  <button type="button"
                    onClick={() => { setShowModal(false); resetModal(); router.push(`/rh/employe/${createdEmpId}`); }}
                    style={actionBtn("#7B1FA2")}>
                    Planifier visite medicale
                  </button>
                </div>

                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button type="button"
                    onClick={() => { setShowModal(false); resetModal(); window.location.reload(); }}
                    style={{ ...cancelBtnStyle, border: "none", color: "#999", fontSize: 13 }}>
                    Fermer
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* ── Responsive CSS ── */}
      <style>{`
        .hide-mobile { }
        .show-mobile { display: none !important; }
        @media (max-width: 640px) {
          .hide-mobile { display: none !important; }
          .show-mobile { display: block !important; }
        }
      `}</style>
    </RequireRole>
  );
}

/* ── Styles ───────────────────────────────────────────────────── */

const pageStyle: React.CSSProperties = {
  maxWidth: 900,
  margin: "0 auto",
  padding: "16px 16px 60px",
};

const h1Style: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  textTransform: "uppercase",
  letterSpacing: 1.5,
  color: "#1a1a1a",
};

const subtitleStyle: React.CSSProperties = {
  margin: "4px 0 0",
  fontSize: 14,
  color: "#6f6a61",
  fontFamily: "var(--font-dm), 'DM Sans', sans-serif",
};

const postesSummaryStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #ddd6c8",
  padding: "14px 16px",
  marginBottom: 16,
};

const equipeLabelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#999",
  marginBottom: 6,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const postePillStyle = (color: string): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  padding: "3px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 600,
  background: `${color}18`,
  color,
  border: `1px solid ${color}30`,
});

const filtersRow: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  alignItems: "center",
  marginBottom: 16,
};

const searchStyle: React.CSSProperties = {
  flex: "1 1 160px",
  minWidth: 120,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 13,
  background: "#fff",
  outline: "none",
};

const pillBtn = (active: boolean): React.CSSProperties => ({
  padding: "5px 12px",
  borderRadius: 20,
  border: active ? "1px solid #D4775A" : "1px solid #ddd6c8",
  background: active ? "#D4775A" : "#fff",
  color: active ? "#fff" : "#1a1a1a",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
});

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  background: "#fff",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid #ddd6c8",
};

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#999",
  borderBottom: "1px solid #ddd6c8",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  fontSize: 14,
  borderBottom: "1px solid #f0ebe3",
  verticalAlign: "middle",
};

const trStyle: React.CSSProperties = {
  cursor: "pointer",
  transition: "background 0.15s",
};

const avatarStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: "#D4775A",
  color: "#fff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const avatarImgStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: "50%",
  objectFit: "cover",
};

const contratBadge = (type: string): React.CSSProperties => {
  const c = CONTRAT_COLORS[type] ?? { bg: "#e8e0d0", fg: "#999" };
  return {
    display: "inline-block",
    padding: "2px 10px",
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 700,
    background: c.bg,
    color: c.fg,
  };
};

const statutBadge = (actif: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 8,
  fontSize: 12,
  fontWeight: 700,
  background: actif ? "#e8ede6" : "#f0f0f0",
  color: actif ? "#4a6741" : "#bbb",
});

const primaryBtnStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  height: 32,
  padding: "0 14px",
  borderRadius: 20,
  border: "none",
  background: "#D4775A",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const cancelBtnStyle: React.CSSProperties = {
  padding: "8px 18px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  background: "#fff",
  color: "#1a1a1a",
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
};

/* ── Modal / Wizard ── */
const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 200,
  padding: 16,
};

const wizardModalStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 520,
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
};

const modalTitleStyle: React.CSSProperties = {
  margin: "0 0 20px",
  fontSize: 20,
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  color: "#1a1a1a",
};

const fieldRow: React.CSSProperties = {
  marginBottom: 14,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  fontSize: 12,
  fontWeight: 600,
  color: "#6f6a61",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid #ddd6c8",
  fontSize: 14,
  background: "#fff",
  outline: "none",
  boxSizing: "border-box",
};

const wizardFooter: React.CSSProperties = {
  display: "flex",
  gap: 10,
  marginTop: 20,
  justifyContent: "flex-end",
};

const stepIndicatorRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 0,
  marginBottom: 20,
};

const stepDot = (active: boolean, done: boolean): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: "50%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 12,
  fontWeight: 700,
  background: done ? "#4a6741" : active ? "#D4775A" : "#e8e0d0",
  color: done || active ? "#fff" : "#999",
  flexShrink: 0,
});

const stepLine = (done: boolean): React.CSSProperties => ({
  width: 32,
  height: 2,
  background: done ? "#4a6741" : "#e8e0d0",
});

const recapSection: React.CSSProperties = {
  background: "#faf8f4",
  borderRadius: 10,
  padding: "12px 14px",
  marginBottom: 12,
  border: "1px solid #f0ebe3",
};

const recapSectionTitle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 1,
  color: "#999",
  marginBottom: 8,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const recapGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "4px 12px",
  fontSize: 13,
};

const recapLabel: React.CSSProperties = {
  color: "#6f6a61",
  fontWeight: 600,
};

const recapValue: React.CSSProperties = {
  color: "#1a1a1a",
};

const dpaeBadge = (ok: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 600,
  background: ok ? "#e8ede6" : "#fde8e8",
  color: ok ? "#4a6741" : "#c0392b",
});

const actionBtn = (color: string): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "10px 16px",
  borderRadius: 10,
  border: `1px solid ${color}30`,
  background: `${color}0a`,
  color,
  fontSize: 14,
  fontWeight: 600,
  cursor: "pointer",
});
