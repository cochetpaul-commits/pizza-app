// ── Auto-detection of establishment and supplier from PDF text ───────────────

type DetectResult = {
  etablissement: string | null;
  fournisseur: string | null;
};

const ETAB_KEYWORDS: Record<string, string[]> = {
  bello_mio: ["SARL SASHA", "SASHA", "BELLO MIO"],
  piccola_mia: ["SARL I FRATELLI", "I FRATELLI", "IFRATELLI", "PICCOLA MIA"],
};

const SUPPLIER_KEYWORDS: Record<string, string[]> = {
  metro: ["METRO", "MÉTRO", "METRO FRANCE", "METRO CASH", "METRO SAINT MALO"],
  mael: ["MAEL", "MAËL", "MAEL SARL"],
  masse: ["MASSE", "SARL MASSE"],
  cozigou: ["COZIGOU"],
  vinoflo: ["VINOFLO"],
  carniato: ["CARNIATO"],
  bar_spirits: ["BAR SPIRITS", "BARSPIRITS"],
  sum: ["SUM SARL", "SUM ", "BUSSY-SAINT-GEORGES"],
  armor: ["ARMOR EMBALLAGES", "ARMOR-EMBALLAGES", "CAUDAN"],
  lmdw: ["LMDW", "MAISON DU WHISKY", "SOCIETE NOUVELLE DE PRODUITS ALIMENTAIRES"],
  sdpf: ["S.D.P.F", "SDPF", "PROGOURMANDS", "PRODUITS FINS"],
  elien: ["ERIC ELIEN", "ELIEN", "ARTISAN GLACIER", "ERIC-ELIEN"],
};

function containsKeyword(text: string, keywords: string[]): boolean {
  const upper = text.toUpperCase();
  return keywords.some((kw) => upper.includes(kw.toUpperCase()));
}

export function detectSupplier(text: string): DetectResult {
  let etablissement: string | null = null;
  for (const [etab, keywords] of Object.entries(ETAB_KEYWORDS)) {
    if (containsKeyword(text, keywords)) {
      etablissement = etab;
      break;
    }
  }

  let fournisseur: string | null = null;
  for (const [fourn, keywords] of Object.entries(SUPPLIER_KEYWORDS)) {
    if (containsKeyword(text, keywords)) {
      fournisseur = fourn;
      break;
    }
  }

  return { etablissement, fournisseur };
}
