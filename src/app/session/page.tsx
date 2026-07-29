"use client";

import { useRouter } from "next/navigation";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";

export default function SessionPage() {
  const router = useRouter();
  const { etablissements, current, setCurrent, isGroupView, setGroupView } = useEtablissement();
  const { role, displayName } = useProfile();

  return (
    <div style={{ maxWidth: 500, margin: "0 auto", padding: "40px 16px 100px" }}>
      <h1 style={{
        fontSize: 20, fontFamily: "var(--font-oswald), Oswald, sans-serif",
        fontWeight: 700, color: "#1a1a1a", textTransform: "uppercase",
        letterSpacing: "0.06em", marginBottom: 8,
      }}>
        Changer de session
      </h1>
      <p style={{ fontSize: 13, color: "#999", marginBottom: 24 }}>
        {displayName} — {role}
      </p>

      {/* Group view */}
      <button
        type="button"
        onClick={() => { setGroupView(true); router.push("/dashboard"); }}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 12,
          padding: "16px 18px", marginBottom: 8,
          background: isGroupView ? "rgba(212,119,90,0.08)" : "#fff",
          border: isGroupView ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
          borderRadius: 14, cursor: "pointer", textAlign: "left",
        }}
      >
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1a1a1a", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <path d="M9 22V12h6v10" />
            <path d="M8 6h.01" /><path d="M16 6h.01" />
            <path d="M8 10h.01" /><path d="M16 10h.01" />
          </svg>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>iFratelli Group</div>
          <div style={{ fontSize: 11, color: "#999" }}>Vue globale — tous les etablissements</div>
        </div>
        {isGroupView && <span style={{ marginLeft: "auto", color: "#D4775A", fontSize: 16 }}>✓</span>}
      </button>

      {/* Individual establishments */}
      {etablissements.map(etab => {
        const isActive = !isGroupView && current?.id === etab.id;
        const color = etab.couleur ?? "#D4775A";
        return (
          <button
            key={etab.id}
            type="button"
            onClick={() => { setGroupView(false); setCurrent(etab); router.push("/dashboard"); }}
            style={{
              width: "100%", display: "flex", alignItems: "center", gap: 12,
              padding: "16px 18px", marginBottom: 8,
              background: isActive ? `${color}10` : "#fff",
              border: isActive ? `1.5px solid ${color}` : "1px solid #ddd6c8",
              borderRadius: 14, cursor: "pointer", textAlign: "left",
            }}
          >
            <div style={{ width: 40, height: 40, borderRadius: 10, background: color, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l1-4h16l1 4" />
                <path d="M5 11v10h14V11" />
                <path d="M9 21V15h6v6" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a" }}>{etab.nom}</div>
              <div style={{ fontSize: 11, color: "#999" }}>{etab.slug}</div>
            </div>
            {isActive && <span style={{ marginLeft: "auto", color, fontSize: 16 }}>✓</span>}
          </button>
        );
      })}
    </div>
  );
}
