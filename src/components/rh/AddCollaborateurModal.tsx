"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

/* ── Props ──────────────────────────────────────────────────────── */

type Props = {
  etablissementId: string;
  onClose: () => void;
  onCreated?: () => void;
};

/* ── Constants ──────────────────────────────────────────────────── */

const CONTRAT_LABELS: Record<string, string> = {
  CDI: "CDI", CDD: "CDD", extra: "Extra", interim: "Intérim",
  apprenti: "Apprenti", stagiaire: "Stagiaire",
};

/* ── Component ──────────────────────────────────────────────────── */

export function AddCollaborateurModal({ etablissementId, onClose, onCreated }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [createdEmpId, setCreatedEmpId] = useState<string | null>(null);

  // Step 1 — Identite
  const [civilite, setCivilite] = useState<"M" | "Mme">("M");
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
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
  const [contratType, setContratType] = useState("CDI");
  const [equipe, setEquipe] = useState("");
  const [dbEquipes, setDbEquipes] = useState<string[]>([]);
  const [roleEmploye, setRoleEmploye] = useState("employe");
  const [emploi, setEmploi] = useState("");
  const [qualification, setQualification] = useState("");
  const [heures, setHeures] = useState(39);
  const [salaireBrut, setSalaireBrut] = useState(0);
  const [dateDebut, setDateDebut] = useState(new Date().toISOString().slice(0, 10));

  // Load equipes from DB
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("equipes").select("nom").eq("etablissement_id", etablissementId).eq("actif", true).order("nom");
      if (data && data.length > 0) {
        const noms = data.map(e => e.nom);
        setDbEquipes(noms);
        if (!equipe) setEquipe(noms[0]);
      } else {
        // Fallback: derive from postes
        const { data: postes } = await supabase.from("postes").select("equipe").eq("etablissement_id", etablissementId).eq("actif", true);
        const noms = [...new Set((postes ?? []).map(p => p.equipe))].sort();
        setDbEquipes(noms.length > 0 ? noms : ["Cuisine", "Salle"]);
        if (!equipe && noms.length > 0) setEquipe(noms[0]);
      }
    })();
  }, [etablissementId]); // eslint-disable-line react-hooks/exhaustive-deps

  const step1Valid = !!prenom.trim() && !!nom.trim();

  const dpaeFields = [
    { label: "Civilite", ok: !!civilite },
    { label: "Prenom", ok: !!prenom.trim() },
    { label: "Nom", ok: !!nom.trim() },
    { label: "Date de naissance", ok: !!dateNaissance },
    { label: "N° Secu", ok: numSecu.replace(/\s/g, "").length === 15 },
    { label: "Nationalite", ok: !!nationalite.trim() },
    { label: "Dept. naissance", ok: !!deptNaissance.trim() },
    { label: "Commune", ok: !!communeNaissance.trim() },
    { label: "Email", ok: !!email.trim() },
    { label: "Telephone", ok: !!telMobile.trim() },
    { label: "Adresse", ok: !!adresse.trim() },
    { label: "Code postal", ok: !!codePostal.trim() },
    { label: "Ville", ok: !!ville.trim() },
    { label: "Type contrat", ok: !!contratType },
    { label: "Emploi", ok: !!emploi.trim() },
    { label: "Heures/sem", ok: heures > 0 || contratType === "extra" || contratType === "TNS" },
    { label: "Date debut", ok: !!dateDebut },
  ];
  const dpaeReady = dpaeFields.every((f) => f.ok);

  const handleCreate = async () => {
    if (!prenom.trim() || !nom.trim()) return;
    setSaving(true);

    const { data: emp, error } = await supabase
      .from("employes")
      .insert({
        etablissement_id: etablissementId,
        prenom: prenom.trim(),
        nom: nom.trim(),
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
        equipes_access: [equipe],
        role: roleEmploye,
        actif: true,
        date_anciennete: dateDebut || null,
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
      type: contratType,
      heures_semaine: heures,
      emploi: emploi.trim() || null,
      qualification: qualification.trim() || null,
      remuneration: salaireBrut,
      date_debut: dateDebut || new Date().toISOString().slice(0, 10),
      actif: true,
    });

    setSaving(false);
    setCreatedEmpId(emp.id);
    setStep(5);
    onCreated?.();
  };

  const close = () => onClose();

  return (
    <div style={S.overlay} onClick={close}>
      <div style={S.modal} onClick={(e) => e.stopPropagation()}>

        {/* Step indicator */}
        {step <= 4 && (
          <div style={S.stepRow}>
            {[1, 2, 3, 4].map((s) => (
              <div key={s} style={{ display: "flex", alignItems: "center" }}>
                <div style={S.stepDot(s === step, s < step)}>
                  {s < step ? "\u2713" : s}
                </div>
                {s < 4 && <div style={S.stepLine(s < step)} />}
              </div>
            ))}
          </div>
        )}

        {/* ═══ STEP 1 — Identite ═══ */}
        {step === 1 && (
          <>
            <h2 style={S.title}>Identite</h2>
            <div style={S.field}>
              <label style={S.label}>Civilite *</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["M", "Mme"] as const).map((c) => (
                  <button key={c} type="button" onClick={() => setCivilite(c)} style={S.pill(civilite === c)}>
                    {c === "M" ? "Monsieur" : "Madame"}
                  </button>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Prenom *</label>
                <input style={S.input} value={prenom} onChange={(e) => setPrenom(e.target.value)} placeholder="Jean" autoFocus />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Nom de naissance *</label>
                <input style={S.input} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Dupont" />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Nom d&apos;usage</label>
              <input style={S.input} value={nomUsage} onChange={(e) => setNomUsage(e.target.value)} placeholder="(si different)" />
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Nationalite</label>
                <input style={S.input} value={nationalite} onChange={(e) => setNationalite(e.target.value)} />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Date de naissance</label>
                <input type="date" style={S.input} value={dateNaissance} onChange={(e) => setDateNaissance(e.target.value)} />
              </div>
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Dept. naissance</label>
                <input style={S.input} value={deptNaissance} onChange={(e) => setDeptNaissance(e.target.value)} placeholder="29" />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Commune naissance</label>
                <input style={S.input} value={communeNaissance} onChange={(e) => setCommuneNaissance(e.target.value)} placeholder="Quimper" />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>
                N° Securite sociale
                <span style={{ color: "#D4775A", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>obligatoire DPAE</span>
              </label>
              <input style={S.input} value={numSecu} onChange={(e) => setNumSecu(e.target.value)} placeholder="1 85 05 29 019 123 45" maxLength={21} />
            </div>
            <div style={S.footer}>
              <button type="button" onClick={close} style={S.cancel}>Annuler</button>
              <button type="button" onClick={() => setStep(2)} disabled={!step1Valid}
                style={{ ...S.primary, opacity: step1Valid ? 1 : 0.5 }}>Suivant</button>
            </div>
          </>
        )}

        {/* ═══ STEP 2 — Coordonnees ═══ */}
        {step === 2 && (
          <>
            <h2 style={S.title}>Coordonnees</h2>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Email</label>
                <input type="email" style={S.input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jean@mail.com" autoFocus />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Tel. mobile</label>
                <input type="tel" style={S.input} value={telMobile} onChange={(e) => setTelMobile(e.target.value)} placeholder="06 12 34 56 78" />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Adresse</label>
              <input style={S.input} value={adresse} onChange={(e) => setAdresse(e.target.value)} placeholder="12 rue de la Paix" />
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: "0 0 120px" }}>
                <label style={S.label}>Code postal</label>
                <input style={S.input} value={codePostal} onChange={(e) => setCodePostal(e.target.value)} placeholder="29000" maxLength={5} />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Ville</label>
                <input style={S.input} value={ville} onChange={(e) => setVille(e.target.value)} placeholder="Quimper" />
              </div>
            </div>
            <div style={S.footer}>
              <button type="button" onClick={() => setStep(1)} style={S.cancel}>Retour</button>
              <button type="button" onClick={() => setStep(3)} style={S.primary}>Suivant</button>
            </div>
          </>
        )}

        {/* ═══ STEP 3 — Contrat ═══ */}
        {step === 3 && (
          <>
            <h2 style={S.title}>Contrat</h2>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Type *</label>
                <select style={S.input} value={contratType} onChange={(e) => setContratType(e.target.value)}>
                  {Object.entries(CONTRAT_LABELS).map(([k, v]) => (<option key={k} value={k}>{v}</option>))}
                </select>
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Date debut *</label>
                <input type="date" style={S.input} value={dateDebut} onChange={(e) => setDateDebut(e.target.value)} />
              </div>
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Equipe *</label>
                <select style={S.input} value={equipe} onChange={(e) => setEquipe(e.target.value)}>
                  {dbEquipes.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                </select>
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Emploi *</label>
                <input style={S.input} value={emploi} onChange={(e) => setEmploi(e.target.value)} placeholder="Pizzaiolo, Serveur..." autoFocus />
              </div>
            </div>
            <div style={S.field}>
              <label style={S.label}>Qualification HCR</label>
              <select style={S.input} value={qualification} onChange={(e) => setQualification(e.target.value)}>
                <option value="">— Choisir —</option>
                <option value="Employe">Employe (Niveau I)</option>
                <option value="Employe qualifie">Employe qualifie (Niveau II)</option>
                <option value="Agent de maitrise">Agent de maitrise (Niveau III)</option>
                <option value="Cadre">Cadre (Niveau IV-V)</option>
              </select>
            </div>
            <div style={S.field}>
              <label style={S.label}>Role</label>
              <select style={S.input} value={roleEmploye} onChange={(e) => setRoleEmploye(e.target.value)}>
                <option value="employe">Employe</option>
                <option value="manager">Manager</option>
                <option value="direction">Directeur</option>
                <option value="admin">Administrateur</option>
              </select>
            </div>
            <div style={S.row}>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Heures / semaine</label>
                <input type="number" style={S.input} value={heures} onChange={(e) => setHeures(Number(e.target.value))} min={0} max={48} />
              </div>
              <div style={{ ...S.field, flex: 1 }}>
                <label style={S.label}>Salaire brut mensuel</label>
                <input type="number" style={S.input} value={salaireBrut} onChange={(e) => setSalaireBrut(Number(e.target.value))} min={0} step={50} placeholder="0" />
              </div>
            </div>
            <div style={S.footer}>
              <button type="button" onClick={() => setStep(2)} style={S.cancel}>Retour</button>
              <button type="button" onClick={() => setStep(4)} style={S.primary}>Suivant</button>
            </div>
          </>
        )}

        {/* ═══ STEP 4 — DPAE Recap ═══ */}
        {step === 4 && (
          <>
            <h2 style={S.title}>DPAE — Recapitulatif</h2>
            <div style={S.recap}>
              <div style={S.recapTitle}>Etablissement</div>
              <div style={S.recapGrid}>
                <span style={S.recapLabel}>SIRET</span><span style={S.recapVal}>913 217 386 00014</span>
                <span style={S.recapLabel}>APE</span><span style={S.recapVal}>5610A</span>
                <span style={S.recapLabel}>Medecin travail</span><span style={S.recapVal}>MT090</span>
                <span style={S.recapLabel}>Convention</span><span style={S.recapVal}>HCR — IDCC 1979</span>
              </div>
            </div>
            <div style={S.recap}>
              <div style={S.recapTitle}>Salarie</div>
              <div style={S.recapGrid}>
                <span style={S.recapLabel}>Nom</span>
                <span style={S.recapVal}>{civilite} {prenom} {nom}{nomUsage ? ` (${nomUsage})` : ""}</span>
                <span style={S.recapLabel}>Ne(e) le</span>
                <span style={S.recapVal}>{dateNaissance || "—"} a {communeNaissance || "—"} ({deptNaissance || "—"})</span>
                <span style={S.recapLabel}>Secu</span>
                <span style={S.recapVal}>{numSecu || "—"}</span>
              </div>
            </div>
            <div style={S.recap}>
              <div style={S.recapTitle}>Contrat</div>
              <div style={S.recapGrid}>
                <span style={S.recapLabel}>Type</span>
                <span style={S.recapVal}>{CONTRAT_LABELS[contratType]} — {heures}h/sem</span>
                <span style={S.recapLabel}>Emploi</span><span style={S.recapVal}>{emploi || "—"}</span>
                <span style={S.recapLabel}>Date debut</span><span style={S.recapVal}>{dateDebut}</span>
                <span style={S.recapLabel}>Salaire</span><span style={S.recapVal}>{salaireBrut > 0 ? `${salaireBrut} \u20AC` : "—"}</span>
              </div>
            </div>
            <div style={{ marginTop: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#999", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>
                Champs DPAE
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {dpaeFields.map((f) => (
                  <span key={f.label} style={S.dpaeBadge(f.ok)}>
                    {f.ok ? "\u2713" : "\u2717"} {f.label}
                  </span>
                ))}
              </div>
            </div>
            <div style={S.footer}>
              <button type="button" onClick={() => setStep(3)} style={S.cancel}>Retour</button>
              <button type="button" onClick={handleCreate} disabled={saving}
                style={{ ...S.primary, padding: "0 18px", opacity: saving ? 0.5 : 1 }}>
                {saving ? "..." : dpaeReady ? "Creer + generer DPAE" : "Creer le collaborateur"}
              </button>
            </div>
          </>
        )}

        {/* ═══ STEP 5 — Success ═══ */}
        {step === 5 && createdEmpId && (
          <>
            <div style={{ textAlign: "center", padding: "20px 0 10px" }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>{"\u2705"}</div>
              <h2 style={{ ...S.title, marginBottom: 6 }}>Collaborateur cree</h2>
              <p style={{ fontSize: 14, color: "#6f6a61", margin: 0 }}>
                {prenom} {nom} — {CONTRAT_LABELS[contratType]} {heures}h
              </p>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => { close(); router.push(`/rh/employe/${createdEmpId}`); }}
                style={S.action("#D4775A")}>Voir la fiche employe</button>
              <button type="button" onClick={() => window.open("https://www.net-entreprises.fr/", "_blank")}
                style={S.action("#2563eb")}>Envoyer DPAE (net-entreprises.fr)</button>
              <button type="button" onClick={() => { close(); router.push(`/rh/employe/${createdEmpId}`); }}
                style={S.action("#4a6741")}>Generer contrat {contratType}</button>
              <button type="button" onClick={() => { close(); router.push(`/rh/employe/${createdEmpId}`); }}
                style={S.action("#7B1FA2")}>Planifier visite medicale</button>
            </div>
            <div style={{ textAlign: "center", marginTop: 16 }}>
              <button type="button" onClick={close}
                style={{ ...S.cancel, border: "none", color: "#999", fontSize: 13 }}>Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── Styles ──────────────────────────────────────────────────────── */

const S = {
  overlay: {
    position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 200, padding: 16,
  } as React.CSSProperties,
  modal: {
    background: "#fff", borderRadius: 16, padding: 28, width: "100%",
    maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
    boxShadow: "0 12px 40px rgba(0,0,0,0.15)",
  } as React.CSSProperties,
  title: {
    margin: "0 0 20px", fontSize: 20, fontWeight: 700,
    fontFamily: "var(--font-oswald), 'Oswald', sans-serif", color: "#1a1a1a",
  } as React.CSSProperties,
  field: { marginBottom: 14 } as React.CSSProperties,
  row: { display: "flex", gap: 12 } as React.CSSProperties,
  label: {
    display: "block", marginBottom: 4, fontSize: 12, fontWeight: 600, color: "#6f6a61",
  } as React.CSSProperties,
  input: {
    width: "100%", padding: "8px 12px", borderRadius: 8,
    border: "1px solid #ddd6c8", fontSize: 14, background: "#fff",
    outline: "none", boxSizing: "border-box",
  } as React.CSSProperties,
  footer: {
    display: "flex", gap: 10, marginTop: 20, justifyContent: "flex-end",
  } as React.CSSProperties,
  cancel: {
    padding: "8px 18px", borderRadius: 8, border: "1px solid #ddd6c8",
    background: "#fff", color: "#1a1a1a", fontSize: 14, fontWeight: 600, cursor: "pointer",
  } as React.CSSProperties,
  primary: {
    display: "inline-flex", alignItems: "center", height: 36, padding: "0 16px",
    borderRadius: 20, border: "none", background: "#D4775A", color: "#fff",
    fontSize: 14, fontWeight: 700, cursor: "pointer",
  } as React.CSSProperties,
  pill: (active: boolean): React.CSSProperties => ({
    padding: "5px 12px", borderRadius: 20,
    border: active ? "1px solid #D4775A" : "1px solid #ddd6c8",
    background: active ? "#D4775A" : "#fff",
    color: active ? "#fff" : "#1a1a1a", fontSize: 12, fontWeight: 600, cursor: "pointer",
  }),
  stepRow: {
    display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20,
  } as React.CSSProperties,
  stepDot: (active: boolean, done: boolean): React.CSSProperties => ({
    width: 28, height: 28, borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 12, fontWeight: 700, flexShrink: 0,
    background: done ? "#4a6741" : active ? "#D4775A" : "#e8e0d0",
    color: done || active ? "#fff" : "#999",
  }),
  stepLine: (done: boolean): React.CSSProperties => ({
    width: 32, height: 2, background: done ? "#4a6741" : "#e8e0d0",
  }),
  recap: {
    background: "#faf8f4", borderRadius: 10, padding: "12px 14px",
    marginBottom: 12, border: "1px solid #f0ebe3",
  } as React.CSSProperties,
  recapTitle: {
    fontSize: 11, fontWeight: 700, textTransform: "uppercase",
    letterSpacing: 1, color: "#999", marginBottom: 8,
    fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  } as React.CSSProperties,
  recapGrid: {
    display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13,
  } as React.CSSProperties,
  recapLabel: { color: "#6f6a61", fontWeight: 600 } as React.CSSProperties,
  recapVal: { color: "#1a1a1a" } as React.CSSProperties,
  dpaeBadge: (ok: boolean): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 4,
    padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600,
    background: ok ? "#e8ede6" : "#fde8e8", color: ok ? "#4a6741" : "#c0392b",
  }),
  action: (color: string): React.CSSProperties => ({
    display: "flex", alignItems: "center", justifyContent: "center",
    padding: "10px 16px", borderRadius: 10,
    border: `1px solid ${color}30`, background: `${color}0a`,
    color, fontSize: 14, fontWeight: 600, cursor: "pointer",
  }),
};
