"use client";

/**
 * Sélecteur d'établissements d'une fiche recette : la fiche apparaît
 * dans le catalogue des restos cochés. Slugs canoniques de la table
 * etablissements : bello_mio / piccola (ne PAS confondre avec la
 * convention bellomio/piccola des tables ingrédients).
 * Au moins un resto reste toujours coché.
 */

export const ETABS_RECETTES = [
  { slug: "bello_mio", label: "Bello Mio", color: "#D4775A" },
  { slug: "piccola", label: "Piccola Mia", color: "#C99A2E" },
] as const;

/** Valeur chargée depuis la base → sélection (NULL/legacy = les deux) */
export function estabsFromRow(v: unknown): string[] {
  const arr = Array.isArray(v) ? (v as string[]) : [];
  const connus = arr.filter(s => ETABS_RECETTES.some(e => e.slug === s));
  return connus.length > 0 ? connus : ETABS_RECETTES.map(e => e.slug);
}

/** Sélection → valeur à sauvegarder (les deux = NULL, visible partout) */
export function estabsToPayload(sel: string[]): string[] | null {
  return sel.length >= ETABS_RECETTES.length ? null : sel;
}

export function EtabsSelector({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (slug: string) => {
    const has = value.includes(slug);
    if (has && value.length === 1) return; // toujours au moins un resto
    onChange(has ? value.filter(s => s !== slug) : [...value, slug]);
  };
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6a61", letterSpacing: 0.3, marginBottom: 6 }}>
        Établissements
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {ETABS_RECETTES.map(e => {
          const on = value.includes(e.slug);
          return (
            <button key={e.slug} type="button" onClick={() => toggle(e.slug)} style={{
              padding: "8px 16px", borderRadius: 999, cursor: "pointer",
              border: on ? `2px solid ${e.color}` : "1.5px solid #ddd6c8",
              background: on ? `${e.color}14` : "#fff",
              color: on ? e.color : "#999", fontSize: 13, fontWeight: 700,
            }}>
              {on ? "✓ " : ""}{e.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 10.5, color: "#999", marginTop: 5 }}>
        La fiche apparaît dans le catalogue des restos cochés — pratique pour se prêter les recettes.
      </div>
    </div>
  );
}
