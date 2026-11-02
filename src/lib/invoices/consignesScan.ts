/**
 * Lecture des factures et bons en photo (02/11/2026) : consignes propres à certains fournisseurs, ajoutées à la
 * demande faite au lecteur d'image, et nettoyage des lignes lues. Logique pure, testée.
 *
 * Cozigou (document DSA, droits d'accises) : deux colonnes de quantité (colis, puis unités ou litres), un prix
 * hors droits et une accise unitaire à part, un montant de ligne « DS inclus » qui fait foi, une consignation de
 * fût et sa reprise de vide qui s'annulent, une ligne « INDEXATION ENERGIE ».
 */
type LigneLue = { sku: string | null; name: string | null; quantity: number | null; unit_price: number | null; total_price: number | null };

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const CONSIGNES: { motif: RegExp; texte: string }[] = [
  {
    motif: /cozigou/,
    texte: [
      "Consignes pour ce fournisseur (Cozigou, document commercial simplifié avec droits d'accises) :",
      "- sku = la colonne CODE (5 ou 6 chiffres).",
      "- La colonne QUANTITÉ a deux sous-colonnes : le nombre de colis (cartons, fûts) puis le nombre d'unités ou de litres. quantity = le NOMBRE DE COLIS (première sous-colonne). S'il n'y a qu'un seul nombre avant la désignation, c'est le nombre de bouteilles : quantity = ce nombre.",
      "- total_price = la colonne « MONT. HT DS* inclus » (montant de la ligne, droits d'accises compris). unit_price = total_price ÷ quantity.",
      "- Ne pas créer de ligne pour la consignation de fût ni pour la « REPRISE DE VIDE » (ex. « E162 FUT 30L 30.00 EUROS ») quand elles s'annulent.",
      "- La ligne « INDEXATION ENERGIE » est une ligne à part : name = \"INDEXATION ENERGIE\", quantity = 1, total_price = son montant.",
      "- invoice_number = le numéro après « FACTURE/AVOIR N° ». invoice_date = la date d'expédition (JJ/MM/AA, à écrire JJ/MM/AAAA).",
      "- total_ht = le TOTAL de la colonne « Montant HT DS* inclus » du tableau des TVA ; total_ttc = « NET A PAYER ».",
      "- Taux de TVA : code 1 = 5.5, code 2 = 20.",
    ].join("\n"),
  },
];

/** Consignes de lecture pour un fournisseur, ou chaîne vide */
export function consignesFournisseur(nom: string | null | undefined): string {
  const n = norm(nom);
  if (!n) return "";
  return CONSIGNES.filter((c) => c.motif.test(n)).map((c) => c.texte).join("\n\n");
}

const estConsigne = (nom: string | null) => /\bconsign|\breprise\b|\bvide\b|^e\d{3}\s+fut\b|\bfut\b.*\beuros?\b/.test(norm(nom));

/**
 * Retire les paires consignation / reprise de vide qui s'annulent (même montant, signes opposés) :
 * elles ne sont ni commandées ni facturées au final, et faisaient deux écarts « hors commande ».
 */
export function nettoyerLignesLues<T extends LigneLue>(lignes: T[]): T[] {
  const retirees = new Set<number>();
  lignes.forEach((a, i) => {
    if (retirees.has(i) || !estConsigne(a.name) || a.total_price == null || a.total_price === 0) return;
    const j = lignes.findIndex((b, k) => k !== i && !retirees.has(k) && estConsigne(b.name) && b.total_price != null && Math.abs(b.total_price + (a.total_price as number)) < 0.005);
    if (j >= 0) { retirees.add(i); retirees.add(j); }
  });
  return lignes.filter((_, i) => !retirees.has(i));
}
