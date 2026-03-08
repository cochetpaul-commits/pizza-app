import { ALLERGENS } from "@/lib/allergens";

export function AllergenBadges({ allergens }: { allergens: string[] }) {
  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {ALLERGENS.map(a => {
          const present = allergens.includes(a);
          return (
            <span key={a} style={{
              fontSize: 11,
              fontWeight: present ? 800 : 500,
              padding: "3px 8px",
              borderRadius: 6,
              background: present ? "rgba(220,38,38,0.12)" : "rgba(0,0,0,0.05)",
              color: present ? "#DC2626" : "rgba(0,0,0,0.3)",
              border: `1px solid ${present ? "rgba(220,38,38,0.3)" : "rgba(0,0,0,0.08)"}`,
            }}>
              {a}
            </span>
          );
        })}
      </div>
      {allergens.length > 0 && (
        <div style={{ marginTop: 6, fontSize: 12, color: "#DC2626", fontWeight: 700 }}>
          {allergens.length} allergène{allergens.length > 1 ? "s" : ""} présent{allergens.length > 1 ? "s" : ""}
        </div>
      )}
    </>
  );
}
