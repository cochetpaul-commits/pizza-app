import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import React from "react";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type Employe = {
  id: string;
  prenom: string;
  nom: string;
  nationalite: string | null;
  date_naissance: string | null;
  genre: string | null;
  numero_secu: string | null;
  date_anciennete: string | null;
  actif: boolean;
  etablissement_id: string;
  equipes_access: string[];
  created_at: string;
};

type Contrat = {
  employe_id: string;
  type: string;
  emploi: string | null;
  qualification: string | null;
  heures_semaine: number;
  date_debut: string;
  date_fin: string | null;
  actif: boolean;
};

type Etab = {
  id: string;
  nom: string;
  siret: string | null;
  adresse: string | null;
  convention: string | null;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const etabId = searchParams.get("etab");

  // Load data
  const etabQuery = etabId
    ? supabaseAdmin.from("etablissements").select("id, nom, siret, adresse, convention").eq("id", etabId).single()
    : supabaseAdmin.from("etablissements").select("id, nom, siret, adresse, convention").limit(1).single();

  const [etabRes, empRes, contratRes] = await Promise.all([
    etabQuery,
    etabId
      ? supabaseAdmin.from("employes").select("*").eq("etablissement_id", etabId).neq("affichage_rup", false).order("nom")
      : supabaseAdmin.from("employes").select("*").neq("affichage_rup", false).order("nom"),
    supabaseAdmin.from("contrats").select("employe_id, type, emploi, qualification, heures_semaine, date_debut, date_fin, actif").order("date_debut"),
  ]);

  const etab = etabRes.data as Etab | null;
  const employes = (empRes.data ?? []) as Employe[];
  const contrats = (contratRes.data ?? []) as Contrat[];

  const contratMap = new Map<string, Contrat[]>();
  contrats.forEach(c => {
    const arr = contratMap.get(c.employe_id) ?? [];
    arr.push(c);
    contratMap.set(c.employe_id, arr);
  });

  // Build PDF
  const { Document, Page, Text, View, StyleSheet } = await import("@react-pdf/renderer");

  const styles = StyleSheet.create({
    page: { padding: 30, fontSize: 8, fontFamily: "Helvetica" },
    header: { marginBottom: 16 },
    title: { fontSize: 14, fontWeight: "bold", marginBottom: 4 },
    subtitle: { fontSize: 9, color: "#666", marginBottom: 2 },
    legal: { fontSize: 7, color: "#999", marginBottom: 12 },
    tableHeader: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#333", paddingBottom: 4, marginBottom: 4 },
    tableRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#ddd", paddingVertical: 3, minHeight: 18 },
    col1: { width: "4%" },
    col2: { width: "14%" },
    col3: { width: "8%" },
    col4: { width: "7%" },
    col5: { width: "6%" },
    col6: { width: "10%" },
    col7: { width: "8%" },
    col8: { width: "10%" },
    col9: { width: "7%" },
    col10: { width: "8%" },
    col11: { width: "8%" },
    col12: { width: "10%" },
    th: { fontSize: 6, fontWeight: "bold", color: "#333", textTransform: "uppercase" },
    td: { fontSize: 7 },
    footer: { position: "absolute", bottom: 20, left: 30, right: 30, fontSize: 6, color: "#999", textAlign: "center" },
    active: { color: "#2D6A4F" },
    inactive: { color: "#DC2626" },
  });

  const fmtDate = (d: string | null) => {
    if (!d) return "—";
    try { return new Date(d).toLocaleDateString("fr-FR"); } catch { return d; }
  };

  const contratLabel = (type: string) => {
    const labels: Record<string, string> = { CDI: "CDI", CDD: "CDD", extra: "Extra", interim: "Interim", apprenti: "Apprenti", stagiaire: "Stage", TNS: "TNS" };
    return labels[type] ?? type;
  };

  const now = new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

  const RUPDocument = () =>
    React.createElement(Document, {},
      React.createElement(Page, { size: "A4", orientation: "landscape", style: styles.page },
        // Header
        React.createElement(View, { style: styles.header },
          React.createElement(Text, { style: styles.title }, "REGISTRE UNIQUE DU PERSONNEL"),
          React.createElement(Text, { style: styles.subtitle }, `Etablissement : ${etab?.nom ?? "Tous"}`),
          etab?.siret && React.createElement(Text, { style: styles.subtitle }, `SIRET : ${etab.siret}`),
          etab?.adresse && React.createElement(Text, { style: styles.subtitle }, `Adresse : ${etab.adresse}`),
          React.createElement(Text, { style: styles.subtitle }, `Edite le : ${now}`),
          React.createElement(Text, { style: styles.legal },
            "Article L1221-13 du Code du travail — Tout employeur doit tenir un registre unique du personnel. " +
            "Amende de 750 EUR par salarie en cas de manquement (art. R1227-7)."
          ),
        ),

        // Table header
        React.createElement(View, { style: styles.tableHeader },
          React.createElement(Text, { style: { ...styles.th, ...styles.col1 } }, "N°"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col2 } }, "Nom et Prenoms"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col3 } }, "Nationalite"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col4 } }, "Naissance"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col5 } }, "Sexe"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col6 } }, "Emploi"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col7 } }, "Qualif."),
          React.createElement(Text, { style: { ...styles.th, ...styles.col8 } }, "Contrat"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col9 } }, "Horaire"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col10 } }, "Date entree"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col11 } }, "Date sortie"),
          React.createElement(Text, { style: { ...styles.th, ...styles.col12 } }, "N° Secu"),
        ),

        // Rows
        ...employes.map((emp, idx) => {
          const cts = contratMap.get(emp.id) ?? [];
          const activeC = cts.find(c => c.actif) ?? cts[0];
          return React.createElement(View, { key: emp.id, style: styles.tableRow },
            React.createElement(Text, { style: { ...styles.td, ...styles.col1 } }, String(idx + 1)),
            React.createElement(Text, { style: { ...styles.td, ...styles.col2, fontWeight: "bold" } }, `${emp.nom.toUpperCase()} ${emp.prenom}`),
            React.createElement(Text, { style: { ...styles.td, ...styles.col3 } }, emp.nationalite ?? "—"),
            React.createElement(Text, { style: { ...styles.td, ...styles.col4 } }, fmtDate(emp.date_naissance)),
            React.createElement(Text, { style: { ...styles.td, ...styles.col5 } }, emp.genre === "M" ? "H" : emp.genre === "F" ? "F" : "—"),
            React.createElement(Text, { style: { ...styles.td, ...styles.col6 } }, activeC?.emploi ?? "—"),
            React.createElement(Text, { style: { ...styles.td, ...styles.col7 } }, activeC?.qualification ?? "—"),
            React.createElement(Text, { style: { ...styles.td, ...styles.col8 } },
              activeC ? `${contratLabel(activeC.type)}${activeC.type === "CDD" || !emp.actif ? "" : ""}` : "—"
            ),
            React.createElement(Text, { style: { ...styles.td, ...styles.col9 } },
              activeC ? `${activeC.heures_semaine}h/sem` : "—"
            ),
            React.createElement(Text, { style: { ...styles.td, ...styles.col10 } }, fmtDate(activeC?.date_debut ?? emp.date_anciennete)),
            React.createElement(Text, { style: { ...styles.td, ...styles.col11, ...(emp.actif ? {} : styles.inactive) } },
              emp.actif ? "En poste" : fmtDate(activeC?.date_fin)
            ),
            React.createElement(Text, { style: { ...styles.td, ...styles.col12 } }, emp.numero_secu ?? "—"),
          );
        }),

        // Footer
        React.createElement(View, { style: styles.footer },
          React.createElement(Text, {},
            `Registre Unique du Personnel — ${etab?.nom ?? "iFratelli Group"} — ${now} — Page 1 — ${employes.length} salarie(s)`
          ),
        ),
      ),
    );

  const el = RUPDocument() as unknown as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(el);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename=RUP_${etab?.nom?.replace(/\s/g, "_") ?? "iFratelli"}_${new Date().toISOString().slice(0, 10)}.pdf`,
    },
  });
}
