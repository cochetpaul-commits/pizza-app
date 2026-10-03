// ============================================================================
// Extraction : fonctions PURES (texte en entrée, résultat en sortie).
// Aucun appel Gmail/Drive ici : ce fichier est testé en local avec Node
// (tests/extraction.test.js) sur les textes de tests/fixtures.
// ============================================================================

var MOIS_FR = { janv: 1, jan: 1, fevr: 2, fev: 2, feb: 2, mars: 3, mar: 3, avr: 4, apr: 4, mai: 5, may: 5, juin: 6, jun: 6,
                juil: 7, jul: 7, aout: 8, aug: 8, sept: 9, sep: 9, oct: 10, nov: 11, dec: 12 };

function sansAccents(s) { return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, ""); }

/** Texte normalisé pour les recherches : sans accents, minuscules, espaces insécables remplacés */
function normaliser(texte) { return sansAccents(String(texte || "").replace(/ /g, " ")).toLowerCase(); }

// ---------------------------------------------------------------- Montant

/** Tous les montants « 1 234,56 » / « 12.30 » / « -4,92 » / « 148,12- » d'un texte : [{ c: centimes signés, pos }] */
function listerMontants(s) {
  var re = /(- ?)?(?<![\d.,])(?!0\d)(\d{1,3}(?:[ .]\d{3})+|\d+)[,.](\d{2})(?![\d%])( ?-(?! ?\d))?/g, a, out = [];
  while ((a = re.exec(s)) !== null) {
    var c = parseInt(a[2].replace(/[ .]/g, ""), 10) * 100 + parseInt(a[3], 10);
    if (a[1] || a[4]) c = -c;
    if (Math.abs(c) < CONFIG.montantMax) out.push({ c: c, pos: a.index });
  }
  return out;
}

/** Vrai si c = a + b avec b qui ressemble à une TVA de a (2 % à 25 %), signes cohérents */
function tripletCoherent(a, b, c) {
  if (a + b !== c || a === 0) return false;
  var r = b / a;
  return r >= 0.02 && r <= 0.25;
}

var PROXIMITE_TOTAUX = 400;   // HT, TVA et TTC sont écrits dans le même bloc de totaux (en caractères)

/**
 * Total TTC en euros ("861.81", "-4.92") ou null.
 * 1) le plus grand montant (en valeur absolue, avoirs compris) qui vaut HT + TVA, les deux autres
 *    montants étant écrits à moins de 400 caractères (le bloc des totaux) ;
 * 2) sinon le plus grand montant dans les 150 caractères qui suivent un mot clé de total
 *    (net à payer, total TTC, total global…).
 * Les taux de TVA (5,50 / 20,00…) ne sont jamais des totaux ; au delà de 100 000 € non plus
 * (capital social, SIREN).
 */
function trouverMontantTTC(texte) {
  if (!texte) return null;
  var t = texte.replace(/ /g, " ");
  var pasUnTaux = function(m) { return CONFIG.tauxTva.indexOf(Math.abs(m.c)) === -1; };
  var tous = listerMontants(t).filter(pasUnTaux);
  var estSomme = function(m) {
    for (var x = 0; x < tous.length; x++) {
      if (Math.abs(tous[x].pos - m.pos) > PROXIMITE_TOTAUX) continue;
      for (var y = 0; y < tous.length; y++) {
        if (x === y || Math.abs(tous[y].pos - m.pos) > PROXIMITE_TOTAUX) continue;
        if (tripletCoherent(tous[x].c, tous[y].c, m.c)) return true;
      }
    }
    return false;
  };
  var plusGrand = function(liste) { return liste.reduce(function(p, m) { return Math.abs(m.c) > Math.abs(p.c) ? m : p; }); };
  // 1) HT + TVA = TTC dans le bloc des totaux
  var coherents = tous.filter(estSomme);
  if (coherents.length) return (plusGrand(coherents).c / 100).toFixed(2);
  // 2) plus grand montant après un mot clé
  var cles = [/net\s*[àa]\s*payer/gi, /total\s*t\.?\s*t\.?\s*c\.?/gi, /montant\s*t\.?\s*t\.?\s*c\.?/gi,
              /total\s*[àa]\s*payer/gi, /montant\s*d[ûu]/gi, /total\s*due|amount\s*due/gi, /grand\s*total/gi, /total\s*[àa]\s*r[ée]gler/gi,
              /montant\s*(?:[àa]|a)\s*payer/gi, /montant\s*de\s*la\s*facture/gi, /montant\s*total/gi, /total\s*\(eur\)/gi, /total\s*global/gi];
  var cand = [];
  for (var i = 0; i < cles.length; i++) {
    var re = cles[i], m;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) cand = cand.concat(listerMontants(t.substr(m.index + m[0].length, 150)).filter(pasUnTaux));
  }
  if (cand.length) return (plusGrand(cand).c / 100).toFixed(2);
  return null;
}

// ---------------------------------------------------------------- Numéro

var MOTIF_NUM = "(?=[A-Z0-9\\-\\/_.]*\\d)([A-Z0-9][A-Z0-9\\-\\/_.]{2,})";

function nettoyerNumero(n) { return n.replace(/[\/\\]/g, "-").replace(/[.\-_]+$/, ""); }

function trouverNumeroFacture(texte) {
  if (!texte) return null;
  var t = texte.replace(/ /g, " ");
  var motifs = [
    new RegExp("(?:facture|invoice|avoir)\\s*(?:n\\s*[°o]\\.?|num[ée]ro|number|no\\.?|#)\\s*:?\\s*#?\\s*[—–-]?\\s*" + MOTIF_NUM, "i"),
    new RegExp("(?:n\\s*[°o]\\.?|num[ée]ro)\\s*(?:de\\s*)?(?:facture|avoir)\\s*:?\\s*" + MOTIF_NUM, "i"),
    new RegExp("num[ée]ro\\s*:?\\s*" + MOTIF_NUM, "i"),
    new RegExp("n\\s*[°o]\\s*pi[èe]ce[\\s\\S]{0,80}?\\b(\\d{6,})\\b", "i"),
    new RegExp("\\b(?:facture|avoir)\\s*:?\\s*(?=[A-Z]{0,6}[-_\\/]?\\d)" + MOTIF_NUM, "i")
  ];
  for (var i = 0; i < motifs.length; i++) {
    var m = t.match(motifs[i]);
    if (m) return nettoyerNumero(m[1]);
  }
  // Repli : en-tête « N° facture » suivi d'un tableau (Elis) -> le jeton le plus riche en chiffres des 160 caractères suivants
  var h = t.match(/n\s*[°o]\.?\s*(?:de\s*)?facture\b/i);
  if (h) {
    var fen = t.substr(h.index + h[0].length, 160), jetons = fen.match(/[A-Z0-9][A-Z0-9\-_.]{3,}/gi) || [], meilleur = null, score = 0;
    for (var j = 0; j < jetons.length; j++) {
      var jeton = jetons[j], chiffres = (jeton.match(/\d/g) || []).length;
      if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(jeton)) continue;           // une date
      if (chiffres >= 5 && chiffres > score) { score = chiffres; meilleur = jeton; }
    }
    if (meilleur) return nettoyerNumero(meilleur);
  }
  return null;
}

/** Numéro d'un relevé : la pièce ou la LCR (« Pièce 14054490 », « L.C.R. 14054490 »), pas le numéro de client */
function trouverNumeroReleve(texte) {
  if (!texte) return null;
  var t = texte.replace(/ /g, " ");
  var m = t.match(/\bl\.?\s?c\.?\s?r\.?\s*(?:n\s*[°o]\.?)?\s*(\d{6,})/i) || t.match(/pi[èe]ce\s*(?:n\s*[°o]\.?)?\s*:?\s*(\d{6,})/i) || t.match(/relev[ée][^\d]{0,40}(\d{6,})/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- Date

function lireDate(s) {
  // « 30/09/202631/10/2026 » (deux dates collées par l'OCR) -> on sépare
  s = s.replace(/(\d{4})(\d{2}[\/.\-]\d{2}[\/.\-]\d{4})/g, "$1 $2");
  var a = s.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})(?!\d)/);
  var b = s.match(/(\d{1,2})\s+([a-z]{3,9})\.?\s+(\d{4})/i);
  var c = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  var cand = [];
  if (a) cand.push({ i: a.index, j: +a[1], m: +a[2], y: a[3].length === 2 ? 2000 + +a[3] : +a[3] });
  if (b) { var k = b[2].toLowerCase(), mm = MOIS_FR[k] || MOIS_FR[k.slice(0, 4)] || MOIS_FR[k.slice(0, 3)];
           if (mm) cand.push({ i: b.index, j: +b[1], m: mm, y: +b[3] }); }
  if (c) cand.push({ i: c.index, j: +c[3], m: +c[2], y: +c[1] });
  cand.sort(function(x, y) { return x.i - y.i; });
  for (var n = 0; n < cand.length; n++) {
    var d = cand[n];
    if (d.m >= 1 && d.m <= 12 && d.j >= 1 && d.j <= 31 && d.y >= 2015 && d.y <= 2100)
      return d.y + "-" + ("0" + d.m).slice(-2) + "-" + ("0" + d.j).slice(-2);
  }
  return null;
}

/** Date de la facture (AAAA-MM-JJ) lue après un mot clé, ou null (le mail donne alors la date de secours) */
function trouverDateFacture(texte) {
  if (!texte) return null;
  var t = sansAccents(texte.replace(/ /g, " "));
  var cles = /date\s*(?:de\s*(?:la\s*)?)?(?:facture|facturation|d['’]?\s*emission|emission)|en\s*date\s*du|invoice\s*date|issue\s*date|date\s*:|date\s+ech[ée]ance|facture\s*n?\s*[°o]?\.?\s*[A-Z0-9\-\/]*\s+du\b|date\s+client\s+page|date\s+contrem/gi;
  var m;
  while ((m = cles.exec(t)) !== null) {
    var d = lireDate(t.substr(m.index + m[0].length, 90));
    if (d) return d;
  }
  // Tickets de caisse : « 02/10/2026 18:12 »
  var tk = t.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/);
  if (tk) return lireDate(tk[1]);
  // Dernier recours : la première date qui suit un mot « date » isolé (en-tête de tableau)
  var large = /\bdate\b/gi;
  while ((m = large.exec(t)) !== null) {
    var d2 = lireDate(t.substr(m.index + m[0].length, 120));
    if (d2) return d2;
  }
  return null;
}

// ---------------------------------------------------------------- Établissement

/**
 * Établissement destinataire lu sur le document : "Bello Mio", "Piccola Mia" ou null (inconnu / contradictoire).
 * Un numéro de TVA ou un SIREN est une preuve forte ; les mots (SASHA, place du Poncel, FRATELLI, rue Ville Pépin) ensuite.
 */
function detecterEtablissement(texte) {
  if (!texte) return null;
  var t = normaliser(texte), compact = t.replace(/[\s.]/g, "");
  var fort = [], faible = [];
  CONFIG.etablissements.forEach(function(etab) {
    var mq = CONFIG.marqueurs[etab];
    if (compact.indexOf(mq.tva.toLowerCase()) !== -1 || compact.indexOf(mq.siren) !== -1) fort.push(etab);
    for (var i = 0; i < mq.mots.length; i++) if (t.indexOf(mq.mots[i]) !== -1) { faible.push(etab); break; }
  });
  if (fort.length === 1) return fort[0];
  if (fort.length === 0 && faible.length === 1) return faible[0];
  return null;
}

// ---------------------------------------------------------------- Type de document

/**
 * Type : facture, avoir, ticket, releve, mandat, devis, bon_commande, attestation, autre.
 * `montant` (chaîne "-4.92") permet de reconnaître un avoir sans le mot « avoir » (Maël).
 */
function detecterTypeDocument(texte, montant) {
  if (!texte) return "autre";
  var t = normaliser(texte);
  var signauxFacture = /facture\s*n|n\s*[°o]\.?\s*(?:de\s*)?facture|n\s*[°o]\s*piece|total\s*t\.?\s*t\.?\s*c|net\s*a\s*payer|total\s*a\s*payer|invoice\s*(?:n|number|#)/.test(t);
  if (/releve\s*(?:client|de\s*compte|de\s*lcr|lcr)|grand\s*livre|\bl\.?c\.?r\.?\s*\d{6,}/.test(t)) return "releve";
  if (/mandat\s*(?:de\s*prelevement\s*)?sepa|autorisation\s*de\s*prelevement|reference\s*unique\s*d[eu]\s*mandat|\brum\s*:/.test(t)) return "mandat";
  var numeroFacture = /facture\s*n\s*[°o]|n\s*[°o]\.?\s*(?:de\s*)?facture|invoice\s*(?:n|number|#)/.test(t);
  if (/attestation\s+(?:de|d['’])\s*(?:depot|vigilance|regularite|conformite|dsn|assurance|paiement|versement)|declaration\s*sociale\s*nominative|\bdsn\b/.test(t) && !signauxFacture) return "attestation";
  // Un devis affiche un total TTC : seul un vrai numéro de facture l'emporte
  if (/\bdevis\s*(?:n\s*[°o]|num|:)|ce\s*devis|validite\s*(?:du\s*)?devis|bon\s*pour\s*accord|pro\s*-?\s*forma/.test(t) && !numeroFacture) return "devis";
  if (/\bdevis\b/.test(t) && !signauxFacture) return "devis";
  if (/bon\s*de\s*commande|confirmation\s*de\s*commande|purchase\s*order|accuse\s*de\s*reception\s*de\s*commande/.test(t) && !signauxFacture) return "bon_commande";
  // « Avoir de prix » dans une légende (Cheville 35) n'est pas un avoir : il faut un en-tête ou un numéro d'avoir
  if (/(?:^|\n)\s*avoir\b|avoir\s*n\s*[°o]|facture\s*d['’]\s*avoir|credit\s*note|note\s*de\s*credit/.test(t) && !numeroFacture) return "avoir";
  if (/ticket\s*(?:client|de\s*caisse)|carte\s*bancaire\s*sans\s*contact|a\s*conserver\b/.test(t) && !signauxFacture) return "ticket";
  if (signauxFacture || /\bfacture\b|\binvoice\b|\brecu\b|\breceipt\b/.test(t)) {
    if (montant && parseFloat(montant) < 0) return "avoir";
    return "facture";
  }
  if (/tarif|promotion|catalogue|newsletter/.test(t)) return "autre";
  return "autre";
}

// ---------------------------------------------------------------- Fournisseur

/** Numéros de TVA intracommunautaire FR présents dans le texte (sans espaces), hors ceux de nos deux sociétés */
function listerTvaFournisseur(texte) {
  var t = String(texte || "").replace(/ /g, " "), re = /\bFR\s?\d{2}(?:\s?\d{3}){3}\b/gi, m, out = [], notres = [];
  CONFIG.etablissements.forEach(function(e) { notres.push(CONFIG.marqueurs[e].tva); });
  while ((m = re.exec(t)) !== null) {
    var tva = m[0].replace(/\s/g, "").toUpperCase();
    if (notres.indexOf(tva) === -1 && out.indexOf(tva) === -1) out.push(tva);
  }
  return out;
}

/** Nom tiré du domaine de l'expéditeur, en sautant les sous-domaines génériques : "facture@mail.sumup.com" -> "Sumup" */
function fournisseurParDomaine(from) {
  var dm = String(from || "").match(/@([^>\s]+)/);
  if (!dm) return null;
  var parts = dm[1].toLowerCase().split(".");
  if (/^\d+$/.test(parts[0])) return null;
  var nom = parts[parts.length - 2] || parts[0];
  for (var k = 0; k < parts.length - 1; k++) {
    if (CONFIG.sousDomainesGeneriques.indexOf(parts[k]) === -1) { nom = parts[k]; break; }
  }
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/**
 * Fournisseur : 1) table de correspondance sur l'expéditeur et l'objet, 2) TVA/SIREN lu sur le document,
 * 3) domaine de l'expéditeur, 4) "Transfert Pierre" pour un transfert interne non reconnu, sinon "Divers".
 * Renvoie { nom, source }.
 */
function extraireFournisseur(from, subject, texte) {
  var f = String(from || "").toLowerCase(), s = String(subject || "").toLowerCase();
  for (var cle in CONFIG.fournisseurs) {
    if (f.indexOf(cle) !== -1 || s.indexOf(cle) !== -1) return { nom: CONFIG.fournisseurs[cle], source: "table" };
  }
  var tvas = listerTvaFournisseur(texte);
  for (var i = 0; i < tvas.length; i++) {
    if (CONFIG.fournisseursParTva[tvas[i]]) return { nom: CONFIG.fournisseursParTva[tvas[i]], source: "tva" };
  }
  var interne = CONFIG.transfertsAutorises.some(function(x) { return f.indexOf(x) !== -1; });
  if (interne) {
    // Transfert de Pierre ou Paul : on lit l'objet du mail d'origine
    for (var cle2 in CONFIG.fournisseurs) if (s.indexOf(cle2) !== -1) return { nom: CONFIG.fournisseurs[cle2], source: "table" };
    return { nom: "Transfert Pierre", source: "transfert" };
  }
  var dom = fournisseurParDomaine(from);
  if (dom) return { nom: dom, source: "domaine" };
  return { nom: "Divers", source: "defaut" };
}

// ---------------------------------------------------------------- Nom de fichier

/**
 * Format historique, à conserver (l'anti-doublon et les rangements passés en dépendent) :
 * "AAAA-MM-JJ — Fournisseur — Facture n° XXX — 123.45 EUR.pdf" ; relevés : "… — Relevé n° XXX — 123.45 EUR.pdf".
 * Les avoirs et tickets gardent le mot « Facture » (montant négatif pour un avoir).
 */
function construireNom(a, extension) {
  var date = a.date || a.dateSecours;
  var libelle = a.type === "releve" ? "Relevé" : a.type === "mandat" ? "Mandat" : a.type === "devis" ? "Devis" : a.type === "attestation" ? "Attestation" : "Facture";
  var morceaux = [date, a.fournisseur, a.numero ? libelle + " n° " + a.numero : libelle];
  if (a.montant && a.type !== "mandat" && a.type !== "attestation") morceaux.push(a.montant + " EUR");
  return morceaux.join(" — ") + extension;
}

// ---------------------------------------------------------------- Analyse complète

/**
 * Analyse pure d'une pièce. Entrée :
 *   { texte, from, subject, nomPiece, dateMail (AAAA-MM-JJ), extension }
 * Sortie :
 *   { type, etablissement, fournisseur, sourceFournisseur, numero, date, dateSecours, montant, nom, texteLu, raisons[] }
 * `raisons` liste ce qui empêche un classement sûr (vide = pièce sûre).
 */
function analyserDocument(e) {
  var texte = e.texte || "";
  var texteLu = texte.replace(/\s+/g, "").length >= 40;
  var f = extraireFournisseur(e.from, e.subject, texte);
  var montant = texteLu ? trouverMontantTTC(texte) : null;
  var type = texteLu ? detecterTypeDocument(texte, montant) : "autre";
  var a = {
    type: type,
    etablissement: texteLu ? detecterEtablissement(texte) : null,
    fournisseur: f.nom,
    sourceFournisseur: f.source,
    numero: texteLu ? (type === "releve" ? trouverNumeroReleve(texte) || trouverNumeroFacture(texte) : trouverNumeroFacture(texte)) : null,
    date: texteLu ? trouverDateFacture(texte) : null,
    dateSecours: e.dateMail,
    montant: montant,
    texteLu: texteLu,
    raisons: []
  };
  // Numéro de secours : dans le nom de la pièce jointe ("CHEVI35 Chev35 00113789.pdf")
  if (!a.numero && e.nomPiece) { var m = String(e.nomPiece).match(/\d{6,}/); if (m) a.numero = m[0]; }
  if (!texteLu) a.raisons.push("texte illisible (OCR)");
  if (texteLu && !a.etablissement) a.raisons.push("établissement inconnu");
  if ((type === "facture" || type === "avoir" || type === "ticket") && !a.montant) a.raisons.push("montant introuvable");
  if (type === "autre" && texteLu) a.raisons.push("type de document incertain");
  if (f.source === "defaut") a.raisons.push("fournisseur inconnu");
  a.nom = construireNom(a, e.extension || ".pdf");
  return a;
}

/**
 * Destination d'une pièce analysée. Pure.
 *   { destination: "sync" | "hors_pennylane" | "journal" | "a_verifier", chemin: [...dossiers sous la racine], raison }
 * Règle d'or : seules les vraies factures, avoirs et tickets, avec établissement sûr et montant lu,
 * entrent dans les dossiers synchronisés avec Pennylane.
 */
function decider(a, dateMois) {
  var mois = nomDossierMois(dateMois);
  if (a.type === "devis" || a.type === "bon_commande" || a.type === "attestation") {
    return { destination: "journal", chemin: [], raison: a.type + " : rien à ranger" };
  }
  if ((a.type === "releve" || a.type === "mandat") && a.texteLu) {
    var etabHp = a.etablissement || "Etablissement inconnu";
    return { destination: "hors_pennylane", chemin: [CONFIG.dossiers.horsPennylane, etabHp, a.fournisseur, mois], raison: "" };
  }
  var piece = a.type === "facture" || a.type === "avoir" || a.type === "ticket";
  if (piece && a.etablissement && a.montant && a.raisons.length === 0) {
    return { destination: "sync", chemin: [a.etablissement, a.fournisseur, mois], raison: "" };
  }
  var raison = a.raisons.length ? a.raisons.join(", ") : "type " + a.type;
  return { destination: "a_verifier", chemin: [CONFIG.dossiers.aVerifier, mois], raison: raison };
}

// ---------------------------------------------------------------- Anti-doublon (pure)

/** Clés de rapprochement d'une pièce : empreinte, fournisseur+numéro, fournisseur+date+montant */
function clesDoublon(a, md5) {
  var cles = [];
  if (md5) cles.push("md5:" + md5);
  if (a.numero) cles.push("num:" + normaliser(a.fournisseur) + "|" + String(a.numero).toUpperCase());
  if (a.montant && (a.date || a.dateSecours)) cles.push("dm:" + normaliser(a.fournisseur) + "|" + (a.date || a.dateSecours) + "|" + a.montant);
  return cles;
}

/** Entrée de l'index qui correspond à la pièce, ou null. `index` = { "md5:…": entrée, "num:…": entrée, "dm:…": entrée } */
function trouverDoublon(index, a, md5) {
  var cles = clesDoublon(a, md5);
  for (var i = 0; i < cles.length; i++) if (index[cles[i]]) return index[cles[i]];
  return null;
}

/** Reconstruit les clés d'un fichier déjà rangé à partir de son nom normalisé (pour l'indexation de l'existant) */
function analyserNomFichier(nom) {
  var m = String(nom).match(/^(\d{4}-\d{2}-\d{2}) — (.+?) — (Relevé LCR|Relevé|Facture|Mandat|Devis|Attestation)(?: n°)? ?([^—]*?)?(?: — (-?[\d.]+) EUR)?\.(pdf|xml|jpg|jpeg|png)$/i);
  if (!m) return null;
  var numero = (m[4] || "").trim() || null;
  return { date: m[1], fournisseur: m[2], type: /relev/i.test(m[3]) ? "releve" : m[3].toLowerCase(), numero: numero, montant: m[5] || null };
}

if (typeof module !== "undefined") {
  module.exports = { sansAccents: sansAccents, normaliser: normaliser, listerMontants: listerMontants, trouverMontantTTC: trouverMontantTTC,
    trouverNumeroFacture: trouverNumeroFacture, trouverDateFacture: trouverDateFacture, lireDate: lireDate, detecterEtablissement: detecterEtablissement,
    detecterTypeDocument: detecterTypeDocument, extraireFournisseur: extraireFournisseur, fournisseurParDomaine: fournisseurParDomaine,
    construireNom: construireNom, analyserDocument: analyserDocument, decider: decider, clesDoublon: clesDoublon, trouverDoublon: trouverDoublon,
    analyserNomFichier: analyserNomFichier };
}
