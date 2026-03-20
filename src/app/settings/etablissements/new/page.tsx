"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };
const LABEL: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 };
const SUBLABEL: React.CSSProperties = { fontSize: 11, color: "#999", marginBottom: 6 };
const INPUT: React.CSSProperties = { width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" };

export default function NewEtablissementPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [nom, setNom] = useState("");
  const [denomination, setDenomination] = useState("");
  const [siret, setSiret] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);

  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [pays, setPays] = useState("France");

  const [couleur, setCouleur] = useState("#D4775A");
  const [isFranchise, setIsFranchise] = useState(false);

  const [convention, setConvention] = useState("HCR_1979");
  const [codeApe, setCodeApe] = useState("");
  const [codeSst, setCodeSst] = useState("MT");

  const [saving, setSaving] = useState(false);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = () => setLogoPreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!nom.trim()) return;
    setSaving(true);

    const slug = nom.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    const fullAdresse = [adresse, codePostal, ville].filter(Boolean).join(", ");

    const { data, error } = await supabase.from("etablissements").insert({
      nom: nom.trim(),
      slug,
      adresse: fullAdresse || null,
      siret: siret || null,
      code_ape: codeApe || null,
      convention,
      couleur,
      medecin_travail: codeSst || null,
      actif: true,
    }).select().single();

    if (error) {
      alert(error.message);
      setSaving(false);
      return;
    }

    // Upload logo if provided
    if (data && logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `etablissements/${data.id}/logo.${ext}`;
      await supabase.storage.from("public").upload(path, logoFile, { upsert: true });
      const { data: urlData } = supabase.storage.from("public").getPublicUrl(path);
      if (urlData?.publicUrl) {
        await supabase.from("etablissements").update({ logo_url: urlData.publicUrl }).eq("id", data.id);
      }
    }

    if (data) {
      router.push(`/settings/etablissements/${data.id}`);
    }
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 100px" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif",
          fontSize: 24, fontWeight: 700, letterSpacing: 1,
          color: "#1a1a1a", marginBottom: 24,
        }}>
          Ajouter un etablissement
        </h1>

        {/* Identite */}
        <div style={CARD}>
          <div style={{ marginBottom: 16 }}>
            <div style={LABEL}>Nom de l&apos;etablissement <span style={{ color: "#DC2626" }}>*</span></div>
            <div style={SUBLABEL}>Le nom sera visible sur les plannings, rapports etc.</div>
            <input style={INPUT} value={nom} onChange={e => setNom(e.target.value)} placeholder="" />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={LABEL}>Denomination sociale de votre entreprise</div>
            <input style={INPUT} value={denomination} onChange={e => setDenomination(e.target.value)} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <div style={LABEL}>SIRET</div>
            <input
              style={INPUT}
              value={siret}
              onChange={e => { if (e.target.value.length <= 14) setSiret(e.target.value.replace(/\D/g, "")); }}
              placeholder=""
              maxLength={14}
            />
            <div style={{ fontSize: 11, color: "#999", textAlign: "right", marginTop: 2 }}>{siret.length}/14</div>
          </div>

          <div>
            <div style={LABEL}>Logo de l&apos;etablissement</div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png" onChange={handleLogoChange} style={{ display: "none" }} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              style={{
                width: 180, height: 120, borderRadius: 12,
                border: "2px dashed #ddd6c8", background: "#faf7f2",
                cursor: "pointer", display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 6,
                overflow: "hidden",
              }}
            >
              {logoPreview ? (
                <Image src={logoPreview} alt="Logo" width={180} height={120} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : (
                <>
                  <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1a1a1a" }}>Ajouter une image</span>
                  <span style={{ fontSize: 10, color: "#999" }}>Formats acceptes : JPEG, PNG</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Couleur */}
        <div style={CARD}>
          <div style={LABEL}>Couleur de l&apos;etablissement</div>
          <div style={SUBLABEL}>Cette couleur sera utilisee dans la sidebar et les rapports.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8 }}>
            <input
              type="color"
              value={couleur}
              onChange={e => setCouleur(e.target.value)}
              style={{
                width: 44, height: 44, borderRadius: 8,
                border: "2px solid #ddd6c8", cursor: "pointer",
                padding: 0, background: "none",
              }}
            />
            <input
              type="text"
              value={couleur}
              onChange={e => setCouleur(e.target.value)}
              style={{ ...INPUT, width: 120, textTransform: "uppercase", fontFamily: "monospace" }}
              maxLength={7}
            />
            <div style={{
              width: 32, height: 32, borderRadius: "50%",
              background: couleur, border: "1px solid #ddd6c8",
            }} />
          </div>
        </div>

        {/* Adresse */}
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(220,38,38,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="#DC2626" stroke="none"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 110-5 2.5 2.5 0 010 5z" /></svg>
            </span>
            Adresse de l&apos;etablissement
          </h2>
          <div style={{ marginBottom: 12 }}>
            <div style={LABEL}>Adresse</div>
            <input style={INPUT} value={adresse} onChange={e => setAdresse(e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12, marginBottom: 12 }}>
            <div>
              <div style={LABEL}>Code postal</div>
              <input style={INPUT} value={codePostal} onChange={e => setCodePostal(e.target.value)} />
            </div>
            <div>
              <div style={LABEL}>Ville</div>
              <input style={INPUT} value={ville} onChange={e => setVille(e.target.value)} />
            </div>
          </div>
          <div>
            <div style={LABEL}>Pays</div>
            <select style={INPUT} value={pays} onChange={e => setPays(e.target.value)}>
              <option value="France">France</option>
              <option value="Belgique">Belgique</option>
              <option value="Suisse">Suisse</option>
              <option value="Luxembourg">Luxembourg</option>
            </select>
          </div>
        </div>

        {/* Franchise */}
        <div style={CARD}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>Cet etablissement est une franchise</span>
            <button type="button" onClick={() => setIsFranchise(!isFranchise)} style={{
              width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
              background: isFranchise ? "#2D6A4F" : "#ddd6c8", position: "relative", transition: "background 0.2s",
            }}>
              <span style={{
                position: "absolute", top: 2, left: isFranchise ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
              }} />
            </button>
          </div>
        </div>

        {/* Informations legales */}
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#1a1a1a", marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(212,119,90,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#D4775A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /></svg>
            </span>
            Informations legales
          </h2>

          <div style={{ marginBottom: 12 }}>
            <div style={LABEL}>Convention collective</div>
            <select style={INPUT} value={convention} onChange={e => setConvention(e.target.value)}>
              <option value="HCR_1979">Hotels, cafes restaurants - HCR (IDCC 1979)</option>
              <option value="RAPIDE_1501">Restauration rapide (IDCC 1501)</option>
            </select>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={LABEL}>Code APE</div>
            <input style={INPUT} value={codeApe} onChange={e => setCodeApe(e.target.value)} placeholder="Rechercher" />
          </div>

          <div>
            <div style={LABEL}>Code Service de Sante au Travail (SST)</div>
            <input style={INPUT} value={codeSst} onChange={e => setCodeSst(e.target.value)} placeholder="MT" />
          </div>
        </div>

        {/* Actions */}
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#fff", borderTop: "1px solid #ddd6c8",
          padding: "12px 24px",
          display: "flex", justifyContent: "center", gap: 16,
          zIndex: 100,
        }}>
          <button
            type="button"
            onClick={() => router.push("/settings/etablissements")}
            style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: "transparent", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#1a1a1a" }}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !nom.trim()}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: "#1a1a1a", color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: "pointer",
              opacity: saving || !nom.trim() ? 0.5 : 1,
            }}
          >
            {saving ? "Creation..." : "Enregistrer et continuer"}
          </button>
        </div>
      </div>
    </RequireRole>
  );
}
