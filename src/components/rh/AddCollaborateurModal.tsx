"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { ROLE_INFO, PERM_ROLES, type PermRole } from "@/lib/permissions";

type Props = {
  etablissementId: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function AddCollaborateurModal({ etablissementId, onClose, onCreated }: Props) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Infos personnelles
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [email, setEmail] = useState("");
  const [telephone, setTelephone] = useState("");

  // Step 2 — Role et acces
  const [codePin, setCodePin] = useState("");
  const [heuresHebdo, setHeuresHebdo] = useState<number | "">("");
  const [heuresMensuelles, setHeuresMensuelles] = useState<number | "">("");
  const [selectedRole, setSelectedRole] = useState<PermRole>("employe");
  const [selectedEtabs, setSelectedEtabs] = useState<Record<string, { active: boolean; planning: boolean; equipe: string }>>({});

  // Load etabs + equipes
  const [allEtabs, setAllEtabs] = useState<{ id: string; nom: string }[]>([]);
  const [allEquipes, setAllEquipes] = useState<Record<string, string[]>>({});

  useEffect(() => {
    (async () => {
      const [etabRes, eqRes] = await Promise.all([
        supabase.from("etablissements").select("id, nom").eq("actif", true).order("nom"),
        supabase.from("equipes").select("etablissement_id, nom").eq("actif", true).order("nom"),
      ]);
      const etabs = (etabRes.data ?? []) as { id: string; nom: string }[];
      setAllEtabs(etabs);

      const eqMap: Record<string, string[]> = {};
      for (const eq of (eqRes.data ?? []) as { etablissement_id: string; nom: string }[]) {
        if (!eqMap[eq.etablissement_id]) eqMap[eq.etablissement_id] = [];
        eqMap[eq.etablissement_id].push(eq.nom);
      }
      setAllEquipes(eqMap);

      // Default: current etab active
      const init: Record<string, { active: boolean; planning: boolean; equipe: string }> = {};
      for (const e of etabs) {
        const eqs = eqMap[e.id] ?? [];
        init[e.id] = { active: e.id === etablissementId, planning: e.id === etablissementId, equipe: eqs[0] ?? "" };
      }
      setSelectedEtabs(init);
    })();
  }, [etablissementId]);

  const step1Valid = !!prenom.trim() && !!nom.trim();

  const handleCreate = async (invite: boolean) => {
    if (!prenom.trim() || !nom.trim()) return;
    setSaving(true);

    // Determine main etab — prioritize selected active, fallback to prop
    const activeEntries = Object.entries(selectedEtabs).filter(([, v]) => v.active);
    const mainEtabId = activeEntries.length > 0 ? activeEntries[0][0] : etablissementId;

    // Collect all equipes from active etabs
    const equipesAccess = activeEntries
      .filter(([, v]) => v.equipe)
      .map(([, v]) => v.equipe);

    // If no equipe selected, try to get the first available
    if (equipesAccess.length === 0) {
      const eqs = allEquipes[mainEtabId] ?? [];
      if (eqs.length > 0) equipesAccess.push(eqs[0]);
    }

    // Map role
    const dbRole = selectedRole === "admin" ? "group_admin" : selectedRole === "manager" ? "manager" : "employe";

    const { data: emp, error } = await supabase.from("employes").insert({
      etablissement_id: mainEtabId,
      prenom: prenom.trim(),
      nom: nom.trim(),
      email: email.trim() || null,
      tel_mobile: telephone.trim() || null,
      equipes_access: equipesAccess,
      role: dbRole,
      actif: true,
      affichage_planning: Object.values(selectedEtabs).some(v => v.planning),
    }).select("id").single();

    if (error || !emp) {
      alert("Erreur : " + (error?.message ?? "inconnu"));
      setSaving(false);
      return;
    }

    // Create contract if hours specified
    if (heuresHebdo) {
      await supabase.from("contrats").insert({
        employe_id: emp.id,
        type: "CDI",
        heures_semaine: Number(heuresHebdo),
        date_debut: new Date().toISOString().slice(0, 10),
        actif: true,
      });
    }

    // Send invite if requested
    if (invite && email.trim()) {
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/admin/invite", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({ email: email.trim(), displayName: `${prenom.trim()} ${nom.trim()}`, role: dbRole }),
      });
    }

    setSaving(false);
    onCreated?.();
    onClose();
  };

  const S = {
    overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16 },
    modal: { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 700, maxHeight: "90vh", overflowY: "auto" as const, boxShadow: "0 12px 40px rgba(0,0,0,0.15)" },
    header: { display: "flex" as const, justifyContent: "space-between" as const, alignItems: "center" as const, padding: "20px 24px 0" },
    title: { fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 20, fontWeight: 700, color: "#1a1a1a" },
    close: { background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#999", padding: 4 },
    body: { display: "flex" as const, gap: 24, padding: "20px 24px" },
    stepper: { width: 120, flexShrink: 0 as const },
    content: { flex: 1, minWidth: 0 },
    footer: { display: "flex" as const, justifyContent: "flex-end" as const, gap: 10, padding: "16px 24px", borderTop: "1px solid #f0ebe3" },
    label: { fontSize: 12, fontWeight: 600 as const, color: "#666", marginBottom: 4, display: "block" as const } as React.CSSProperties,
    input: { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const } as React.CSSProperties,
    required: { color: "#DC2626" },
    counter: { fontSize: 10, color: "#999", textAlign: "right" as const },
    btn: { padding: "10px 20px", borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: "pointer" } as React.CSSProperties,
  };

  const stepDot = (n: number, active: boolean, done: boolean) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
      <div style={{
        width: 32, height: 32, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
        background: done ? "#2D6A4F" : active ? "#2D6A4F" : "#f0ebe3",
        color: done || active ? "#fff" : "#999", fontSize: 13, fontWeight: 700,
      }}>
        {done ? "\u2713" : n}
      </div>
      <div>
        <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase" as const }}>Etape {n}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: active ? "#1a1a1a" : "#999" }}>
          {n === 1 ? "Informations personnelles" : "Role et acces"}
        </div>
      </div>
    </div>
  );

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <span style={S.title}>Ajouter un employe</span>
          <button type="button" onClick={onClose} style={S.close}>x</button>
        </div>

        <div style={S.body}>
          {/* Stepper */}
          <div style={S.stepper}>
            {stepDot(1, step === 1, step > 1)}
            <div style={{ width: 2, height: 30, background: step > 1 ? "#2D6A4F" : "#f0ebe3", marginLeft: 15, marginTop: -20, marginBottom: 4 }} />
            {stepDot(2, step === 2, false)}
          </div>

          {/* Content */}
          <div style={S.content}>
            {step === 1 && (
              <>
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Prenom <span style={S.required}>*</span></label>
                  <input style={S.input} value={prenom} onChange={e => setPrenom(e.target.value)} maxLength={30} />
                  <div style={S.counter}>{prenom.length}/30</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Nom <span style={S.required}>*</span></label>
                  <input style={S.input} value={nom} onChange={e => setNom(e.target.value)} maxLength={30} />
                  <div style={S.counter}>{nom.length}/30</div>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>E-mail</label>
                  <input type="email" style={S.input} value={email} onChange={e => setEmail(e.target.value)} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={S.label}>Telephone</label>
                  <input style={S.input} value={telephone} onChange={e => setTelephone(e.target.value)} placeholder="" />
                </div>
              </>
            )}

            {step === 2 && (
              <>
                {/* Code PIN + heures */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
                  <div>
                    <label style={S.label}>Code pin pointeuse <span style={S.required}>*</span></label>
                    <input style={S.input} value={codePin} onChange={e => setCodePin(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="4 chiffres" maxLength={4} />
                    <div style={S.counter}>{codePin.length}/4</div>
                  </div>
                  <div>
                    <label style={S.label}>Heures hebdomadaires (h)</label>
                    <input type="number" style={S.input} value={heuresHebdo} onChange={e => setHeuresHebdo(e.target.value ? Number(e.target.value) : "")} placeholder="Ex : 35h" />
                  </div>
                  <div>
                    <label style={S.label}>Heures mensuelles (h)</label>
                    <input type="number" style={S.input} value={heuresMensuelles} onChange={e => setHeuresMensuelles(e.target.value ? Number(e.target.value) : "")} placeholder="Ex : 151,67h" step={0.01} />
                  </div>
                </div>

                {/* Role selection */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Choisissez le profil de votre collaborateur</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
                  {PERM_ROLES.map(r => {
                    const info = ROLE_INFO[r];
                    const active = selectedRole === r;
                    return (
                      <label key={r} style={{
                        display: "flex", alignItems: "flex-start", gap: 12,
                        padding: 16, borderRadius: 10, cursor: "pointer",
                        border: active ? `2px solid ${info.color}` : "1px solid #ddd6c8",
                        background: active ? info.bg : "#fff",
                      }}>
                        <div style={{
                          width: 20, height: 20, borderRadius: "50%", marginTop: 2, flexShrink: 0,
                          border: active ? `5px solid ${info.color}` : "2px solid #ddd6c8",
                          background: active ? info.color : "#fff",
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: active ? info.color : "#1a1a1a", marginBottom: 4 }}>
                            {info.label}
                          </div>
                          <div style={{ fontSize: 12, color: "#666", lineHeight: 1.4 }}>
                            {info.description}
                          </div>
                        </div>
                        <input type="radio" name="role" checked={active} onChange={() => setSelectedRole(r)} style={{ display: "none" }} />
                      </label>
                    );
                  })}
                </div>

                {/* Etablissement d'affiliation */}
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>Etablissement d&apos;affiliation</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {allEtabs.map(etab => {
                    const sel = selectedEtabs[etab.id] ?? { active: false, planning: false, equipe: "" };
                    const eqs = allEquipes[etab.id] ?? [];
                    return (
                      <div key={etab.id} style={{
                        padding: 16, borderRadius: 10,
                        border: sel.active ? "2px solid #2D6A4F" : "1px solid #ddd6c8",
                        background: sel.active ? "rgba(45,106,79,0.04)" : "#fff",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: sel.active ? 10 : 0 }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{etab.nom}</span>
                          <button type="button" onClick={() => setSelectedEtabs(prev => ({
                            ...prev, [etab.id]: { ...sel, active: !sel.active },
                          }))} style={{
                            width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
                            background: sel.active ? "#2D6A4F" : "#ddd6c8", position: "relative",
                          }}>
                            <span style={{
                              position: "absolute", top: 2, left: sel.active ? 20 : 2,
                              width: 18, height: 18, borderRadius: "50%", background: "#fff",
                              transition: "left 0.15s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)",
                            }} />
                          </button>
                        </div>
                        {sel.active && (
                          <>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#2D6A4F", fontWeight: 600, marginBottom: 8, cursor: "pointer" }}>
                              <input type="checkbox" checked={sel.planning} onChange={e => setSelectedEtabs(prev => ({
                                ...prev, [etab.id]: { ...sel, planning: e.target.checked },
                              }))} />
                              Afficher dans le planning
                            </label>
                            {eqs.length > 0 && (
                              <div>
                                <label style={{ ...S.label, fontSize: 11 }}>Departements <span style={S.required}>*</span></label>
                                <select style={{ ...S.input, fontSize: 12 }} value={sel.equipe} onChange={e => setSelectedEtabs(prev => ({
                                  ...prev, [etab.id]: { ...sel, equipe: e.target.value },
                                }))}>
                                  <option value="">Departements</option>
                                  {eqs.map(eq => <option key={eq} value={eq}>{eq}</option>)}
                                </select>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={S.footer}>
          {step === 1 && (
            <>
              <button type="button" onClick={onClose} style={{ ...S.btn, border: "1px solid #ddd6c8", background: "#fff", color: "#1a1a1a" }}>
                Annuler
              </button>
              <button type="button" onClick={() => setStep(2)} disabled={!step1Valid} style={{
                ...S.btn, border: "none", background: step1Valid ? "#2D6A4F" : "#ddd6c8", color: "#fff",
                display: "flex", alignItems: "center", gap: 6,
              }}>
                Continuer
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </>
          )}
          {step === 2 && (
            <>
              <button type="button" onClick={() => setStep(1)} style={{
                ...S.btn, border: "1px solid #ddd6c8", background: "#fff", color: "#1a1a1a",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6" /></svg>
                Precedent
              </button>
              <button type="button" onClick={() => handleCreate(false)} disabled={saving} style={{
                ...S.btn, border: "none", background: "#2D6A4F", color: "#fff", opacity: saving ? 0.5 : 1,
              }}>
                Ajouter
              </button>
              <button type="button" onClick={() => handleCreate(true)} disabled={saving || !email.trim()} style={{
                ...S.btn, border: "none", background: "#b45f57", color: "#fff", opacity: saving || !email.trim() ? 0.5 : 1,
              }}>
                Ajouter et inviter
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
