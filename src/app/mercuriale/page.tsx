"use client";

import { useState, useEffect } from "react";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";
import { supabase } from "@/lib/supabaseClient";
import { fetchApi } from "@/lib/fetchApi";
import { useEtablissement } from "@/lib/EtablissementContext";

type Supplier = { id: string; name: string };

export default function MercurialePage() {
  const { current: etab } = useEtablissement();
  const [groupBy, setGroupBy] = useState<"category" | "supplier" | "alpha">("category");
  const [establishment, setEstablishment] = useState<"all" | "bellomio" | "piccola">("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = supabase.from("suppliers").select("id,name").eq("is_active", true).order("name");
    if (etab) q.eq("etablissement_id", etab.id);
    q.then(({ data }) => {
      setSuppliers((data ?? []) as Supplier[]);
    });
  }, [etab]);

  async function getToken(): Promise<string> {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ? `Bearer ${data.session.access_token}` : "";
  }

  async function downloadPdf() {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetchApi("/api/mercuriale/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: token },
        body: JSON.stringify({ groupBy, establishment, filterSupplier }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `mercuriale-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 800);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const btnStyle = (active: boolean, color: string) => ({
    padding: "6px 14px", borderRadius: 8, border: `1px solid ${active ? color : "#ddd6c8"}`,
    background: active ? color : "#fff", color: active ? "#fff" : "#374151",
    fontWeight: 700, fontSize: 13, cursor: "pointer" as const,
  });

  const selectStyle = {
    width: "100%", padding: "8px 12px", borderRadius: 8, border: "1px solid #ddd6c8",
    fontSize: 13, fontWeight: 600, background: "#fff", cursor: "pointer" as const,
  };

  return (
    <RequireRole allowedRoles={["group_admin"]}>
    <>
    <NavBar />
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "2rem" }}>
      <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, marginBottom: 24 }}>Mercuriale des prix</h1>

      <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 20, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: "#374151", fontSize: 13 }}>Établissement</div>
        <div style={{ display: "flex", gap: 8 }}>
          {([["all", "Tous", "#999999"], ["bellomio", "Bello Mio", "#D4775A"], ["piccola", "Piccola Mia", "#6B1B1B"]] as const).map(([v, label, color]) => (
            <button key={v} onClick={() => setEstablishment(v)} style={btnStyle(establishment === v, color)}>{label}</button>
          ))}
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 20, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: "#374151", fontSize: 13 }}>Fournisseur</div>
        <select style={selectStyle} value={filterSupplier} onChange={e => setFilterSupplier(e.target.value)}>
          <option value="all">Tous les fournisseurs</option>
          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div style={{ background: "#fff", border: "1px solid #ddd6c8", borderRadius: 12, padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: "#374151", fontSize: 13 }}>Grouper par</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {([["category", "Catégorie"], ["supplier", "Fournisseur"], ["alpha", "Alphabétique"]] as const).map(([v, label]) => (
            <button key={v} onClick={() => setGroupBy(v)} style={btnStyle(groupBy === v, "#92400E")}>{label}</button>
          ))}
        </div>
      </div>

      {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: 12, marginBottom: 16, color: "#991b1b", fontSize: 13 }}>{error}</div>}

      <button onClick={downloadPdf} disabled={loading}
        style={{ width: "100%", padding: "14px", borderRadius: 12, background: "#D4775A", color: "#fff", fontWeight: 900, fontSize: 16, border: "none", cursor: loading ? "wait" : "pointer", opacity: loading ? 0.7 : 1 }}>
        {loading ? "Génération en cours…" : "⬇ Télécharger la mercuriale PDF"}
      </button>
    </main>
    </>
    </RequireRole>
  );
}
