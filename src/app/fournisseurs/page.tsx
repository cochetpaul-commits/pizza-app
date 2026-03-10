"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { NavBar } from "@/components/NavBar";
import { RequireRole } from "@/components/RequireRole";

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

  useEffect(() => {
    async function load() {
      setLoading(true);

      const [supRes, offRes, invRes] = await Promise.all([
        supabase.from("suppliers").select("id,name,is_active,email,phone,contact_name").order("name"),
        supabase.from("v_latest_offers").select("supplier_id"),
        supabase.from("supplier_invoices")
          .select("supplier_id,created_at,invoice_number")
          .order("created_at", { ascending: false }),
      ]);

      const rows = (supRes.data ?? []) as SupplierRow[];
      setSuppliers(rows);

      // Ref counts from latest offers
      const offerCounts = new Map<string, number>();
      for (const o of (offRes.data ?? [])) {
        if (o.supplier_id) offerCounts.set(o.supplier_id, (offerCounts.get(o.supplier_id) ?? 0) + 1);
      }

      // Last import per supplier (already ordered desc)
      const lastImports = new Map<string, { created_at: string; invoice_number: string | null }>();
      for (const inv of (invRes.data ?? [])) {
        if (inv.supplier_id && !lastImports.has(inv.supplier_id)) {
          lastImports.set(inv.supplier_id, { created_at: inv.created_at, invoice_number: inv.invoice_number });
        }
      }

      const m = new Map<string, SupplierStats>();
      for (const s of rows) {
        const li = lastImports.get(s.id);
        m.set(s.id, {
          refCount: offerCounts.get(s.id) ?? 0,
          lastImport: li?.created_at ?? null,
          lastImportNumber: li?.invoice_number ?? null,
        });
      }

      setStats(m);
      setLoading(false);
    }

    load();
  }, []);

  const active = suppliers.filter((s) => s.is_active);
  const inactive = suppliers.filter((s) => !s.is_active);

  function renderCard(s: SupplierRow) {
    const st = stats.get(s.id);
    return (
      <div key={s.id} className="card" style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Link
                href={`/fournisseurs/${s.id}`}
                style={{ fontWeight: 900, fontSize: 15, color: "#7a4a2a", textDecoration: "none" }}
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

            <div className="muted" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
              {s.contact_name && <span>👤 {s.contact_name}</span>}
              {s.email && <span>✉️ {s.email}</span>}
              {s.phone && <span>📞 {s.phone}</span>}
              {!s.contact_name && !s.email && !s.phone && (
                <span style={{ fontStyle: "italic" }}>Coordonnées non renseignées</span>
              )}
            </div>

            <div style={{ marginTop: 6, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13 }}>
                <strong>{st?.refCount ?? 0}</strong>
                <span className="muted" style={{ fontWeight: 400, marginLeft: 3 }}>réf.</span>
              </span>
              {st?.lastImport && (
                <span className="muted" style={{ fontSize: 12 }}>
                  Import : {fmtDate(st.lastImport)}
                  {st.lastImportNumber ? ` · ${st.lastImportNumber}` : ""}
                </span>
              )}
              {!st?.lastImport && (
                <span className="muted" style={{ fontSize: 12, fontStyle: "italic" }}>Aucun import</span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flexShrink: 0, alignItems: "flex-end" }}>
            <Link href={`/fournisseurs/${s.id}`} className="btn btnPrimary">Fiche →</Link>
            <Link href={`/ingredients?supplier=${s.id}`} className="btn">Ingrédients</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <RequireRole allowedRoles={["admin", "direction"]}>
    <>
      <NavBar />
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 26, fontWeight: 700, fontFamily: "var(--font-oswald), 'Oswald', sans-serif", letterSpacing: 1.5, textTransform: "uppercase" as const }}>Fournisseurs</div>
          <div className="muted" style={{ marginTop: 2 }}>
            Coordonnées, références et historique d&apos;imports.
          </div>
        </div>

        {loading && <div className="muted">Chargement…</div>}

        {!loading && (
          <div style={{ display: "grid", gap: 10 }}>
            {active.map(renderCard)}

            {inactive.length > 0 && (
              <>
                <div className="muted" style={{ fontSize: 12, marginTop: 4, fontWeight: 700, letterSpacing: 0.5 }}>
                  INACTIFS
                </div>
                {inactive.map(renderCard)}
              </>
            )}

            {suppliers.length === 0 && (
              <div className="card" style={{ padding: 20, textAlign: "center" }}>
                <div className="muted">Aucun fournisseur en base.</div>
              </div>
            )}
          </div>
        )}
      </main>
    </>
    </RequireRole>
  );
}
