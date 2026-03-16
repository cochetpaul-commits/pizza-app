/**
 * Auto-detection of establishment and supplier from invoice PDF text.
 */

export type DetectedSupplier = {
  slug: string;
  name: string;
  matchedKeyword: string;
};

export type DetectedEtablissement = {
  slug: string;
  name: string;
  matchedKeyword: string;
};

export type DetectionResult = {
  supplier: DetectedSupplier | null;
  etablissement: DetectedEtablissement | null;
};

const ETAB_KEYWORDS: Record<string, { name: string; keywords: string[] }> = {
  bello_mio: {
    name: "Bello Mio",
    keywords: ["SARL SASHA", "SASHA", "BELLO MIO"],
  },
  piccola_mia: {
    name: "Piccola Mia",
    keywords: ["SARL I FRATELLI", "I FRATELLI", "IFRATELLI", "PICCOLA MIA"],
  },
};

const SUPPLIER_KEYWORDS: Record<string, { name: string; keywords: string[] }> = {
  mael:     { name: "Maël",     keywords: ["MAEL", "MAËL", "MAEL SARL"] },
  metro:    { name: "Metro",    keywords: ["METRO", "MÉTRO", "METRO CASH", "METRO FRANCE"] },
  masse:    { name: "Masse",    keywords: ["MASSE"] },
  cozigou:  { name: "Cozigou",  keywords: ["COZIGOU"] },
  vinoflo:  { name: "Vinoflo",  keywords: ["VINOFLO"] },
  carniato: { name: "Carniato", keywords: ["CARNIATO"] },
  barspirits: { name: "Bar Spirits", keywords: ["BAR SPIRITS", "BARSPIRITS"] },
  sum:      { name: "Sum",      keywords: ["SUM SARL", "SUM "] },
  armor:    { name: "Armor",    keywords: ["ARMOR"] },
  lmdw:     { name: "LMDW",    keywords: ["LMDW", "MAISON DU WHISKY", "SOCIETE NOUVELLE DE PRODUITS ALIMENTAIRES"] },
  sdpf:     { name: "SDPF",    keywords: ["S.D.P.F", "SDPF", "PROGOURMANDS", "PRODUITS FINS"] },
};

/**
 * Detect supplier and establishment from raw PDF text.
 * Searches for keywords (case-insensitive) in the text.
 */
export function detectInvoice(rawText: string): DetectionResult {
  const upper = rawText.toUpperCase();

  let supplier: DetectedSupplier | null = null;
  for (const [slug, { name, keywords }] of Object.entries(SUPPLIER_KEYWORDS)) {
    for (const kw of keywords) {
      if (upper.includes(kw.toUpperCase())) {
        supplier = { slug, name, matchedKeyword: kw };
        break;
      }
    }
    if (supplier) break;
  }

  let etablissement: DetectedEtablissement | null = null;
  for (const [slug, { name, keywords }] of Object.entries(ETAB_KEYWORDS)) {
    for (const kw of keywords) {
      if (upper.includes(kw.toUpperCase())) {
        etablissement = { slug, name, matchedKeyword: kw };
        break;
      }
    }
    if (etablissement) break;
  }

  return { supplier, etablissement };
}

/** Map supplier slug to the parser module name used in API routes */
export function supplierSlugToRoute(slug: string): string {
  const map: Record<string, string> = {
    mael: "mael",
    metro: "metro",
    masse: "masse",
    cozigou: "cozigou",
    vinoflo: "vinoflo",
    carniato: "carniato",
    barspirits: "barspirits",
    sum: "sum",
    armor: "armor",
    lmdw: "lmdw",
    sdpf: "sdpf",
  };
  return map[slug] ?? slug;
}
