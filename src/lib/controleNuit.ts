/**
 * Contrôle de la nuit (étape 2 de la clôture, 16/10/2026). Vers 1 h, une fois le Z Popina publié, l'app
 * relit le vrai rapport Popina du soir et le compare à la clôture saisie par l'équipe :
 * - les montants Popina recopiés le soir sont-ils ceux du Z (corrections faites mais pas recopiées, frappe) ;
 * - le Z Popina réel tombe-t-il juste face au ticket Z du TPE (même calcul que le soir) ;
 * - le tiroir compté face au fond final Popina ;
 * - avec l'export Flatpay du jour, le rapprochement paiement par paiement (TPE ↔ Popina).
 * Logique pure : les données Popina et Flatpay sont chargées par la route.
 */
import { calculerCloture, eur, type SaisieCloture } from "@/lib/cloture";
import type { TransactionFlatpay } from "@/lib/flatpay";

export type RapportPopina = {
  reportPayments?: { paymentName: string; paymentAmount: number }[];
  reportEntries?: { entryName: string; entryAmount: number; entryType?: string }[];
  initialCashBalance?: number;
  finalCashBalance?: number;
  totalSales?: number;
  finalizedAt?: string;
};

/** Paiement carte d'une commande Popina (centimes convertis en €) */
export type PaiementPopina = { montant: number; mode: "cb" | "amex"; heure: string | null; table: string | null };

export type NiveauControle = "ok" | "ecart" | "absent" | "sans_saisie";

export type ControleNuit = {
  niveau: NiveauControle;
  titre: string;
  messages: string[];
  popina: { cb: number; amex: number; conecs: number; especes: number; autres: { nom: string; montant: number }[]; fondInitial: number | null; fondFinal: number | null; entrees: string[] } | null;
  /** Montants recopiés le soir qui ne sont pas ceux du Z Popina */
  differences: { libelle: string; soir: number; reel: number }[];
  /** Verdict du soir recalculé avec le vrai Z Popina */
  verdictReel: { niveau: string; titre: string; residu: number } | null;
  tiroir: { compte: number; attendu: number; ecart: number } | null;
  rapprochement: {
    pourboires: { montant: number; nb: number };
    tpeSeuls: { montant: number; heure: string; mode: string }[];
    popinaSeuls: { montant: number; heure: string | null; table: string | null; mode: string }[];
  } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const nul = (n: number) => Math.abs(n) < 0.005;
const euros = (centimes: number | undefined) => r2((centimes ?? 0) / 100);
const heureParis = (iso: string) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Répartit les paiements du Z Popina par mode (les noms sont ceux de l'écran de clôture Popina) */
export function lirePaiements(r: RapportPopina) {
  const out = { cb: 0, amex: 0, conecs: 0, especes: 0, autres: [] as { nom: string; montant: number }[] };
  for (const p of r.reportPayments ?? []) {
    const m = euros(p.paymentAmount);
    const nom = p.paymentName.toLowerCase();
    if (/american|amex/.test(nom)) out.amex = r2(out.amex + m);
    else if (/connecs|conecs/.test(nom)) out.conecs = r2(out.conecs + m);
    else if (/esp[eè]ces/.test(nom)) out.especes = r2(out.especes + m);
    else if (/carte de cr[ée]dit|^carte$|cb/.test(nom)) out.cb = r2(out.cb + m);
    else out.autres.push({ nom: p.paymentName, montant: m });
  }
  return out;
}

/**
 * Rapprochement TPE ↔ Popina, paiement par paiement : d'abord les montants identiques, puis les paiements
 * TPE un peu plus élevés (le pourboire : au plus 20 % ou 5 €), au plus près dans le temps.
 */
export function rapprocher(tpe: TransactionFlatpay[], popina: PaiementPopina[]) {
  const t = tpe.map((x, i) => ({ ...x, i, pris: false }));
  const p = popina.map((x, i) => ({ ...x, i, pris: false }));
  const ecartTemps = (a: string, b: string | null) => (b ? Math.abs(new Date(a).getTime() - new Date(b).getTime()) : 3 * 3600e3);
  let pourboires = 0;
  let nb = 0;
  const passe = (accepte: (tm: number, pm: number) => boolean, fenetre: number) => {
    for (const x of t) {
      if (x.pris) continue;
      const candidats = p.filter((y) => !y.pris && y.mode === (x.mode === "amex" ? "amex" : "cb") && accepte(x.montant, y.montant) && ecartTemps(x.horodatage, y.heure) <= fenetre)
        .sort((a, b) => ecartTemps(x.horodatage, a.heure) - ecartTemps(x.horodatage, b.heure));
      const y = candidats[0];
      if (!y) continue;
      x.pris = true; y.pris = true;
      const tip = r2(x.montant - y.montant);
      if (tip > 0.005) { pourboires = r2(pourboires + tip); nb++; }
    }
  };
  passe((tm, pm) => Math.abs(tm - pm) < 0.005, 4 * 3600e3);
  passe((tm, pm) => tm > pm && tm - pm <= Math.max(5, pm * 0.2) + 0.005, 3600e3);
  return {
    pourboires: { montant: pourboires, nb },
    tpeSeuls: t.filter((x) => !x.pris).map((x) => ({ montant: x.montant, heure: heureParis(x.horodatage), mode: x.mode })),
    popinaSeuls: p.filter((y) => !y.pris).map((y) => ({ montant: y.montant, heure: y.heure ? heureParis(y.heure) : null, table: y.table, mode: y.mode })),
  };
}

export function controlerNuit(args: {
  saisie: SaisieCloture | null;
  corrections: string[];
  rapports: RapportPopina[];
  tpe?: TransactionFlatpay[];
  paiementsPopina?: PaiementPopina[];
}): ControleNuit {
  const { saisie, corrections, rapports } = args;
  const vide: Omit<ControleNuit, "niveau" | "titre" | "messages"> = { popina: null, differences: [], verdictReel: null, tiroir: null, rapprochement: null };
  if (!rapports.length) return { ...vide, niveau: "absent", titre: "Pas de Z Popina pour ce soir.", messages: ["La caisse Popina n'a pas été arrêtée, ou le restaurant était fermé. Le contrôle repassera au matin."] };

  // Plusieurs Z le même jour : on additionne
  const lus = rapports.map(lirePaiements);
  const somme = (k: "cb" | "amex" | "conecs" | "especes") => r2(lus.reduce((t, l) => t + l[k], 0));
  const popina = {
    cb: somme("cb"), amex: somme("amex"), conecs: somme("conecs"), especes: somme("especes"),
    autres: lus.flatMap((l) => l.autres),
    fondInitial: rapports[0].initialCashBalance != null ? euros(rapports[0].initialCashBalance) : null,
    fondFinal: rapports[rapports.length - 1].finalCashBalance != null ? euros(rapports[rapports.length - 1].finalCashBalance) : null,
    // « Cagnotte de … (-P4-OO3AA8zIB…) avec le mode de paiement Carte de crédit » : sans l'identifiant Popina
    entrees: rapports.flatMap((r) => (r.reportEntries ?? []).map((e) => `${e.entryName.replace(/\s*\([^)]*\)/g, "")} : ${eur(euros(e.entryAmount))}`)),
  };

  if (!saisie?.z || saisie.z.total == null || saisie.popina?.cb == null) {
    return { ...vide, popina, niveau: "sans_saisie", titre: "Z Popina publié, mais pas de clôture saisie dans l'app.", messages: ["Personne n'a rempli l'écran Clôture ce soir : rien n'a été comparé au TPE."] };
  }

  const messages: string[] = [];
  const differences: ControleNuit["differences"] = [];
  const comparer = (libelle: string, soir: number | null, reel: number) => {
    if (soir != null && !nul(soir - reel)) differences.push({ libelle, soir, reel });
  };
  comparer("Carte de crédit", saisie.popina.cb, popina.cb);
  comparer("American Express", saisie.popina.amex ?? 0, popina.amex);
  comparer("Carte Connecs", saisie.popina.conecs ?? 0, popina.conecs);
  comparer("Espèces", saisie.popina.especes, popina.especes);
  if (differences.length) messages.push(`Les montants recopiés le soir ne sont pas ceux du Z Popina : ${differences.map((d) => `${d.libelle} ${eur(d.soir)} recopié, ${eur(d.reel)} au Z`).join(" ; ")}. Une correction faite dans Popina n'a pas été recopiée, ou un montant a été mal tapé.`);

  // Le verdict du soir, refait avec le vrai Z Popina
  const reelle: SaisieCloture = { ...saisie, popina: { ...saisie.popina, cb: popina.cb, amex: popina.amex, conecs: popina.conecs, especes: popina.especes } };
  const v = calculerCloture(reelle);
  const verdictReel = { niveau: v.niveau, titre: v.titre, residu: v.residu };

  // Tiroir compté face au fond final Popina
  let tiroir: ControleNuit["tiroir"] = null;
  if (v.tiroirCompte != null && popina.fondFinal != null) {
    tiroir = { compte: v.tiroirCompte, attendu: popina.fondFinal, ecart: r2(v.tiroirCompte - popina.fondFinal) };
    if (!nul(tiroir.ecart)) messages.push(`Tiroir : ${eur(tiroir.compte)} compté pour ${eur(tiroir.attendu)} de fond final Popina (${tiroir.ecart > 0 ? `${eur(tiroir.ecart)} de trop perçu` : `il manquait ${eur(-tiroir.ecart)}`}, réglé avec les pourboires).`);
  }
  if (popina.autres.length) messages.push(`Autres paiements au Z : ${popina.autres.map((a) => `${a.nom} ${eur(a.montant)}`).join(", ")}.`);
  if (popina.entrees.length) messages.push(`Mouvements de caisse : ${popina.entrees.join(" ; ")}.`);
  if (saisie.ajustement != null) messages.push(`Ajustement déclaré le soir en prix sur mesure : ${eur(Math.abs(saisie.ajustement))}.`);
  if (corrections.length) messages.push(`Corrections notées le soir : ${corrections.join(" ; ")}.`);

  // Paiement par paiement, quand l'export Flatpay du jour a été déposé
  let rapprochement: ControleNuit["rapprochement"] = null;
  const tpe = (args.tpe ?? []).filter((x) => x.mode !== "conecs" && !/refus|annul|declin|fail|échou|echou/i.test(x.statut) && !/rembours|refund/i.test(x.operation));
  if (tpe.length && args.paiementsPopina?.length) {
    rapprochement = rapprocher(tpe, args.paiementsPopina);
    const pz = r2((saisie.z.pourboires ?? 0));
    if (rapprochement.tpeSeuls.length || rapprochement.popinaSeuls.length) {
      messages.push(`Paiement par paiement : ${rapprochement.tpeSeuls.length} transaction${rapprochement.tpeSeuls.length > 1 ? "s" : ""} TPE sans paiement Popina, ${rapprochement.popinaSeuls.length} paiement${rapprochement.popinaSeuls.length > 1 ? "s" : ""} carte Popina sans transaction TPE.`);
    } else messages.push(`Paiement par paiement : chaque transaction TPE a son paiement Popina.`);
    if (!nul(rapprochement.pourboires.montant - pz)) messages.push(`Pourboires retrouvés : ${eur(rapprochement.pourboires.montant)} (${rapprochement.pourboires.nb}) pour ${eur(pz)} au ticket Z.`);
  }

  const ok = v.niveau === "ok";
  return {
    niveau: ok ? "ok" : "ecart",
    titre: ok
      ? (differences.length ? "Le Z Popina tombe juste face au TPE (la saisie du soir avait des montants différents)." : "Contrôle juste : le Z Popina tombe au centime face au TPE.")
      : `Le Z Popina ne tombe pas juste face au TPE : ${v.titre.charAt(0).toLowerCase()}${v.titre.slice(1)}`,
    messages,
    popina,
    differences,
    verdictReel,
    tiroir,
    rapprochement,
  };
}
