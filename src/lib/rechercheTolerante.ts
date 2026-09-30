/**
 * Recherche tolérante aux fautes : « aqua filete » trouve « ACQUA FILETTE », « frizante » trouve « FRIZZANTE ».
 * Chaque mot tapé doit correspondre à un mot du texte : début de mot, mot contenu, ou mot proche
 * (une lettre de travers pour 4 à 6 lettres, deux à partir de 7). Accents et casse sont ignorés.
 * Le score sert à classer : les correspondances exactes avant les approximatives.
 */

export const normaliserRecherche = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/** Distance de Levenshtein, arrêtée dès qu'elle dépasse `max` */
export function distanceMots(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let mini = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < mini) mini = cur[j];
    }
    if (mini > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const tolerance = (mot: string) => (mot.length >= 7 ? 2 : mot.length >= 4 ? 1 : 0);

/** Score d'un mot tapé contre les mots du texte : 3 mot entier, 2 début de mot, 1 contenu, 0.5 approché ; null sinon */
function scoreMot(mot: string, motsTexte: string[]): number | null {
  let meilleur: number | null = null;
  const garder = (s: number) => { if (meilleur == null || s > meilleur) meilleur = s; };
  for (const t of motsTexte) {
    if (t === mot) { garder(3); continue; }
    if (t.startsWith(mot)) { garder(2); continue; }
    if (t.includes(mot)) { garder(1); continue; }
    const tol = tolerance(mot);
    if (tol === 0) continue;
    // Mot entier proche, ou début du mot du texte proche (« filete » ~ « filett(e) »)
    if (distanceMots(mot, t, tol) <= tol || (t.length > mot.length && distanceMots(mot, t.slice(0, mot.length), tol) <= tol)) garder(0.5);
  }
  return meilleur;
}

/** Score de la requête contre un texte ; null si un mot tapé ne correspond à rien. Requête vide : 0 (tout passe). */
export function scoreRecherche(requete: string, texte: string): number | null {
  const mots = normaliserRecherche(requete).split(" ").filter((m) => m.length >= 2);
  if (mots.length === 0) return 0;
  const motsTexte = normaliserRecherche(texte).split(" ").filter(Boolean);
  // Les mots tapés collés (« acquafilette ») : le texte entier sans espaces compte aussi comme un mot
  const colle = motsTexte.join("");
  let total = 0;
  for (const m of mots) {
    const s = scoreMot(m, colle && colle !== motsTexte[0] ? [...motsTexte, colle] : motsTexte);
    if (s == null) return null;
    total += s;
  }
  return total;
}

export const correspondRecherche = (requete: string, texte: string) => scoreRecherche(requete, texte) != null;

/** Filtre et classe une liste : meilleurs scores d'abord, puis ordre alphabétique du texte */
export function filtrerRecherche<T>(items: T[], requete: string, texteDe: (x: T) => string): T[] {
  const notes = items
    .map((x) => ({ x, t: texteDe(x), s: scoreRecherche(requete, texteDe(x)) }))
    .filter((n): n is { x: T; t: string; s: number } => n.s != null);
  notes.sort((a, b) => b.s - a.s || a.t.localeCompare(b.t, "fr"));
  return notes.map((n) => n.x);
}
