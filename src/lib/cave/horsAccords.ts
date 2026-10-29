/** Touches de caisse sans accord de vin : assiettes et pâtes des enfants, contorni (salade, patate), glaces */
export function estHorsAccords(nom: string): boolean {
  const n = nom.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return /^glace/.test(n) || /^(assiette )?pasta (beurre|pesto|tomate)/.test(n) || /^(insalate verde|patate croccanti)$/.test(n);
}

