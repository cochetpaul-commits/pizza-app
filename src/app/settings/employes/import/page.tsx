"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type ImportRow = {
  prenom: string;
  nom: string;
  email: string;
  tel_mobile: string;
  date_naissance: string;
  numero_secu: string;
  adresse: string;
  code_postal: string;
  ville: string;
  nationalite: string;
  matricule: string;
  equipe: string;
  contrat_type: string;
  heures_semaine: string;
  date_debut: string;
  emploi: string;
  salaire_brut: string;
};

const FIELD_MAP: Record<string, string[]> = {
  prenom: ["prenom", "prénom", "first_name", "firstname", "nom_prenom"],
  nom: ["nom", "nom_famille", "last_name", "lastname", "name"],
  email: ["email", "mail", "e-mail", "courriel"],
  tel_mobile: ["telephone", "tel", "mobile", "tel_mobile", "phone"],
  date_naissance: ["date_naissance", "dob", "naissance", "birth_date", "date_birth"],
  numero_secu: ["numero_secu", "nss", "secu", "social_security", "n_secu"],
  adresse: ["adresse", "address", "rue"],
  code_postal: ["code_postal", "cp", "zip", "postal_code"],
  ville: ["ville", "city", "commune"],
  nationalite: ["nationalite", "nationality", "nation"],
  matricule: ["matricule", "id_employe", "employee_id"],
  equipe: ["equipe", "team", "service", "departement"],
  contrat_type: ["type_contrat", "contrat", "contract_type", "type"],
  heures_semaine: ["heures_semaine", "heures", "hours", "weekly_hours", "duree_travail"],
  date_debut: ["date_debut", "date_embauche", "start_date", "hire_date", "debut"],
  emploi: ["emploi", "poste", "job_title", "intitule_poste", "fonction"],
  salaire_brut: ["salaire_brut", "salaire", "remuneration", "salary", "brut"],
};

const CARD: React.CSSProperties = { background: "#fff", borderRadius: 14, padding: 20, border: "1px solid #ddd6c8", marginBottom: 16 };

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map(line => {
    const values = line.split(sep).map(v => v.trim().replace(/^["']|["']$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ""; });
    return row;
  });
}

function mapRow(raw: Record<string, string>): Partial<ImportRow> {
  const result: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(FIELD_MAP)) {
    for (const alias of aliases) {
      if (raw[alias] !== undefined && raw[alias] !== "") {
        result[field] = raw[alias];
        break;
      }
    }
  }
  return result;
}

export default function ImportEmployesPage() {
  const router = useRouter();
  const { current: etab, etablissements } = useEtablissement();
  const fileRef = useRef<HTMLInputElement>(null);

  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [mappedData, setMappedData] = useState<Partial<ImportRow>[]>([]);
  const [targetEtabId, setTargetEtabId] = useState(etab?.id ?? "");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ created: number; errors: number } | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = parseCSV(text);
      setRawData(rows);
      setMappedData(rows.map(mapRow));
    };
    reader.readAsText(file, "UTF-8");
  };

  const handleImport = async () => {
    if (!targetEtabId || mappedData.length === 0) return;
    setImporting(true);
    let created = 0;
    let errors = 0;

    for (const row of mappedData) {
      if (!row.prenom || !row.nom) { errors++; continue; }

      const { data: emp, error } = await supabase.from("employes").insert({
        etablissement_id: targetEtabId,
        prenom: row.prenom,
        nom: row.nom,
        email: row.email || null,
        tel_mobile: row.tel_mobile || null,
        date_naissance: row.date_naissance || null,
        numero_secu: row.numero_secu || null,
        adresse: row.adresse || null,
        code_postal: row.code_postal || null,
        ville: row.ville || null,
        nationalite: row.nationalite || "Francaise",
        matricule: row.matricule || null,
        equipes_access: row.equipe ? [row.equipe] : [],
        role: "employe",
        actif: true,
      }).select("id").single();

      if (error || !emp) { errors++; continue; }

      // Create contract if data available
      if (row.contrat_type || row.heures_semaine || row.date_debut) {
        await supabase.from("contrats").insert({
          employe_id: emp.id,
          type: row.contrat_type || "CDI",
          heures_semaine: Number(row.heures_semaine) || 35,
          date_debut: row.date_debut || new Date().toISOString().slice(0, 10),
          emploi: row.emploi || null,
          remuneration: Number(row.salaire_brut) || 0,
          actif: true,
        });
      }

      created++;
    }

    setResult({ created, errors });
    setImporting(false);
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 16px 60px" }}>
        <h1 style={{ fontFamily: "var(--font-oswald), Oswald, sans-serif", fontSize: 24, fontWeight: 700, letterSpacing: 1, color: "#1a1a1a", marginBottom: 8 }}>
          Importer des employes
        </h1>
        <p style={{ fontSize: 13, color: "#999", marginBottom: 20, lineHeight: 1.5 }}>
          Importez vos employes depuis un fichier CSV exporte de MySilae, Combo, ou tout autre logiciel de paie. Le fichier doit contenir au minimum les colonnes Prenom et Nom.
        </p>

        {/* Step 1: Select establishment */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>1. Etablissement cible</h2>
          <select
            style={{ width: "100%", padding: "10px 14px", borderRadius: 8, border: "1px solid #ddd6c8", fontSize: 14, boxSizing: "border-box" as const }}
            value={targetEtabId}
            onChange={e => setTargetEtabId(e.target.value)}
          >
            <option value="">Choisir un etablissement</option>
            {etablissements.map(e => <option key={e.id} value={e.id}>{e.nom}</option>)}
          </select>
        </div>

        {/* Step 2: Upload file */}
        <div style={CARD}>
          <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>2. Fichier CSV</h2>
          <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} style={{ display: "none" }} />
          <button type="button" onClick={() => fileRef.current?.click()} style={{
            padding: "12px 20px", borderRadius: 8, border: "2px dashed #ddd6c8",
            background: "#faf7f2", cursor: "pointer", width: "100%",
            fontSize: 14, fontWeight: 600, color: "#1a1a1a",
          }}>
            {rawData.length > 0 ? `${rawData.length} lignes chargees` : "Choisir un fichier CSV"}
          </button>
          <p style={{ fontSize: 11, color: "#999", marginTop: 6 }}>
            Formats acceptes : CSV (separateur virgule ou point-virgule). Encodage UTF-8 recommande.
          </p>
        </div>

        {/* Step 3: Preview */}
        {mappedData.length > 0 && (
          <div style={CARD}>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: "#1a1a1a" }}>3. Apercu ({mappedData.length} employes)</h2>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #ddd6c8" }}>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Prenom</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Nom</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Email</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Equipe</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Contrat</th>
                    <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 700, color: "#999", fontSize: 10, textTransform: "uppercase" }}>Heures</th>
                  </tr>
                </thead>
                <tbody>
                  {mappedData.slice(0, 20).map((row, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f0ebe3" }}>
                      <td style={{ padding: "8px", fontWeight: 600 }}>{row.prenom ?? "—"}</td>
                      <td style={{ padding: "8px" }}>{row.nom ?? "—"}</td>
                      <td style={{ padding: "8px", color: "#666" }}>{row.email ?? "—"}</td>
                      <td style={{ padding: "8px", color: "#666" }}>{row.equipe ?? "—"}</td>
                      <td style={{ padding: "8px", color: "#666" }}>{row.contrat_type ?? "—"}</td>
                      <td style={{ padding: "8px", color: "#666" }}>{row.heures_semaine ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {mappedData.length > 20 && (
                <p style={{ fontSize: 11, color: "#999", marginTop: 8 }}>... et {mappedData.length - 20} autres</p>
              )}
            </div>
          </div>
        )}

        {/* Result */}
        {result && (
          <div style={{ ...CARD, background: result.errors === 0 ? "rgba(45,106,79,0.06)" : "rgba(220,38,38,0.06)" }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: result.errors === 0 ? "#2D6A4F" : "#DC2626" }}>
              Import termine : {result.created} employe(s) cree(s){result.errors > 0 ? `, ${result.errors} erreur(s)` : ""}
            </p>
            <button type="button" onClick={() => router.push("/settings/employes")} style={{
              marginTop: 8, padding: "8px 16px", borderRadius: 8, border: "none",
              background: "#1a1a1a", color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              Voir la liste des employes
            </button>
          </div>
        )}

        {/* Import button */}
        {mappedData.length > 0 && !result && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button type="button" onClick={() => router.back()} style={{
              padding: "10px 20px", borderRadius: 8, border: "1px solid #ddd6c8",
              background: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", color: "#1a1a1a",
            }}>
              Annuler
            </button>
            <button type="button" onClick={handleImport} disabled={importing || !targetEtabId} style={{
              padding: "10px 24px", borderRadius: 8, border: "none",
              background: importing ? "#999" : "#1a1a1a", color: "#fff",
              fontSize: 14, fontWeight: 600, cursor: importing ? "default" : "pointer",
            }}>
              {importing ? "Import en cours..." : `Importer ${mappedData.length} employe(s)`}
            </button>
          </div>
        )}
      </div>
    </RequireRole>
  );
}
