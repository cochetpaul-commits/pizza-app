"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Facture = {
  id: string;
  numero: string;
  objet: string | null;
  status: string;
  total_ttc: number;
  montant_paye: number;
  date_emission: string | null;
  date_echeance: string | null;
  client: { nom: string; prenom: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  envoyee: "Envoyée",
  payee: "Payée",
  en_retard: "En retard",
  annulee: "Annulée",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  brouillon: { bg: "#e8e0d0", fg: "#999" },
  envoyee: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  payee: { bg: "#e8ede6", fg: "#4a6741" },
  en_retard: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
  annulee: { bg: "#f0f0f0", fg: "#bbb" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function FacturesListPage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const [factures, setFactures] = useState<Facture[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const q = supabase
        .from("factures")
        .select("id,numero,objet,status,total_ttc,montant_paye,date_emission,date_echeance,client:clients(nom,prenom)")
        .order("created_at", { ascending: false });
      if (etab?.id) q.eq("etablissement_id", etab.id);
      const { data, error } = await q;
      if (error) console.error("factures fetch error:", error);
      setFactures((data ?? []) as unknown as Facture[]);
      setLoading(false);
    })();
  }, [etab?.id]);

  const filtered = filterStatus === "all" ? factures : factures.filter((f) => f.status === filterStatus);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={h1}>Evenementiel</h1>
          <Link
            href="/clients/factures/new"
            style={{
              background: "#D4775A",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Nouvelle facture
          </Link>
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {["all", "brouillon", "envoyee", "payee", "en_retard"].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: "6px 14px",
                borderRadius: 8,
                border: "1px solid #ddd6c8",
                background: filterStatus === s ? "#D4775A" : "#fff",
                color: filterStatus === s ? "#fff" : "#2f3a33",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
              }}
            >
              {s === "all" ? "Toutes" : STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        {loading && <p className="muted">Chargement...</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aucune facture</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((f) => {
              const sc = STATUS_COLORS[f.status] ?? STATUS_COLORS.brouillon;
              const clientName = f.client
                ? `${f.client.nom}${f.client.prenom ? " " + f.client.prenom : ""}`
                : null;
              const resteADu = f.total_ttc - (f.montant_paye ?? 0);
              return (
                <div
                  key={f.id}
                  className="card"
                  style={{ cursor: "pointer", borderLeft: `4px solid ${sc.fg}` }}
                  onClick={() => router.push(`/clients/factures/${f.id}`)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#2f3a33" }}>
                        {f.numero}
                      </p>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                        {f.objet ?? "Sans objet"}
                        {clientName ? ` · ${clientName}` : ""}
                      </p>
                    </div>
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 8px",
                        borderRadius: 6,
                        background: sc.bg,
                        color: sc.fg,
                        flexShrink: 0,
                      }}
                    >
                      {STATUS_LABELS[f.status] ?? f.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ color: "#6f6a61" }}>{fmtDate(f.date_emission)}</span>
                    {f.date_echeance && (
                      <span style={{ color: "#999" }}>Echeance {fmtDate(f.date_echeance)}</span>
                    )}
                    <span style={{ fontWeight: 700, color: "#2f3a33" }}>
                      {f.total_ttc.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € TTC
                    </span>
                    {f.montant_paye > 0 && resteADu > 0 && (
                      <span style={{ color: "#DC2626", fontWeight: 700 }}>
                        Reste {resteADu.toFixed(2)} €
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </RequireRole>
  );
}

const h1: React.CSSProperties = {
  fontSize: "1.4rem",
  fontWeight: 700,
  fontFamily: "var(--font-oswald), 'Oswald', sans-serif",
  letterSpacing: 1.5,
  textTransform: "uppercase",
  color: "#2f3a33",
  margin: 0,
};
