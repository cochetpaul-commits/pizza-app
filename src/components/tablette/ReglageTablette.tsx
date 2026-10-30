"use client";

import { DELAIS, reglerTablette, useTablette } from "@/lib/tablette/store";
import { CHAMP, INTERTITRE, MUTED } from "@/components/ui/charte";

/** Bloc « Tablette partagée » de Mon compte : active le mode tablette sur cet appareil et règle le délai. */
export function ReglageTablette() {
  const t = useTablette();
  return (
    <div>
      <div style={INTERTITRE}>Tablette partagée</div>
      <div style={{ fontSize: 12.5, color: MUTED, marginTop: 4, marginBottom: 10 }}>Sur cet appareil seulement. La tablette reste connectée avec ce compte ; chacun s&apos;identifie avec son code à 4 chiffres (réglé dans sa fiche employé) et les menus se limitent à Service, Cuisine, Achats et stock.</div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>
        <input type="checkbox" checked={t.actif} onChange={(e) => reglerTablette(e.target.checked, t.delai)} style={{ width: 18, height: 18, accentColor: "#4a6741" }} />
        Mode tablette sur cet appareil
      </label>
      {t.actif && (
        <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginTop: 10 }}>
          Déconnexion après
          <select value={t.delai} onChange={(e) => reglerTablette(true, Number(e.target.value))} style={{ ...CHAMP, width: "auto" }}>
            {DELAIS.map((d) => <option key={d.valeur} value={d.valeur}>{d.libelle}</option>)}
          </select>
          sans activité
        </label>
      )}
    </div>
  );
}
