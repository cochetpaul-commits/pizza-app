// ============================================================================
// Configuration de la chaîne des factures iFratelli (Bello Mio / Piccola Mia)
// Tout ce qui est « réglage » vit ici : dossiers Drive, adresses, tables de
// fournisseurs, marqueurs d'établissement. Aucun appel Apps Script dans ce fichier
// (il est aussi chargé par les tests Node).
// ============================================================================

var CONFIG = {
  // Arborescence Drive. Pennylane synchronise « Bello Mio » et « Piccola Mia » :
  // tout ce qui y entre devient une pièce comptable.
  dossierRacine: "Factures iFratelli",
  dossiers: {
    horsPennylane: "_Hors Pennylane",   // relevés, mandats : jamais synchronisés
    aVerifier: "_À vérifier",           // douteux : OCR raté, établissement inconnu, montant introuvable…
    fixtures: "_Fixtures OCR"           // PDF déposés à la main pour produire les textes de test (ocrDump)
  },
  etablissements: ["Bello Mio", "Piccola Mia"],

  // Journal (Google Sheet) et libellé Gmail de lecture humaine
  journalNom: "Journal factures",
  etiquetteTraite: "traite",

  // Adresses qui aboutissent toutes dans la même boîte Gmail
  adressesInternes: [
    "facture@bellomio.fr", "facture@piccolamia.fr",
    "contact@bellomio.fr", "contact@piccolamia.fr",
    "cochetpaul@bellomio.fr", "cochetpaulbellomio@gmail.com"
  ],
  // Adresses de transfert : un mail envoyé par Pierre ou Paul n'est traité que s'il est adressé à facture@
  adressesFacture: ["facture@bellomio.fr", "facture@piccolamia.fr"],
  transfertsAutorises: ["cochet"],

  // Alerte hebdomadaire sur « _À vérifier »
  alerteDestinataire: "cochetpaul@bellomio.fr",
  alerteAgeJours: 3,

  // Passe horaire : on relit les messages des 3 derniers jours, le journal des
  // identifiants évite tout retraitement
  fenetreHeures: 72,
  // Limite Apps Script : 6 min. On s'arrête à 5 et on reprend à la passe suivante.
  limiteMs: 5 * 60 * 1000,
  tailleLot: 50,

  // Pièces jointes prises en compte (PDF, XML Factur-X, photos)
  extensionsPieces: ["pdf", "xml", "jpg", "jpeg", "png", "heic", "heif", "gif", "tif", "tiff", "webp"],

  // Marqueurs d'établissement lus sur le document (adresse de facturation, raison sociale, TVA, SIREN)
  marqueurs: {
    "Bello Mio":   { mots: ["sasha", "poncel", "bello mio", "bellomio"], tva: "FR78913217386", siren: "913217386" },
    "Piccola Mia": { mots: ["fratelli", "ville pepin", "piccola", "piccolamia"], tva: "FR40909382640", siren: "909382640" }
  },

  // Montants : un taux de TVA n'est jamais un total ; au delà de 100 000 € c'est un capital ou un SIREN
  montantMax: 10000000,                               // en centimes
  tauxTva: [550, 1000, 2000, 210, 55, 196, 700],      // en centimes

  // Fournisseur par morceau d'adresse ou d'objet (table historique, l'ordre compte)
  fournisseurs: {
    "carniato.com": "Carniato",
    "cheville": "Cheville 35",
    "hardy": "Cheville 35",
    "maisonhardy": "Cheville 35",
    "vif.fr": "Cheville 35",
    "groupe-pomona.fr": "TerreAzur",
    "terreazur": "TerreAzur",
    "armor-emballages.fr": "Armor Emballages",
    "emulsion": "Emulsion",
    "lequertiersa.fr": "Lequertier",
    "lequertier": "Lequertier",
    "elj": "Lequertier",
    "metro.fr": "Metro",
    "sysco.fr": "Sysco",
    "maeldistribution": "Maeldistribution",
    "mael.fr": "Maeldistribution",
    "masse.fr": "Masse",
    "barspirits": "Bar Spirits",
    "vinoflo": "Vinoflo",
    "cozigou": "Cozigou",
    "sdpf": "SDPF",
    "elien": "Elien",
    "lmdw": "LMDW",
    "headsup.pennylane.com": "Pennylane",
    "mailjet.com": "Mailjet",
    "sinch": "Mailjet",
    "ggmgastro.com": "GGM Gastro",
    "apactionproprete": "Alain Pedron Nettoyage",
    "freepro.fr": "Free Pro",
    "vf-entreprise.fr": "Disgroup BVF",
    "ca-illeetvilaine.fr": "Credit Agricole",
    "interaction-interim.com": "Interaction Interim",
    "combohr": "Combo",
    "combo.fr": "Combo",
    "anthropic.com": "Anthropic",
    "zenchef.com": "Zenchef",
    "getalma.eu": "Alma",
    "alan.eu": "Alan",
    "alan.com": "Alan",
    "elis": "Elis",
    "efc-marquet": "Daniel Marquet",
    "efcmarquet": "Daniel Marquet",
    "danielmarquet": "Daniel Marquet",
    "hygup": "Hyg-up",
    "hyg-up": "Hyg-up",
    "leroymerlin": "Leroymerlin",
    "leroy merlin": "Leroymerlin",
    "beezign": "Beezign",
    "prophyl": "Prophyl"
  },

  // Fournisseur par numéro de TVA intracommunautaire ou SIREN lu sur le document.
  // Les noms sont ceux des dossiers Drive existants (ne pas les changer : Pennylane les a déjà importés).
  fournisseursParTva: {
    "FR36828779454": "Maeldistribution",   // SAS MAEL
    "FR14340783828": "Carniato",
    "FR65062201009": "Elis",
    "FR38829192319": "Cheville 35",
    "FR56552044992": "TerreAzur",          // Pomona
    "FR16911617124": "Hyg-up",
    "FR48451251128": "Prophyl"
  },

  // Sous-domaines sans valeur pour nommer un fournisseur ("facture@mail.sumup.com" -> "Sumup")
  sousDomainesGeneriques: ["mail", "email", "e-mail", "mailer", "mailing", "mg", "em", "m", "e", "send", "smtp", "bounce", "bounces",
    "news", "newsletter", "facture", "factures", "facturation", "invoice", "invoices", "invoicing", "billing", "receipt", "receipts",
    "paiement", "payment", "noreply", "no-reply", "notification", "notifications", "info", "contact", "compta", "comptabilite",
    "service", "services", "www", "cm", "via", "order", "orders", "shop", "store", "app", "apps", "account", "accounts", "customer",
    "client", "clients", "support", "team", "hello"]
};

var MOIS_FR_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function obtenirNomMois(index) { return MOIS_FR_NOMS[index]; }

/** "10 - Octobre 2026" à partir d'une Date */
function nomDossierMois(date) {
  return ("0" + (date.getMonth() + 1)).slice(-2) + " - " + obtenirNomMois(date.getMonth()) + " " + date.getFullYear();
}
