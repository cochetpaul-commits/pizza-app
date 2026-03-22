"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type Devis = {
  id: string;
  numero: string;
  objet: string | null;
  status: string;
  total_ttc: number;
  date_emission: string | null;
  date_validite: string | null;
  client: { nom: string; prenom: string | null } | null;
};

const STATUS_LABELS: Record<string, string> = {
  brouillon: "Brouillon",
  envoye: "Envoy\u00e9",
  accepte: "Accept\u00e9",
  refuse: "Refus\u00e9",
  expire: "Expir\u00e9",
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  brouillon: { bg: "#e8e0d0", fg: "#999" },
  envoye: { bg: "rgba(37,99,235,0.10)", fg: "#2563eb" },
  accepte: { bg: "#e8ede6", fg: "#4a6741" },
  refuse: { bg: "rgba(220,38,38,0.10)", fg: "#DC2626" },
  expire: { bg: "#f0f0f0", fg: "#bbb" },
};

function fmtDate(iso: string | null) {
  if (!iso) return "\u2014";
  return new Date(iso + "T00:00:00").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DevisListPage() {
  const router = useRouter();
  const { current: etab } = useEtablissement();
  const [devis, setDevis] = useState<Devis[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>("all");

  useEffect(() => {
    (async () => {
      const q = supabase
        .from("devis")
        .select("id,numero,objet,status,total_ttc,date_emission,date_validite,client:clients(nom,prenom)")
        .order("created_at", { ascending: false });
      if (etab?.id) q.eq("etablissement_id", etab.id);
      const { data, error } = await q;
      if (error) {
        console.error("devis fetch error:", error);
      }
      setDevis((data ?? []) as unknown as Devis[]);
      setLoading(false);
    })();
  }, [etab?.id]);

  const filtered = filterStatus === "all" ? devis : devis.filter((d) => d.status === filterStatus);

  return (
    <RequireRole allowedRoles={["group_admin"]}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "12px 16px 40px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={h1}>Devis</h1>
          <Link
            href="/devis/new"
            style={{
              background: "#D4775A",
              color: "#fff",
              border: "none",
              borderRadius: 20,
              padding: "8px 20px",
              fontSize: 13,
              fontWeight: 700,
              textDecoration: "none",
              cursor: "pointer",
            }}
          >
            Nouveau devis
          </Link>
        </div>

        {/* Filtres */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {["all", "brouillon", "envoye", "accepte", "refuse"].map((s) => (
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
              {s === "all" ? "Tous" : STATUS_LABELS[s] ?? s}
            </button>
          ))}
        </div>

        {loading && <p className="muted">Chargement...</p>}

        {!loading && filtered.length === 0 && (
          <div className="card" style={{ textAlign: "center", padding: "2rem" }}>
            <p className="muted">Aucun devis</p>
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div style={{ display: "grid", gap: 10 }}>
            {filtered.map((d) => {
              const sc = STATUS_COLORS[d.status] ?? STATUS_COLORS.brouillon;
              const clientName = d.client
                ? `${d.client.nom}${d.client.prenom ? " " + d.client.prenom : ""}`
                : null;
              return (
                <div
                  key={d.id}
                  className="card"
                  style={{ cursor: "pointer", borderLeft: `4px solid ${sc.fg}` }}
                  onClick={() => router.push(`/devis/${d.id}`)}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 15, color: "#2f3a33" }}>
                        {d.numero}
                      </p>
                      <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>
                        {d.objet ?? "Sans objet"}
                        {clientName ? ` \u00b7 ${clientName}` : ""}
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
                      {STATUS_LABELS[d.status] ?? d.status}
                    </span>
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ color: "#6f6a61" }}>{fmtDate(d.date_emission)}</span>
                    {d.date_validite && (
                      <span style={{ color: "#999" }}>Valide jusqu&apos;au {fmtDate(d.date_validite)}</span>
                    )}
                    <span style={{ fontWeight: 700, color: "#2f3a33" }}>
                      {d.total_ttc.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € TTC
                    </span>
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
