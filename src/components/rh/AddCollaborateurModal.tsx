"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | "success";

type FormData = {
  // Étape 1 — Identité
  civilite: string;
  prenom: string;
  nom: string;
  nom_usage: string;
  nationalite: string;
  date_naissance: string;
  departement_naissance: string;
  lieu_naissance: string;
  numero_secu: string;
  // Étape 2 — Coordonnées
  email: string;
  tel_mobile: string;
  adresse: string;
  code_postal: string;
  ville: string;
  // Étape 3 — Contrat
  contrat_type: string;
  equipe: string;
  emploi: string;
  qualification: string;
  heures_semaine: string;
  remuneration: string;
};

type Props = {
  onClose: () => void;
  onCreated: () => void;
  etablissementId: string | null;
};

const INITIAL: FormData = {
  civilite: "", prenom: "", nom: "", nom_usage: "", nationalite: "France",
  date_naissance: "", departement_naissance: "", lieu_naissance: "",
  numero_secu: "",
  email: "", tel_mobile: "", adresse: "", code_postal: "", ville: "",
  contrat_type: "CDI", equipe: "Cuisine", emploi: "", qualification: "",
  heures_semaine: "39", remuneration: "",
};

const DPAE_INFO = {
  siret: "91321738600014",
  ape: "5610A",
  medecin_travail: "MT090",
  convention: "HCR IDCC 1979",
};

// ── Component ────────────────────────────────────────────────────────────────

export function AddCollaborateurModal({ onClose, onCreated, etablissementId }: Props) {
  const [step, setStep] = useState<Step>(1);
  const [form, setForm] = useState<FormData>(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const set = (field: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [field]: e.target.value }));
  };

  const canGoStep2 = form.prenom.trim() && form.nom.trim();
  const canGoStep3 = true; // Coordonnées optionnelles
  const canGoStep4 = form.contrat_type && form.equipe && form.emploi.trim();

  // DPAE readiness checks
  const dpaeChecks = [
    { label: "Civilité", ok: !!form.civilite },
    { label: "Prénom + Nom", ok: !!form.prenom.trim() && !!form.nom.trim() },
    { label: "Date de naissance", ok: !!form.date_naissance },
    { label: "Lieu de naissance", ok: !!form.lieu_naissance.trim() },
    { label: "N° Sécurité sociale", ok: form.numero_secu.length >= 13 },
    { label: "Nationalité", ok: !!form.nationalite.trim() },
    { label: "Adresse", ok: !!form.adresse.trim() },
    { label: "Type de contrat", ok: !!form.contrat_type },
    { label: "Date d'embauche", ok: true }, // auto = today
  ];
  const dpaeReady = dpaeChecks.every(c => c.ok);

  async function handleSubmit() {
    if (!etablissementId) {
      setError("Aucun établissement sélectionné.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // 1. Create employe
      const { data: emp, error: empErr } = await supabase
        .from("employes")
        .insert({
          etablissement_id: etablissementId,
          civilite: form.civilite || null,
          prenom: form.prenom.trim(),
          nom: form.nom.trim().toUpperCase(),
          nom_usage: form.nom_usage.trim() || null,
          nationalite: form.nationalite || "France",
          date_naissance: form.date_naissance || null,
          departement_naissance: form.departement_naissance || null,
          lieu_naissance: form.lieu_naissance.trim() || null,
          numero_secu: form.numero_secu.trim() || null,
          email: form.email.trim() || null,
          tel_mobile: form.tel_mobile.trim() || null,
          adresse: form.adresse.trim() || null,
          code_postal: form.code_postal.trim() || null,
          ville: form.ville.trim() || null,
          equipe_access: [form.equipe],
          role: "employe",
          poste_rh: form.emploi.trim() || null,
          contrat_type: form.contrat_type,
          heures_semaine: form.heures_semaine ? parseFloat(form.heures_semaine) : null,
          actif: true,
        })
        .select("id")
        .single();

      if (empErr) throw empErr;

      // 2. Create contrat if not TNS
      if (form.contrat_type !== "TNS" && emp) {
        const { error: contratErr } = await supabase
          .from("contrats")
          .insert({
            employe_id: emp.id,
            type: form.contrat_type,
            date_debut: new Date().toISOString().slice(0, 10),
            remuneration: form.remuneration ? parseFloat(form.remuneration) : 0,
            emploi: form.emploi.trim(),
            qualification: form.qualification.trim() || null,
            heures_semaine: form.heures_semaine ? parseFloat(form.heures_semaine) : 35,
            actif: true,
          });

        if (contratErr) throw contratErr;
      }

      setCreatedId(emp.id);
      setStep("success");
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Erreur lors de la création : ${message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={headerStyle}>
          <div>
            <h2 style={titleStyle}>
              {step === "success" ? "Collaborateur créé" : "Nouveau collaborateur"}
            </h2>
            {step !== "success" && (
              <p style={{ margin: 0, fontSize: 11, color: "#999" }}>
                Étape {step} / 4 — {["Identité", "Coordonnées", "Contrat", "DPAE"][step - 1]}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} style={closeBtnStyle}>✕</button>
        </div>

        {/* Progress */}
        {step !== "success" && (
          <div style={{ display: "flex", gap: 4, padding: "0 20px 16px" }}>
            {[1, 2, 3, 4].map(s => (
              <div key={s} style={{
                flex: 1, height: 3, borderRadius: 2,
                background: s <= (step as number) ? "#D4775A" : "#ece6db",
                transition: "background 0.2s",
              }} />
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="errorBox" style={{ margin: "0 20px 12px" }}>{error}</div>
        )}

        {/* Content */}
        <div style={contentStyle}>
          {step === 1 && <StepIdentite form={form} set={set} />}
          {step === 2 && <StepCoordonnees form={form} set={set} />}
          {step === 3 && <StepContrat form={form} set={set} />}
          {step === 4 && <StepDPAE form={form} checks={dpaeChecks} />}
          {step === "success" && <StepSuccess form={form} createdId={createdId} onClose={onClose} />}
        </div>

        {/* Footer */}
        {step !== "success" && (
          <div style={footerStyle}>
            {step > 1 ? (
              <button type="button" className="btn" onClick={() => setStep((step - 1) as Step)}>
                ← Retour
              </button>
            ) : (
              <button type="button" className="btn" onClick={onClose}>Annuler</button>
            )}

            {step < 4 ? (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={
                  (step === 1 && !canGoStep2) ||
                  (step === 2 && !canGoStep3) ||
                  (step === 3 && !canGoStep4)
                }
                onClick={() => setStep(((step as number) + 1) as Step)}
              >
                Suivant →
              </button>
            ) : (
              <button
                type="button"
                className="btn btnPrimary"
                disabled={saving}
                onClick={handleSubmit}
              >
                {saving ? "Création..." : "Créer le collaborateur" + (dpaeReady ? " + générer DPAE" : "")}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 1: Identité ─────────────────────────────────────────────────────────

function StepIdentite({ form, set }: { form: FormData; set: (f: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={fieldRow}>
        <Field label="Civilité" required>
          <select className="input" value={form.civilite} onChange={set("civilite")}>
            <option value="">—</option>
            <option value="M">M.</option>
            <option value="Mme">Mme</option>
          </select>
        </Field>
      </div>

      <div style={fieldRow}>
        <Field label="Prénom" required>
          <input className="input" value={form.prenom} onChange={set("prenom")} placeholder="Prénom" />
        </Field>
        <Field label="Nom de naissance" required>
          <input className="input" value={form.nom} onChange={set("nom")} placeholder="NOM" />
        </Field>
      </div>

      <Field label="Nom d'usage (si différent)">
        <input className="input" value={form.nom_usage} onChange={set("nom_usage")} placeholder="Nom d'usage" />
      </Field>

      <Field label="Nationalité">
        <input className="input" value={form.nationalite} onChange={set("nationalite")} placeholder="France" />
      </Field>

      <div style={fieldRow}>
        <Field label="Date de naissance">
          <input className="input" type="date" value={form.date_naissance} onChange={set("date_naissance")} />
        </Field>
        <Field label="Département de naissance">
          <input className="input" value={form.departement_naissance} onChange={set("departement_naissance")} placeholder="44" />
        </Field>
      </div>

      <Field label="Commune de naissance">
        <input className="input" value={form.lieu_naissance} onChange={set("lieu_naissance")} placeholder="Nantes" />
      </Field>

      <Field label="N° de sécurité sociale" required hint="Obligatoire pour la DPAE">
        <input
          className="input"
          value={form.numero_secu}
          onChange={set("numero_secu")}
          placeholder="1 85 05 44 109 ..."
          maxLength={15}
          style={{
            borderColor: form.numero_secu.length > 0 && form.numero_secu.length < 13 ? "#8B1A1A" : undefined,
          }}
        />
      </Field>
    </div>
  );
}

// ── Step 2: Coordonnées ──────────────────────────────────────────────────────

function StepCoordonnees({ form, set }: { form: FormData; set: (f: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Email">
        <input className="input" type="email" value={form.email} onChange={set("email")} placeholder="prenom.nom@email.fr" />
      </Field>

      <Field label="Téléphone mobile">
        <input className="input" type="tel" value={form.tel_mobile} onChange={set("tel_mobile")} placeholder="06 12 34 56 78" />
      </Field>

      <Field label="Adresse">
        <input className="input" value={form.adresse} onChange={set("adresse")} placeholder="12 rue des Lilas" />
      </Field>

      <div style={fieldRow}>
        <Field label="Code postal">
          <input className="input" value={form.code_postal} onChange={set("code_postal")} placeholder="44000" maxLength={5} />
        </Field>
        <Field label="Ville">
          <input className="input" value={form.ville} onChange={set("ville")} placeholder="Nantes" />
        </Field>
      </div>
    </div>
  );
}

// ── Step 3: Contrat ──────────────────────────────────────────────────────────

function StepContrat({ form, set }: { form: FormData; set: (f: keyof FormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => void }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <Field label="Type de contrat" required>
        <select className="input" value={form.contrat_type} onChange={set("contrat_type")}>
          <option value="CDI">CDI</option>
          <option value="CDD">CDD</option>
          <option value="extra">Extra</option>
          <option value="interim">Intérim</option>
          <option value="apprenti">Apprenti</option>
          <option value="stagiaire">Stagiaire</option>
        </select>
      </Field>

      <Field label="Équipe" required>
        <select className="input" value={form.equipe} onChange={set("equipe")}>
          <option value="Cuisine">Cuisine</option>
          <option value="Salle">Salle</option>
        </select>
      </Field>

      <Field label="Emploi / Poste" required>
        <input className="input" value={form.emploi} onChange={set("emploi")} placeholder="Cuisinier, Pizzaïolo, Chef de rang..." />
      </Field>

      <Field label="Qualification HCR">
        <select className="input" value={form.qualification} onChange={set("qualification")}>
          <option value="">—</option>
          <option value="Employé niveau I">Employé niveau I</option>
          <option value="Employé niveau II">Employé niveau II</option>
          <option value="Employé niveau III">Employé niveau III</option>
          <option value="Agent de maîtrise niveau IV">Agent de maîtrise niveau IV</option>
          <option value="Agent de maîtrise niveau V">Agent de maîtrise niveau V</option>
          <option value="Cadre niveau VI">Cadre niveau VI</option>
        </select>
      </Field>

      <div style={fieldRow}>
        <Field label="Heures / semaine">
          <input className="input" type="number" value={form.heures_semaine} onChange={set("heures_semaine")} placeholder="39" min={0} max={48} />
        </Field>
        <Field label="Salaire brut mensuel (€)">
          <input className="input" type="number" value={form.remuneration} onChange={set("remuneration")} placeholder="1850" min={0} step={10} />
        </Field>
      </div>
    </div>
  );
}

// ── Step 4: DPAE ─────────────────────────────────────────────────────────────

function StepDPAE({ form, checks }: { form: FormData; checks: { label: string; ok: boolean }[] }) {
  const allOk = checks.every(c => c.ok);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {/* Récap employeur */}
      <div className="card" style={{ padding: 14 }}>
        <h4 style={sectionTitle}>Informations employeur</h4>
        <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
          <InfoRow label="SIRET" value={DPAE_INFO.siret} />
          <InfoRow label="Code APE" value={DPAE_INFO.ape} />
          <InfoRow label="Médecin du travail" value={DPAE_INFO.medecin_travail} />
          <InfoRow label="Convention" value={DPAE_INFO.convention} />
        </div>
      </div>

      {/* Récap salarié */}
      <div className="card" style={{ padding: 14 }}>
        <h4 style={sectionTitle}>Récapitulatif salarié</h4>
        <div style={{ display: "grid", gap: 6, fontSize: 12 }}>
          <InfoRow label="Nom" value={`${form.civilite ? form.civilite + " " : ""}${form.prenom} ${form.nom.toUpperCase()}`} />
          <InfoRow label="Né(e) le" value={form.date_naissance ? new Date(form.date_naissance).toLocaleDateString("fr-FR") : "—"} />
          <InfoRow label="N° sécu" value={form.numero_secu || "—"} />
          <InfoRow label="Contrat" value={`${form.contrat_type} — ${form.emploi}`} />
          <InfoRow label="Heures/sem" value={form.heures_semaine ? `${form.heures_semaine}h` : "—"} />
        </div>
      </div>

      {/* Checklist DPAE */}
      <div className="card" style={{ padding: 14 }}>
        <h4 style={sectionTitle}>
          Vérification DPAE
          {allOk ? (
            <span style={checkBadge("#4a6741")}>Complet</span>
          ) : (
            <span style={checkBadge("#8B1A1A")}>Incomplet</span>
          )}
        </h4>
        <div style={{ display: "grid", gap: 4 }}>
          {checks.map((c) => (
            <div key={c.label} style={{
              display: "flex", alignItems: "center", gap: 8,
              fontSize: 12, color: c.ok ? "#4a6741" : "#8B1A1A",
            }}>
              <span style={{
                width: 18, height: 18, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 10, fontWeight: 700,
                background: c.ok ? "rgba(74,103,65,0.10)" : "rgba(139,26,26,0.08)",
                border: `1px solid ${c.ok ? "rgba(74,103,65,0.25)" : "rgba(139,26,26,0.25)"}`,
              }}>
                {c.ok ? "✓" : "✕"}
              </span>
              {c.label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Success Screen ───────────────────────────────────────────────────────────

function StepSuccess({ form, createdId, onClose }: { form: FormData; createdId: string | null; onClose: () => void }) {
  return (
    <div style={{ textAlign: "center", padding: "20px 0" }}>
      <div style={{
        width: 56, height: 56, borderRadius: "50%",
        background: "rgba(74,103,65,0.10)", border: "2px solid rgba(74,103,65,0.25)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 24, margin: "0 auto 16px",
      }}>
        ✓
      </div>

      <h3 style={{
        margin: "0 0 4px", fontSize: 18, fontWeight: 700, color: "#1a1a1a",
        fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
      }}>
        {form.prenom} {form.nom.toUpperCase()}
      </h3>
      <p style={{ margin: "0 0 24px", fontSize: 13, color: "#999" }}>
        a été ajouté(e) à l&apos;équipe {form.equipe}
      </p>

      {/* Actions rapides */}
      <div style={{ display: "grid", gap: 8, maxWidth: 280, margin: "0 auto" }}>
        <button type="button" className="btn" onClick={onClose} style={{ width: "100%" }}>
          Voir la fiche complète
        </button>
        <a
          href="https://www.net-entreprises.fr/declaration/dpae/"
          target="_blank"
          rel="noopener noreferrer"
          className="btn"
          style={{ width: "100%", textDecoration: "none", textAlign: "center" }}
        >
          Envoyer la DPAE ↗
        </a>
        <button type="button" className="btn" disabled style={{ width: "100%", opacity: 0.5 }}>
          Générer le contrat CDI (bientôt)
        </button>
        <button type="button" className="btn" disabled style={{ width: "100%", opacity: 0.5 }}>
          Planifier la visite médicale (bientôt)
        </button>
      </div>
    </div>
  );
}

// ── Reusable Field ───────────────────────────────────────────────────────────

function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "block" }}>
      <span style={labelStyle}>
        {label}
        {required && <span style={{ color: "#D4775A", marginLeft: 2 }}>*</span>}
      </span>
      {hint && <span style={{ fontSize: 10, color: "#b0a894", display: "block", marginBottom: 4 }}>{hint}</span>}
      {children}
    </label>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ color: "#999" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{value}</span>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.4)",
  backdropFilter: "blur(4px)",
  zIndex: 100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 16,
};

const modalStyle: React.CSSProperties = {
  background: "#f2ede4",
  borderRadius: 16,
  width: "100%",
  maxWidth: 520,
  maxHeight: "90dvh",
  display: "flex",
  flexDirection: "column",
  boxShadow: "0 16px 48px rgba(0,0,0,0.2)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  padding: "20px 20px 12px",
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#1a1a1a",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1,
  textTransform: "uppercase",
};

const closeBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "1px solid #ddd6c8",
  background: "#fff",
  fontSize: 12,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#999",
  flexShrink: 0,
};

const contentStyle: React.CSSProperties = {
  padding: "0 20px",
  overflowY: "auto",
  flex: 1,
};

const footerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  padding: "16px 20px",
  borderTop: "1px solid #ece6db",
  gap: 8,
};

const fieldRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 11,
  fontWeight: 700,
  color: "#666",
  marginBottom: 4,
  letterSpacing: 0.5,
  textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
};

const sectionTitle: React.CSSProperties = {
  margin: "0 0 10px",
  fontSize: 12,
  fontWeight: 700,
  color: "#1a1a1a",
  letterSpacing: 1,
  textTransform: "uppercase",
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

function checkBadge(color: string): React.CSSProperties {
  return {
    fontSize: 9,
    fontWeight: 700,
    padding: "2px 7px",
    borderRadius: 6,
    background: `${color}14`,
    color,
    border: `1px solid ${color}30`,
    fontFamily: "inherit",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  };
}
