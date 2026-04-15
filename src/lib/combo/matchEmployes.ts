import type { SupabaseClient } from "@supabase/supabase-js";

function normalize(s: string): string {
  return s
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[-']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type DbEmploye = { id: string; prenom: string; nom: string };

export async function matchEmployes(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  etabId: string,
  comboEmployes: Array<{ prenom: string; nom: string; combo_nom: string }>,
): Promise<Map<string, string | null>> {
  const { data: dbEmployes } = await supabase
    .from("employes")
    .select("id, prenom, nom")
    .contains("etablissements_ids", [etabId])
    .eq("actif", true);

  const result = new Map<string, string | null>();
  const emps = (dbEmployes ?? []) as DbEmploye[];

  for (const combo of comboEmployes) {
    const cPrenom = normalize(combo.prenom);
    const cNom = normalize(combo.nom);

    let matchId: string | null = null;

    for (const emp of emps) {
      const ePrenom = normalize(emp.prenom);
      const eNom = normalize(emp.nom);

      // Exact match
      if (ePrenom === cPrenom && eNom === cNom) { matchId = emp.id; break; }
      // Reversed
      if (ePrenom === cNom && eNom === cPrenom) { matchId = emp.id; break; }
      // Nom-only
      if (eNom === cNom && !matchId) { matchId = emp.id; }
    }

    result.set(combo.combo_nom, matchId);
  }

  return result;
}
