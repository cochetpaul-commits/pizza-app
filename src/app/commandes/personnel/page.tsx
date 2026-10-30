"use client";

import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { useBureau } from "@/hooks/useBureau";
import { BTN, MUTED, h1 } from "@/components/ui/charte";
import { CoursesPersonnel } from "@/components/commandes/CoursesPersonnel";

/** Courses du personnel (29/10/2026) : liste de courses des repas du personnel et relevé du mois pour le cabinet. */
export default function Page() {
  const bureau = useBureau();
  return (
    <RequireRole permission="achats.edit">
      <div style={{ background: "#f2ede4", minHeight: "100vh" }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: bureau ? "18px 28px 60px" : "12px 14px 90px", boxSizing: "border-box", display: "grid", gap: 14, alignContent: "start" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <div>
              <h1 style={h1(bureau)}>Repas du personnel</h1>
              <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>La liste de courses de l&apos;équipe, partagée : on coche en faisant les courses chez Metro. Hors achats matières, avec le relevé du mois pour le cabinet.</div>
            </div>
            <Link href="/commandes" style={{ ...BTN, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>← Commandes</Link>
          </div>
          <CoursesPersonnel bureau={bureau} />
        </div>
      </div>
    </RequireRole>
  );
}
