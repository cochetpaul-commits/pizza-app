"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { getSupplierColor } from "@/lib/supplierColors";

import { RequireRole } from "@/components/RequireRole";
import { useEtablissement } from "@/lib/EtablissementContext";

type SupplierRow = {
  id: string;
  name: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
};

type SupplierStats = {
  refCount: number;
  lastImport: string | null;
  lastImportNumber: string | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
}

export default function FournisseursPage() {
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [stats, setStats] = useState<Map<string, SupplierStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const { current: etab } = useEtablissement();

  useEffect(() => {
    async function load() {
      setLoading(true);

      const supQuery = supabase.from("suppliers").select("id,name,is_active,email,phone,contact_name").order("name");
      if (etab) supQuery.eq("etablissement_id", etab.id);

      const invQuery = supabase.from("supplier_invoices")
          .select("supplier_id,created_at,invoice_number")
          .order("created_at", { ascending: false });
      if (etab) invQuery.eq("etablissement_id", etab.id);

      const [supRes, offRes, invRes] = await Promise.all([
        supQuery,
        supabase.from("v_latest_offers").select("supplier_id"),
        invQuery,
      ]);

      const rawRows = (supRes.data ?? []) as SupplierRow[];

      // Deduplicate by name (accent+case insensitive)
      const seen = new Map<string, { canonical: SupplierRow; aliasIds: string[] }>();
      for (const s of rawRows) {
        const key = s.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        if (!seen.has(key)) {
          seen.set(key, { canonical: s, aliasIds: [s.id] });
        } else {
          seen.get(key)!.aliasIds.push(s.id);
        }
      }
      const rows = Array.from(seen.values()).map((v) => v.canonical);
      setSuppliers(rows);

      // Ref counts from latest offers
      const offerCounts = new Map<string, number>();
      for (const o of (offRes.data ?? [])) {
        if (o.supplier_id) offerCounts.set(o.supplier_id, (offerCounts.get(o.supplier_id) ?? 0) + 1);
      }

      // Last import per supplier
      const lastImports = new Map<string, { created_at: string; invoice_number: string | null }>();
      for (const inv of (invRes.data ?? [])) {
        if (inv.supplier_id && !lastImports.has(inv.supplier_id)) {
          lastImports.set(inv.supplier_id, { created_at: inv.created_at, invoice_number: inv.invoice_number });
        }
      }

      // Merge stats across aliases
      const m = new Map<string, SupplierStats>();
      for (const { canonical, aliasIds } of seen.values()) {
        let refCount = 0;
        let lastImport: string | null = null;
        let lastImportNumber: string | null = null;
        for (const aid of aliasIds) {
          refCount += offerCounts.get(aid) ?? 0;
          const li = lastImports.get(aid);
          if (li && (!lastImport || li.created_at > lastImport)) {
            lastImport = li.created_at;
            lastImportNumber = li.invoice_number;
          }
        }
        m.set(canonical.id, { refCount, lastImport, lastImportNumber });
      }

      setStats(m);
      setLoading(false);
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etab?.id]);

  const active = suppliers.filter((s) => s.is_active);
  const inactive = suppliers.filter((s) => !s.is_active);

  function renderCard(s: SupplierRow) {
    const st = stats.get(s.id);
    const sColor = getSupplierColor(s.name);
    return (
      <div key={s.id} style={{
        border: "1px solid #ddd6c8", borderRadius: 12, padding: "14px 16px",
        background: "#fff", boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        borderLeft: `4px solid ${sColor}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link
                href={`/fournisseurs/${s.id}`}
                style={{ fontFamily: "DM Sans, sans-serif", fontWeight: 700, fontSize: 15, color: sColor, textDecoration: "none" }}
              >
                {s.name}
              </Link>
              {!s.is_active && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 6,
                  background: "rgba(0,0,0,0.08)", color: "#999",
                }}>inactif</span>
              )}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 12, color: "#999", marginTop: 4 }}>
              {s.contact_name || s.email || s.phone
                ? [s.contact_name, s.email, s.phone].filter(Boolean).join(" · ")
                : "Coordonnees non renseignees"}
            </div>

            <div style={{ fontFamily: "DM Sans, sans-serif", fontSize: 13, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span><strong>{st?.refCount ?? 0}</strong> <span style={{ color: "#999" }}>ref.</span></span>
              <span style={{ color: "#999", fontSize: 12 }}>
                {st?.lastImport
                  ? `Import : ${fmtDate(st.lastImport)}${st.lastImportNumber ? ` · ${st.lastImportNumber}` : ""}`
                  : "Aucun import"}
              </span>
            </div>
          </div>

          <Link
            href={`/fournisseurs/${s.id}`}
            style={{
              fontFamily: "DM Sans, sans-serif", fontSize: 13, fontWeight: 600,
              background: "#D4775A", color: "#fff", borderRadius: 20,
              padding: "7px 16px", textDecoration: "none", whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            Fiche
          </Link>
        </div>
      </div>
    );
  }

  return (
    <RequireRole allowedRoles={["group_admin", "cuisine", "salle"]}>
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 40px" }}>
        <h1 style={{
          fontFamily: "var(--font-oswald), Oswald, sans-serif", fontWeight: 700, fontSize: 24,
          color: "#1a1a1a", margin: "0 0 20px", textTransform: "uppercase", letterSpacing: "0.04em",
        }}>
          Fournisseurs
        </h1>

        {loading && <p style={{ color: "#999", fontSize: 14, textAlign: "center", marginTop: 40 }}>Chargement...</p>}

        {!loading && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {active.map(renderCard)}

            {inactive.length > 0 && (
              <>
                <div style={{
                  fontFamily: "DM Sans, sans-serif", fontSize: 12, fontWeight: 700,
                  color: "#999", letterSpacing: "0.08em", textTransform: "uppercase",
                  marginTop: 16, marginBottom: 4,
                }}>
                  Inactifs
                </div>
                {inactive.map(renderCard)}
              </>
            )}

            {suppliers.length === 0 && (
              <p style={{ color: "#999", fontSize: 14, textAlign: "center" }}>Aucun fournisseur en base.</p>
            )}
          </div>
        )}
      </main>
    </RequireRole>
  );
}
