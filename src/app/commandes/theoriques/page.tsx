"use client";

import Link from "next/link";
import { RequireRole } from "@/components/RequireRole";
import { useBureau } from "@/hooks/useBureau";
import { OSWALD } from "@/components/TuileProduit";
import { CommandesTheoriques } from "@/components/commandes/CommandesTheoriques";

const MUTED = "#6f6a61";

/** Proposition de commande d'après le stock théorique (déplacée depuis la page Stock le 10/10/2026). */
export default function Page() {
  const bureau = useBureau();
  return (
    <RequireRole permission="achats.edit">
      <div style={{ background: "#f2ede4", minHeight: "100vh" }}>
        <div style={{ padding: bureau ? "18px 28px 60px" : "12px 14px 90px", boxSizing: "border-box", display: "grid", gap: 14, alignContent: "start" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: 10 }}>
            <div>
              <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 28 : 22, textTransform: "uppercase", letterSpacing: ".02em", margin: 0, lineHeight: 1.05, color: "#1a1a1a" }}>Proposition de commande</h1>
              <div style={{ color: MUTED, fontSize: 13, marginTop: 4 }}>Ce qu&apos;il faudrait commander pour tenir jusqu&apos;à la prochaine livraison, d&apos;après le stock théorique et la consommation moyenne.</div>
            </div>
            <Link href="/commandes" style={{ height: 36, padding: "0 14px", borderRadius: 10, border: "1px solid #ddd6c8", background: "#fff", fontSize: 13, fontWeight: 600, color: "#1a1a1a", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>← Commandes</Link>
          </div>
          <CommandesTheoriques bureau={bureau} />
        </div>
      </div>
    </RequireRole>
  );
}
