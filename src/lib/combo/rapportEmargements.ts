import type { ComboDayDetail, ComboEmployeePresence, ParsedComboDocument } from "@/lib/combo/types";

/**
 * Rapport Combo « Émargements et validations » (export xlsx, 27/10/2026) : une ligne par service avec
 * les heures planifiées, pointées et validées. C'est la source des heures réellement travaillées pour la
 * masse salariale ; la synchronisation API ne connaît que le planning. Les lignes sont regroupées par
 * établissement et par semaine (lundi → dimanche), au format des imports PDF (ParsedComboDocument).
 * Heures travaillées = heures validées (début/fin validés moins la pause validée) ; sans validation, le
 * planning fait foi. Un service net de 5 h et plus compte un repas.
 */
export type LigneRapport = Record<string, string | number | null | undefined>;

const col = (r: LigneRapport, ...noms: string[]) => {
  for (const n of noms) { const k = Object.keys(r).find((x) => x.trim().toLowerCase() === n.toLowerCase()); if (k != null && r[k] != null && String(r[k]).trim() !== "") return String(r[k]).trim(); }
  return null;
};
const minutes = (hhmm: string | null) => { if (!hhmm) return null; const m = hhmm.match(/^(\d{1,2})[:h](\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const duree = (debut: string | null, fin: string | null, pause: string | null): number | null => {
  const d = minutes(debut), f = minutes(fin);
  if (d == null || f == null) return null;
  return Math.max(0, (f < d ? f + 1440 : f) - d - (Number(pause) || 0));
};
/** « 01/10/2026 » ou « 2026-10-01 » → AAAA-MM-JJ */
export const dateIso = (s: string | null): string | null => {
  if (!s) return null;
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/); if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return m[0];
  return null;
};
const lundiDe = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const plusJours = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const JOURS = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const r2 = (n: number) => Math.round(n * 100) / 100;

export function estRapportEmargements(lignes: LigneRapport[]): boolean {
  const r = lignes[0];
  return !!r && col(r, "Collaborateur") != null && col(r, "Début planifié") != null && Object.keys(r).some((k) => /valid/i.test(k));
}

/** Les documents par établissement et par semaine, prêts pour combo_presences */
export function parseRapportEmargements(lignes: LigneRapport[]): ParsedComboDocument[] {
  type Acc = { prenom: string; nom: string; equipe: string | null; plan: number; trav: number; repas: number; jours: Map<string, ComboDayDetail> };
  const docs = new Map<string, { etab: string; debut: string; fin: string; emps: Map<string, Acc> }>();
  for (const r of lignes) {
    const date = dateIso(col(r, "Jour", "Date"));
    const nom = col(r, "Collaborateur");
    const etab = col(r, "Établissement", "Etablissement") ?? "";
    if (!date || !nom) continue;
    const debut = lundiDe(date), fin = plusJours(debut, 6);
    const cle = `${etab}|${debut}`;
    const doc = docs.get(cle) ?? { etab, debut, fin, emps: new Map() };
    const parts = nom.split(/\s+/);
    const acc = doc.emps.get(nom) ?? { prenom: parts[0] ?? nom, nom: parts.slice(1).join(" "), equipe: col(r, "Équipe", "Equipe"), plan: 0, trav: 0, repas: 0, jours: new Map() };
    const plan = duree(col(r, "Début planifié"), col(r, "Fin planifiée"), col(r, "Pauses planifiées (en minutes)", "Pauses planifiées")) ?? 0;
    const valide = duree(col(r, "Début validé"), col(r, "Fin validée"), col(r, "Pauses validées (en minutes)", "Pauses validées"));
    const trav = valide ?? plan;
    acc.plan += plan; acc.trav += trav; if (trav >= 300) acc.repas++;
    const jour = acc.jours.get(date) ?? { date, jour: JOURS[new Date(`${date}T12:00:00Z`).getUTCDay()], shifts: [] };
    jour.shifts.push({
      prevu: [col(r, "Début planifié"), col(r, "Fin planifiée")].filter(Boolean).join("-") || null, pause_prevu: Number(col(r, "Pauses planifiées (en minutes)")) || null,
      reel: [col(r, "Début pointé"), col(r, "Fin pointée")].filter(Boolean).join("-") || null, pause_reel: Number(col(r, "Pauses pointées (en minutes)")) || null,
      emarge: [col(r, "Début validé"), col(r, "Fin validée")].filter(Boolean).join("-") || null, ecart_minutes: trav - plan, tps_travail_minutes: trav, equipe: acc.equipe, repas: trav >= 300 ? 1 : 0,
    });
    acc.jours.set(date, jour); doc.emps.set(nom, acc); docs.set(cle, doc);
  }
  return [...docs.values()].sort((a, b) => a.etab.localeCompare(b.etab) || a.debut.localeCompare(b.debut)).map((d) => ({
    etablissement_nom: d.etab, equipe: null, periode_debut: d.debut, periode_fin: d.fin,
    employes: [...d.emps.entries()].map(([combo_nom, a]): ComboEmployeePresence => ({
      combo_nom, prenom: a.prenom, nom: a.nom, etablissement_combo: d.etab, equipe: a.equipe,
      heures_planifiees: r2(a.plan / 60), heures_travaillees: r2(a.trav / 60), heures_contrat: 0, nb_repas: a.repas, nb_jours_travailles: a.jours.size,
      detail_jours: [...a.jours.values()].sort((x, y) => x.date.localeCompare(y.date)),
    })).sort((x, y) => x.combo_nom.localeCompare(y.combo_nom, "fr")),
  }));
}
