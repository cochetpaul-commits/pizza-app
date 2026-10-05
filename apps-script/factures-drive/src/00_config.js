// ============================================================================
// Configuration de la chaîne des factures iFratelli (Bello Mio / Piccola Mia)
// Tout ce qui est « réglage » vit ici : dossiers Drive, adresses, liste de
// référence initiale des fournisseurs, marqueurs d'établissement.
// Aucun appel Apps Script dans ce fichier (il est aussi chargé par les tests Node).
// ============================================================================

var CONFIG = {
  // Arborescence Drive (complément du 03/10/2026) :
  //   Factures iFratelli/
  //     Envoi Pennylane/<Établissement>/   seuls dossiers surveillés par Pennylane, à plat
  //     <Établissement>/<Fournisseur>/<Année>/   archive, plus lue par Pennylane
  //     _Hors Pennylane/<Établissement>/<Fournisseur>/<Année>/   relevés, mandats (dossier existant, gardé tel quel)
  //     À vérifier/                        douteux : OCR raté, établissement ou fournisseur inconnu, montant introuvable…
  dossierRacine: "Factures iFratelli",
  dossiers: {
    envoi: "Envoi Pennylane",
    horsPennylane: "_Hors Pennylane",         // existe déjà à la racine avec Bello Mio et Piccola Mia : utilisé tel quel
    aVerifier: "À vérifier",
    ancienAVerifier: "_À vérifier",           // ancien nom (v4.0), lu par l'alerte et l'indexation s'il existe
    transit: "Rattrapage à valider",          // rattrapageReel n'écrit JAMAIS dans Envoi Pennylane : Claude (Cowork) compare à Pennylane puis déplace
    fixtures: "_Fixtures OCR",                // PDF déposés à la main pour produire les textes de test (ocrDump)
    journauxCloture: "Journaux de clôture",   // sous Piccola Mia : journaux de caisse, pas des factures
    journauxCaisse: "Journaux de caisse iFratelli"   // dossier à part, hors « Factures iFratelli »
  },
  // Dossiers « Envoi Pennylane » déjà créés par Paul (identifiants Drive) ; repli par nom si l'identifiant ne répond plus
  envoiIds: { "Bello Mio": "180pZHqP2rRX1x281S7QXBREpc4VPROzS", "Piccola Mia": "1JCPrEpMPlVeWm9gjLZDR1bU-l38cYEH8" },
  etablissements: ["Bello Mio", "Piccola Mia"],

  // Parcours d'une facture sûre : Envoi Pennylane, puis archive après 3 jours ; alerte si encore là après 7 jours
  archiveApresJours: 3,
  envoiAlerteJours: 7,
  // Pennylane ne lit plus l'ancien rangement depuis le 03/10/2026 au soir
  dateBascule: "2026-10-03T18:00:00+02:00",

  // Journal (Google Sheet), liste de référence des fournisseurs (Google Sheet) et libellé Gmail de lecture humaine
  journalNom: "Journal factures",
  fournisseursNom: "Fournisseurs iFratelli",
  etiquetteTraite: "traite",

  // Adresses qui aboutissent toutes dans la même boîte Gmail
  adressesInternes: [
    "facture@bellomio.fr", "facture@piccolamia.fr",
    "contact@bellomio.fr", "contact@piccolamia.fr",
    "cochetpaul@bellomio.fr", "cochetpaulbellomio@gmail.com"
  ],
  // Un mail envoyé par Pierre ou Paul n'est traité que s'il est adressé à facture@
  adressesFacture: ["facture@bellomio.fr", "facture@piccolamia.fr"],
  transfertsAutorises: ["cochet"],

  // Alerte hebdomadaire
  alerteDestinataire: "cochetpaul@bellomio.fr",
  alerteAgeJours: 3,

  // Passe horaire : curseur par date (dernière passe TERMINÉE, moins une marge), sinon les 3 derniers jours ;
  // le journal des identifiants évite tout retraitement. Alerte si la dernière passe réussie date de plus de 24 h.
  fenetreHeures: 72,
  curseurMargeHeures: 24,
  passeAlerteHeures: 24,
  // Limite Apps Script : 6 min. On s'arrête à 5 et on reprend à la passe suivante.
  limiteMs: 5 * 60 * 1000,
  tailleLot: 50,

  // Pièces jointes prises en compte (PDF, XML Factur-X, photos) ; le type MIME complète l'extension (PDF sans extension)
  extensionsPieces: ["pdf", "xml", "jpg", "jpeg", "png", "heic", "heif", "gif", "tif", "tiff", "webp"],
  mimeParExtension: { pdf: "application/pdf", xml: "application/xml", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic", heif: "image/heif",
    gif: "image/gif", tif: "image/tiff", tiff: "image/tiff", webp: "image/webp" },

  // Marqueurs d'établissement lus sur le document (adresse de facturation, raison sociale, TVA, SIREN).
  // `ignorer` : phrases retirées avant la recherche (la SARL SASHA s'appelle aussi « SASHA I FRATELLI AND CO » : « fratelli » n'y désigne pas Piccola)
  marqueurs: {
    "Bello Mio":   { mots: ["sasha", "poncel", "bello mio", "bellomio"], tva: "FR78913217386", siren: "913217386" },
    "Piccola Mia": { mots: ["fratelli", "ville pepin", "piccola", "piccolamia"], tva: "FR40909382640", siren: "909382640" },
    ignorer: ["sasha i fratelli and co", "sasha i fratelli"]
  },
  // Bloc d'adresse de facturation : les marqueurs y sont cherchés d'abord (300 caractères après ces mots)
  motifsAdresseFacturation: /factur[ée]e?\s*[àa]\b|adresse\s*de\s*facturation|destinataire\s*:|client\s*:|livr[ée]e?\s*[àa]\b|bill\s*to|invoice\s*to/gi,

  // Montants : un taux de TVA n'est jamais un total ; au delà de 100 000 € c'est un capital ou un SIREN ;
  // entre 10 000 et 100 000 € un montant n'est retenu que s'il forme un triplet HT + TVA = TTC
  montantMax: 10000000,                               // en centimes
  montantMaxSansTriplet: 1000000,                     // en centimes
  tauxTva: [550, 1000, 2000, 210, 55, 196, 700],      // en centimes
  // Dates : une date de facture plus de 3 jours après le mail est une échéance ; une facture de plus de 90 jours va dans À vérifier
  dateFutureJours: 3,
  ancienneFactureJours: 90,
  // Relevé : un document qui aligne au moins 4 lignes « numéro, date, montant » avec un total est un relevé
  releveLignesMin: 4,

  // Pièces jointes images au nom générique (signatures de mail) : ignorées quelle que soit leur taille
  // (IMG_2041.jpg ou photo.jpg restent des photos de factures possibles)
  imagesGeneriques: /^(image|logo|signature|outlook|banner|banniere|facebook|instagram|linkedin|twitter|icon|icone|pastedimage|unnamed|attachment|header|footer|entete|pied)[\s_\-]*\d*$/i,
  // Catalogues, tarifs, promotions : dans l'objet ou le nom de la pièce -> journal seul, jamais À vérifier
  motifsCatalogue: /\b(tarifs?|offres?|promos?|promotions?|catalogues?|mercuriales?|newsletters?|plaquette|brochure|nouveaut[ée]s?|selection|sélection)\b/i,

  // Expéditeurs dont les pièces ne sont jamais des factures : journal seul, avec le type indiqué
  expediteursJournalSeul: {
    "docusign.net": "contrat",                 // contrats et avenants signés (Elis, JDC…)
    "docusign.com": "contrat",
    // notifications.pennylane.com : plateforme (v4.6), des factures de fournisseurs émises avec le module Pennylane y transitent
    "vinted.fr": "notification",
    "laposte.fr": "notification",
    "laposte.net": "notification",
    "jdc.fr": "notification",                  // récapitulatifs de dépannage
    "up.coop": "bon_commande"                  // bons de commande et relevés de titres Cadhoc
  },
  // Messageries de particuliers : sans SIRET, TVA ni montant, la pièce (devis, CV, réservation) va au journal seul
  domainesParticuliers: ["gmail.com", "googlemail.com", "hotmail.com", "hotmail.fr", "outlook.com", "outlook.fr", "live.com", "live.fr", "msn.com",
    "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.fr", "wanadoo.fr", "orange.fr", "free.fr", "sfr.fr", "laposte.net", "bbox.fr", "neuf.fr", "aol.com", "protonmail.com", "proton.me"],
  // Consigne, emballages, caution : un total qui vaut TTC + consigne n'est pas le montant de la facture
  motifsConsigne: /consign\w*|emballages?\s*(?:consign|factur)|caution|d[ée]p[ôo]t\s*de\s*garantie/i,
  // Soldes de compte (Self Stockage : « Solde antérieur 90,00 Nouveau solde 180,00 ») : jamais le montant de la facture
  motifsSolde: /nouveau\s*solde|solde\s*ant[ée]rieur|solde\s*pr[ée]c[ée]dent|ancien\s*solde|report\s*(?:de\s*|du\s*)?solde|solde\s*(?:de\s*)?compte|cumul/gi,

  // Plateformes de facturation : le domaine de l'expéditeur n'est PAS le fournisseur (Crédit Mutuel facture.cmb.fr : BR Nuisibles,
  // Lucangeli ; Esker : Elis, Sysco ; Indy : Alain Pedron ; Mon Expert en Gestion : Le Père Billard ; module de facturation Pennylane).
  // Pour ces expéditeurs : jamais de ligne « à compléter », le fournisseur doit être lu dans le document (identifiant ou nom), sinon À vérifier.
  domainesPlateformes: ["facture.cmb.fr", "cmb.fr", "esker.com", "indy.fr", "via.indy.fr", "mon-expert-en-gestion.fr", "monexpertengestion.fr", "notifications.pennylane.com"],

  // OCR Drive : nouvel essai après 2 s, 5 s, 15 s sur « User rate limit exceeded » ; pause entre deux OCR en rattrapage ;
  // autre erreur passagère : un nouvel essai après 2 s, puis la pièce est « texte illisible » avec l'erreur dans le journal
  ocrAttentesMs: [2000, 5000, 15000],
  ocrPauseRattrapageMs: 1000,
  ocrAttenteErreurMs: 2000,

  // Anciens dossiers « fourre-tout » de l'archive : leur contenu est reclassé d'après le PDF (reorganiserArchive)
  dossiersFourreTout: ["Facture", "Factures", "Invoicing", "Invoice", "Transfert Pierre", "Yahoo", "Wanadoo", "Gmail", "Mail", "Indy", "Bellomio", "Bello Mio",
    "Piccola Mia", "Piccolamia", "A-TRIER", "Divers", "Autres", "2026", "Receipt", "Cm", "Via", "Orange", "Agence"],

  // Liste de référence INITIALE des fournisseurs : sert à générer le Google Sheet « Fournisseurs iFratelli »
  // (genererListeFournisseurs) et aux tests. En production, c'est le Sheet qui fait foi.
  //   nom : nom propre affiché (dossier d'archive, nom de fichier)
  //   variantes : anciens noms de dossiers et noms lus sur les factures
  //   domaines : domaines des adresses d'envoi
  //   identifiants : SIRET, SIREN ou TVA intracommunautaire lus sur les factures
  //   etab : "Bello", "Piccola" ou "Les deux"
  fournisseursReference: [
    { nom: "Maël Distribution", variantes: ["Maeldistribution", "Mael Distribution", "Mael", "SAS MAEL"], domaines: ["maeldistribution.fr", "maeldistribution.com", "mael.fr"], identifiants: ["FR36828779454", "82877945400036"], etab: "Les deux" },
    { nom: "Carniato", variantes: ["Carniato Europe"], domaines: ["carniato.com"], identifiants: ["FR14340783828", "34078382800015"], etab: "Les deux" },
    { nom: "Cheville 35", variantes: ["Maison Hardy", "Maisonhardy", "Hardy", "Cheville"], domaines: ["vif.fr", "maison-hardy.fr"], identifiants: ["FR38829192319", "82919231900020"], etab: "Bello" },
    { nom: "TerreAzur", variantes: ["Terre Azur", "Pomona", "TA Bretagne"], domaines: ["groupe-pomona.fr", "terreazur.fr"], identifiants: ["FR56552044992", "55204499202861"], etab: "Les deux" },
    { nom: "Elis", variantes: ["Esker", "Elis Bretagne", "Les Lavandières"], domaines: ["elis.com", "elis.fr"], identifiants: ["FR65062201009", "06220100900388"], etab: "Les deux" },   // via Esker (plateforme) : reconnu par son identifiant
    { nom: "Hyg'Up", variantes: ["Hyg-up", "Hyg Up", "Hygup", "TLD PRO"], domaines: ["hygup.fr", "hyg-up.fr", "hyg-up.com"], identifiants: ["FR16911617124", "91161712400019"], etab: "Les deux" },
    { nom: "Leroy Merlin", variantes: ["Leroymerlin"], domaines: ["leroymerlin.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Prophyl", variantes: [], domaines: ["prophyl.fr"], identifiants: ["FR48451251128"], etab: "Bello" },
    { nom: "Lequertier", variantes: ["Lequertiersa", "ELJ", "Lequertier SA"], domaines: ["lequertiersa.fr", "lequertier.fr"], identifiants: [], etab: "Bello" },
    { nom: "Armor Emballages", variantes: ["Armor-emballages"], domaines: ["armor-emballages.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Emulsion", variantes: ["Emulsion Boulangerie"], domaines: ["emulsion.boulangerie@gmail.com"], identifiants: [], etab: "Bello" },
    { nom: "Metro", variantes: ["Metro-gsc", "Metro GSC", "METRO Cash & Carry"], domaines: ["metro.fr", "metro-gsc.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Sysco", variantes: [], domaines: ["sysco.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Masse", variantes: [], domaines: ["masse.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Bar Spirits", variantes: ["Barspirits"], domaines: ["barspirits.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Vinoflo", variantes: [], domaines: ["vinoflo.fr", "vinoflo.com"], identifiants: [], etab: "Les deux" },
    { nom: "Cozigou", variantes: ["SAS COZIGOU COTE D'EMERAUDE"], domaines: ["cozigou.fr", "cozigou.bzh"], identifiants: ["FR81950026212", "950026212"], etab: "Les deux" },
    { nom: "SDPF", variantes: ["Progourmands", "S.D.P.F."], domaines: ["sdpf.fr", "progourmands.fr", "sdpfcompta@hotmail.com"], identifiants: ["FR08433943305", "43394330500022"], etab: "Les deux" },   // écrit depuis hotmail : adresse complète
    { nom: "Elien", variantes: [], domaines: ["elien.fr"], identifiants: [], etab: "Bello" },
    { nom: "LMDW", variantes: ["La Maison du Whisky"], domaines: ["lmdw.fr", "lmdw.com"], identifiants: [], etab: "Les deux" },
    { nom: "Pennylane", variantes: [], domaines: ["headsup.pennylane.com", "pennylane.com"], identifiants: [], etab: "Les deux" },
    { nom: "Mailjet", variantes: ["Sinch"], domaines: ["mailjet.com", "sinch.com"], identifiants: [], etab: "Bello" },
    { nom: "GGM Gastro", variantes: ["Ggmgastro"], domaines: ["ggmgastro.com"], identifiants: [], etab: "Les deux" },
    { nom: "Alain Pedron Nettoyage", variantes: ["Apactionproprete", "AP Action Propreté"], domaines: ["apactionproprete.fr"], identifiants: [], etab: "Bello" },
    { nom: "Free Pro", variantes: ["Freepro"], domaines: ["freepro.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Disgroup BVF", variantes: ["VF Entreprise", "Vf-entreprise"], domaines: ["vf-entreprise.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Crédit Agricole", variantes: ["Credit Agricole", "CA Ille-et-Vilaine"], domaines: ["ca-illeetvilaine.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Interaction Intérim", variantes: ["Interaction Interim", "Interaction-interim"], domaines: ["interaction-interim.com"], identifiants: [], etab: "Les deux" },
    { nom: "Combo", variantes: ["Combohr", "Combo HR"], domaines: ["combohr.com", "combo.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Anthropic", variantes: [], domaines: ["anthropic.com", "mail.anthropic.com"], identifiants: [], etab: "Bello" },
    { nom: "Zenchef", variantes: [], domaines: ["zenchef.com"], identifiants: [], etab: "Les deux" },
    { nom: "Alma", variantes: ["Getalma"], domaines: ["getalma.eu"], identifiants: [], etab: "Les deux" },
    { nom: "Alan", variantes: ["Alan Insurance"], domaines: ["alan.eu", "alan.com"], identifiants: [], etab: "Les deux" },
    { nom: "Daniel Marquet", variantes: ["EFC Marquet", "EFCMarquet", "Efc-marquet", "Danielmarquet"], domaines: ["efc-marquet.fr", "efcmarquet.fr"], identifiants: [], etab: "Bello" },
    { nom: "Beezign", variantes: [], domaines: ["beezign.com", "beezign.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Jehanno", variantes: [], domaines: ["jehanno.fr"], identifiants: [], etab: "Bello" },
    { nom: "Cafés Celtik", variantes: ["Cafes-celtik", "Cafes Celtik"], domaines: ["cafes-celtik.fr", "cafes-celtik.com"], identifiants: [], etab: "Les deux" },
    { nom: "Engie", variantes: [], domaines: ["engie.fr", "engie.com"], identifiants: [], etab: "Les deux" },
    { nom: "Axenergie", variantes: [], domaines: ["axenergie.fr"], identifiants: [], etab: "Bello" },
    { nom: "Generali", variantes: ["Generali-Assurance", "Generali Assurance"], domaines: ["generali.fr", "generali.com"], identifiants: [], etab: "Les deux" },
    { nom: "Hiboutik", variantes: [], domaines: ["hiboutik.com"], identifiants: [], etab: "Piccola" },
    { nom: "Bureau Vallée", variantes: ["Bureau-vallee", "Bureau Vallee"], domaines: ["bureau-vallee.fr"], identifiants: [], etab: "Les deux" },
    { nom: "UP Coop", variantes: ["UP-COOP", "Up"], domaines: ["up.coop", "up-coop.fr"], identifiants: [], etab: "Bello" },
    { nom: "Thermifroid", variantes: [], domaines: ["thermifroid.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Orange", variantes: [], domaines: ["orange.com"], identifiants: [], etab: "Les deux" },   // orange.fr seul = messagerie grand public, jamais
    { nom: "Apple", variantes: [], domaines: ["apple.com", "email.apple.com"], identifiants: [], etab: "Bello" },
    { nom: "PayByPhone", variantes: [], domaines: ["paybyphone.fr", "paybyphone.com"], identifiants: [], etab: "Bello" },
    { nom: "Maison Dreux", variantes: ["Maison-Dreux"], domaines: ["maison-dreux.fr", "maisondreux.fr"], identifiants: [], etab: "Bello" },
    { nom: "Ubefone", variantes: [], domaines: ["ubefone.com"], identifiants: [], etab: "Bello" },
    { nom: "Verisure", variantes: [], domaines: ["verisure.fr", "verisure.com"], identifiants: [], etab: "Les deux" },
    { nom: "Bimpli", variantes: [], domaines: ["bimpli.com", "bimpli.fr"], identifiants: [], etab: "Les deux" },
    { nom: "SC M2", variantes: ["SC-M2", "Sc-m2", "SCM2"], domaines: ["sc-m2.fr"], identifiants: [], etab: "Les deux" },
    { nom: "Mon Expert en Gestion", variantes: ["Mon-expert-en-gestion", "MEG"], domaines: [], identifiants: [], etab: "Les deux", actif: "non", remarque: "plateforme de facturation (Le Père Billard…)" },
    { nom: "Le Père Billard", variantes: ["Corsaire Marée", "Pere Billard", "SARL LE PERE BILLARD"], domaines: ["leperebillard.com"], identifiants: ["87790529900013", "FR39877905299"], etab: "Bello" },
    { nom: "BR Nuisibles", variantes: ["Bource Richard", "BR Nuisibles Bource Richard"], domaines: [], identifiants: ["94776172200018", "FR32947761722"], etab: "Bello" },
    { nom: "Self Stockage", variantes: ["Selfstockage", "Self Stockage SAS"], domaines: [], identifiants: ["FR53922735535", "922735535"], etab: "Bello" },   // écrit depuis une adresse wanadoo.fr : mettre l'adresse complète dans le Sheet
    { nom: "Distrimalo", variantes: [], domaines: ["distrimalo.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Buffet Plus", variantes: ["Buffetplus"], domaines: ["buffetplus.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Flamigni", variantes: [], domaines: ["flamigni.it", "flamigni.com"], identifiants: [], etab: "Piccola" },
    { nom: "La Via del Te", variantes: ["Laviadelte"], domaines: ["laviadelte.it", "laviadelte.com"], identifiants: [], etab: "Piccola" },
    { nom: "Labovida", variantes: [], domaines: ["labovida.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Lucangeli", variantes: [], domaines: ["lucangeli.it"], identifiants: [], etab: "Piccola" },
    { nom: "Vinoegusto", variantes: ["Vino e Gusto"], domaines: ["vinoegusto.fr", "vinoegusto.it"], identifiants: [], etab: "Piccola" },
    { nom: "Mon Emballage", variantes: ["Mon-emballage", "Monemballage"], domaines: ["mon-emballage.com", "monemballage.com"], identifiants: [], etab: "Piccola" },
    { nom: "Papiers Service", variantes: ["Papiers-service"], domaines: ["papiers-service.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Gastrotiger", variantes: [], domaines: ["gastrotiger.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Deuba24", variantes: ["Deuba"], domaines: ["deuba24.fr", "deuba.de"], identifiants: [], etab: "Piccola" },
    { nom: "SUM Online", variantes: ["Sum", "Sumonline"], domaines: ["sum-online.fr", "sumonline.fr"], identifiants: [], etab: "Piccola" },
    { nom: "EDF", variantes: [], domaines: ["edf.fr", "edf.com"], identifiants: [], etab: "Piccola" },
    { nom: "Groupe GCA", variantes: ["GCA"], domaines: ["groupe-gca.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Inforegistre", variantes: [], domaines: ["inforegistre.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Restoflash", variantes: [], domaines: ["restoflash.fr"], identifiants: [], etab: "Piccola" },
    { nom: "PST35", variantes: ["PST 35"], domaines: ["pst35.fr"], identifiants: [], etab: "Piccola" },
    { nom: "RME", variantes: [], domaines: ["rme.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Storycie", variantes: [], domaines: ["storycie.fr"], identifiants: [], etab: "Piccola" },
    { nom: "APR35", variantes: ["APR 35"], domaines: ["apr35.fr"], identifiants: [], etab: "Piccola" },
    { nom: "AME Hasle", variantes: ["AME-Hasle"], domaines: ["ame-hasle.fr"], identifiants: [], etab: "Piccola" },
    { nom: "Pack Prélèvements", variantes: ["Pack Prelevements"], domaines: [], identifiants: [], etab: "Piccola" }
  ],

  // Sous-domaines sans valeur pour proposer un nom à un fournisseur inconnu ("facture@mail.sumup.com" -> "sumup")
  sousDomainesGeneriques: ["mail", "email", "e-mail", "mailer", "mailing", "mg", "em", "m", "e", "send", "smtp", "bounce", "bounces",
    "news", "newsletter", "facture", "factures", "facturation", "invoice", "invoices", "invoicing", "billing", "receipt", "receipts",
    "paiement", "payment", "noreply", "no-reply", "notification", "notifications", "info", "contact", "compta", "comptabilite",
    "service", "services", "www", "cm", "via", "order", "orders", "shop", "store", "app", "apps", "account", "accounts", "customer",
    "client", "clients", "support", "team", "hello"]
};

var MOIS_FR_NOMS = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

function obtenirNomMois(index) { return MOIS_FR_NOMS[index]; }

/** "10 - Octobre 2026" à partir d'une Date (ancien rangement par mois, encore lu par la réorganisation) */
function nomDossierMois(date) {
  return ("0" + (date.getMonth() + 1)).slice(-2) + " - " + obtenirNomMois(date.getMonth()) + " " + date.getFullYear();
}
