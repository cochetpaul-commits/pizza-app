"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";

type Props = {
  etablissementId: string;
  onClose: () => void;
  onCreated?: () => void;
};

export function AddCollaborateurModal({ etablissementId, onClose, onCreated }: Props) {
  const [saving, setSaving] = useState(false);
  const [prenom, setPrenom] = useState("");
  const [nom, setNom] = useState("");
  const [matricule, setMatricule] = useState("");
  const [selectedEtab, setSelectedEtab] = useState(etablissementId);
  const [selectedEquipe, setSelectedEquipe] = useState("");

  const [allEtabs, setAllEtabs] = useState<{ id: string; nom: string }[]>([]);
  const [allEquipes, setAllEquipes] = useState<Record<string, { id: string; nom: string }[]>>({});

  useEffect(() => {
    (async () => {
      const [etabRes, eqRes] = await Promise.all([
        supabase.from("etablissements").select("id, nom").eq("actif", true).order("nom"),
        supabase.from("equipes").select("id, etablissement_id, nom").eq("actif", true).order("nom"),
      ]);
      const etabs = (etabRes.data ?? []) as { id: string; nom: string }[];
      setAllEtabs(etabs);

      const eqMap: Record<string, { id: string; nom: string }[]> = {};
      for (const eq of (eqRes.data ?? []) as { id: string; etablissement_id: string; nom: string }[]) {
        if (!eqMap[eq.etablissement_id]) eqMap[eq.etablissement_id] = [];
        eqMap[eq.etablissement_id].push({ id: eq.id, nom: eq.nom });
      }
      setAllEquipes(eqMap);

      // Pre-select first equipe of current etab
      const eqs = eqMap[etablissementId] ?? [];
      if (eqs.length > 0) setSelectedEquipe(eqs[0].nom);
    })();
  }, [etablissementId]);

  const valid = !!prenom.trim() && !!nom.trim();

  const handleCreate = async () => {
    if (!valid) return;
    setSaving(true);

    const { error } = await supabase.from("employes").insert({
      etablissement_id: selectedEtab,
      prenom: prenom.trim(),
      nom: nom.trim().toUpperCase(),
      matricule: matricule.trim() || null,
      equipes_access: selectedEquipe ? [selectedEquipe] : [],
      role: "equipier",
      actif: true,
    });

    if (error) {
      alert("Erreur : " + error.message);
      setSaving(false);
      return;
    }

    setSaving(false);
    onCreated?.();
    onClose();
  };

  const equipes = allEquipes[selectedEtab] ?? [];

  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420,
        boxShadow: "0 12px 40px rgba(0,0,0,0.15)", overflow: "hidden",
      }}>
        <div style={{ padding: "20px 24px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 18, fontWeight: 700, color: "#1a1a1a" }}>
            Ajouter un employe
          </span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: "#999" }}>x</button>
        </div>

        <div style={{ padding: "16px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>
                Prenom <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input value={prenom} onChange={e => setPrenom(e.target.value)} placeholder="Ex : Pierre"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>
                Nom <span style={{ color: "#DC2626" }}>*</span>
              </label>
              <input value={nom} onChange={e => setNom(e.target.value)} placeholder="Ex : COCHET"
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box", textTransform: "uppercase" }} />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>Etablissement</label>
            <select value={selectedEtab} onChange={e => { setSelectedEtab(e.target.value); setSelectedEquipe(""); }}
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }}>
              {allEtabs.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>

          {equipes.length > 0 && (
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>Equipe</label>
              <select value={selectedEquipe} onChange={e => setSelectedEquipe(e.target.value)}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box", fontFamily: "inherit" }}>
                <option value="">Aucune</option>
                {equipes.map(eq => <option key={eq.id} value={eq.nom}>{eq.nom}</option>)}
              </select>
            </div>
          )}

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 4, display: "block" }}>Matricule</label>
            <input value={matricule} onChange={e => setMatricule(e.target.value)} placeholder="Pour la synchronisation Combo"
              style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" }} />
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid #f0ebe3" }}>
          <button type="button" onClick={onClose} style={{
            padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: "1px solid #ddd6c8", background: "#fff", color: "#1a1a1a", cursor: "pointer",
          }}>Annuler</button>
          <button type="button" onClick={handleCreate} disabled={!valid || saving} style={{
            padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 700,
            border: "none", background: valid ? "#2D6A4F" : "#ddd6c8", color: "#fff",
            cursor: valid ? "pointer" : "default", opacity: saving ? 0.5 : 1,
          }}>{saving ? "..." : "Ajouter"}</button>
        </div>
      </div>
    </div>
  );
}
