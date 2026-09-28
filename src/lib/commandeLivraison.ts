/**
 * Date de livraison d'une commande envoyée maintenant, d'après suppliers.delivery_schedule
 * ([{ day, cutoff "HH:MM", delivery_day }], jours en français). Heure de Paris, jamais celle du serveur.
 * Maël : chaque jour, heure limite 03:00, livraison le jour même → envoyée à 22 h le lundi = livrée mardi.
 */

export type RegleLivraison = { day: string; cutoff: string; delivery_day: string };

const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Date (AAAA-MM-JJ), jour de semaine (0 = dimanche) et heure « HH:MM » à Paris */
export function maintenantParis(d: Date): { date: string; jour: number; heure: string } {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
      .formatToParts(d).map((x) => [x.type, x.value]),
  );
  const date = `${p.year}-${p.month}-${p.day}`;
  const jour = new Date(`${date}T12:00:00Z`).getUTCDay();
  return { date, jour, heure: `${p.hour}:${p.minute}` };
}

function ajouterJours(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** « mardi 29 septembre » */
export function libelleDate(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  return `${JOURS[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS[d.getUTCMonth()]}`;
}

const heureValide = (h: string | null | undefined) => /^\d{2}:\d{2}$/.test(String(h ?? ""));

/** Prochaine livraison pour une commande envoyée à `quand`, ou null si le planning est vide */
export function prochaineLivraison(regles: RegleLivraison[] | null | undefined, quand: Date = new Date()): { date: string; libelle: string } | null {
  if (!regles?.length) return null;
  const ici = maintenantParis(quand);
  for (let decalage = 0; decalage < 8; decalage++) {
    const jourCommande = (ici.jour + decalage) % 7;
    const r = regles.find((x) => x.day?.toLowerCase() === JOURS[jourCommande]);
    if (!r || !heureValide(r.cutoff)) continue;
    const jourLivraison = JOURS.indexOf(String(r.delivery_day ?? "").toLowerCase());
    if (jourLivraison === -1) continue;
    if (decalage === 0 && ici.heure >= r.cutoff) continue; // heure limite du jour dépassée
    const date = ajouterJours(ici.date, decalage + ((jourLivraison - jourCommande + 7) % 7));
    return { date, libelle: libelleDate(date) };
  }
  return null;
}

/**
 * Précommande (Maël, crèmerie italienne) : envoyée dans la semaine, livrée le mercredi de la semaine suivante
 * (semaine du lundi au dimanche, heure de Paris). Envoyée le mercredi 30/09 → livrée le mercredi 07/10.
 */
export function livraisonPrecommande(quand: Date = new Date()): { date: string; libelle: string } {
  const ici = maintenantParis(quand);
  const depuisLundi = (ici.jour + 6) % 7; // lundi = 0 … dimanche = 6
  const date = ajouterJours(ici.date, 7 - depuisLundi + 2); // lundi suivant + 2 jours
  return { date, libelle: libelleDate(date) };
}

/**
 * Limite Maël pour la précommande : le mercredi avant 12 h (heure de Paris).
 * Envoyée du mercredi 12 h au dimanche soir → en retard (avertissement, jamais bloqué).
 */
export function precommandeEnRetard(quand: Date = new Date()): boolean {
  const ici = maintenantParis(quand);
  const depuisLundi = (ici.jour + 6) % 7; // lundi = 0 … mercredi = 2 … dimanche = 6
  return depuisLundi > 2 || (depuisLundi === 2 && ici.heure >= "12:00");
}
