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
  // Fréquence de chaque montant dans le texte : le vrai total est répété (total TTC, net à payer, échéancier),
  // une consigne ajoutée (TTC + 30 €) ne l'est pas
  var freq = {};
  tous.forEach(function(m) { freq[m.c] = (freq[m.c] || 0) + 1; });
  var meilleur = function(liste) {
    return liste.reduce(function(p, m) {
      if (!p) return m;
      var fm = freq[m.c] || 0, fp = freq[p.c] || 0;
      if (fm !== fp) return fm > fp ? m : p;
      return Math.abs(m.c) > Math.abs(p.c) ? m : p;
    }, null);
  };
  var cles = [/net\s*[àa]\s*payer/gi, /total\s*t\.?\s*t\.?\s*c\.?/gi, /montant\s*t\.?\s*t\.?\s*c\.?/gi,
              /total\s*[àa]\s*payer/gi, /montant\s*d[ûu]/gi, /total\s*due|amount\s*due/gi, /grand\s*total/gi, /total\s*[àa]\s*r[ée]gler/gi,
              /montant\s*(?:[àa]|a)\s*payer/gi, /montant\s*de\s*la\s*facture/gi, /montant\s*total/gi, /total\s*\(eur\)/gi, /total\s*global/gi,
              /ttc\s*[àa]\s*payer/gi, /total\s*(?:ttc\s*)?en\s*eur/gi, /[àa]\s*payer\s*:/gi];
  // Consignes (fûts, emballages, cautions) : un candidat qui vaut un autre candidat + une consigne est écarté
  var consignes = [];
  var reC = new RegExp("(?:" + CONFIG.motifsConsigne.source + ")[^\\d\\-]{0,40}(\\d{1,3}(?:[ .]\\d{3})*[,.]\\d{2})", "gi"), mc;
  while ((mc = reC.exec(t)) !== null) { var cc = Math.round(parseFloat(mc[1].replace(/[ ]/g, "").replace(/\.(?=\d{3})/g, "").replace(",", ".")) * 100); if (cc > 0 && consignes.indexOf(cc) === -1) consignes.push(cc); }
  var sansConsigne = function(liste) {
    if (!consignes.length) return liste;
    var valeurs = liste.map(function(m) { return m.c; });
    return liste.filter(function(m) {
      return !consignes.some(function(k) { return valeurs.indexOf(m.c - k) !== -1 && tous.some(function(x) { return x.c === m.c - k; }); });
    });
  };
  var cand = [];
  for (var i = 0; i < cles.length; i++) {
    var re = cles[i], m;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) {
      var debutFen = m.index + m[0].length;
      listerMontants(t.substr(debutFen, 150)).filter(pasUnTaux).forEach(function(x) { cand.push({ c: x.c, pos: debutFen + x.pos }); });
    }
  }
  // 1) après un mot clé ET cohérent HT + TVA = TTC (le plus répété, puis le plus grand), hors TTC + consigne
  var coherentsCles = sansConsigne(cand.filter(estSomme));
  if (coherentsCles.length) return (meilleur(coherentsCles).c / 100).toFixed(2);
  // 2) n'importe où dans le bloc des totaux : triplet HT + TVA = TTC, le plus grand (un total HT peut aussi être une somme de bases)
  var coherents = sansConsigne(tous.filter(estSomme));
  if (coherents.length) return (coherents.reduce(function(p, m) { return Math.abs(m.c) > Math.abs(p.c) ? m : p; }).c / 100).toFixed(2);
  // 3) plus grand montant après un mot clé, mais jamais au delà de 10 000 € sans triplet (capital, code, SIREN)
  var plafonnes = sansConsigne(cand.filter(function(m) { return Math.abs(m.c) <= CONFIG.montantMaxSansTriplet; }));
  if (plafonnes.length) return (meilleur(plafonnes).c / 100).toFixed(2);
  return null;
}

// ---------------------------------------------------------------- Numéro

var MOTIF_NUM = "(?=[A-Z0-9\\-\\/_.]*\\d)([A-Z0-9][A-Z0-9\\-\\/_.]{2,})";

function nettoyerNumero(n) { return n.replace(/[\/\\]/g, "-").replace(/[.\-_]+$/, ""); }

/** Vrai si le numéro trouvé à la position `pos` est un numéro de client (« client », « code client », « destinataire code »…) */
function numeroDeClient(t, pos) {
  var avant = normaliser(t.substr(Math.max(0, pos - 40), Math.min(40, pos)));
  return /(?:^|[^a-z])(?:n\s*[°o]\s*)?(?:client|code\s*client|destinataire\s*code|compte\s*client|votre\s*code|ref\.?\s*client|facture\s*a|facturé\s*a|facture\s*n\s*[°o]\s*client)\s*(?:n\s*[°o]\.?|:|numero)?\s*$/.test(avant)
      || /client\s*(?:facture|facturé)?\s*(?:n\s*[°o]\.?|:)?\s*$/.test(avant);
}

/** Première occurrence d'un motif dont le numéro n'est pas un numéro de client */
function chercherNumero(t, motif) {
  var re = new RegExp(motif.source, motif.flags.indexOf("g") === -1 ? motif.flags + "g" : motif.flags), m;
  while ((m = re.exec(t)) !== null) {
    var pos = m.index + m[0].lastIndexOf(m[1]);
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(m[1])) continue;   // « Date de facture : 30/09/2026 »
    if (!numeroDeClient(t, pos)) return m[1];
  }
  return null;
}

function trouverNumeroFacture(texte) {
  if (!texte) return null;
  var t = texte.replace(/ /g, " ");
  var motifs = [
    new RegExp("(?:facture|invoice|avoir)\\s*(?:n\\s*[°o]\\.?|num[ée]ro|number|no\\.?|#)\\s*:?\\s*#?\\s*[—–-]?\\s*" + MOTIF_NUM, "i"),
    new RegExp("(?:n\\s*[°o]\\.?|num[ée]ro)\\s*(?:de\\s*)?(?:facture|avoir)\\s*:?\\s*" + MOTIF_NUM, "i"),
    new RegExp("num[ée]ro\\s*:?\\s*" + MOTIF_NUM, "i"),
    new RegExp("n\\s*[°o]\\s*pi[èe]ce[\\s\\S]{0,80}?\\b(\\d{6,})\\b", "i"),
    new RegExp("\\b(?:facture|avoir)\\s*:?\\s*(?=[A-Z]{0,6}(?:[-_\\/][A-Z]{0,6})?[-_\\/]?\\d)" + MOTIF_NUM, "i")
  ];
  for (var i = 0; i < motifs.length; i++) {
    var n = chercherNumero(t, motifs[i]);
    if (n) return nettoyerNumero(n);
  }
  // Repli : en-tête « N° facture » suivi d'un tableau (Elis) -> le jeton le plus riche en chiffres des 160 caractères suivants
  var h = t.match(/n\s*[°o]\.?\s*(?:de\s*)?facture\b/i);
  if (h) {
    var fen = t.substr(h.index + h[0].length, 160), re = /[A-Z0-9][A-Z0-9\-_.]{3,}/gi, jm, meilleur = null, score = 0;
    while ((jm = re.exec(fen)) !== null) {
      var jeton = jm[0], chiffres = (jeton.match(/\d/g) || []).length;
      if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}/.test(jeton)) continue;           // une date
      if (numeroDeClient(fen, jm.index)) continue;
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

/**
 * Date de la facture (AAAA-MM-JJ) lue après un mot clé, ou null (le mail donne alors la date de secours).
 * Trois niveaux de mots clés, du plus sûr au plus vague ; les dates qui suivent « échéance », « prélèvement »,
 * « à payer avant », « limite » sont ignorées, ainsi que toute date plus de 3 jours après le mail (`dateMail`).
 */
function trouverDateFacture(texte, dateMail) {
  if (!texte) return null;
  var t = sansAccents(texte.replace(/ /g, " "));
  var limite = dateMail ? ajouterJours(dateMail, CONFIG.dateFutureJours) : null;
  var niveaux = [
    /facture\s*n?\s*[°o]?\.?\s*[A-Z0-9\-\/]*\s+du\b|relev[ée]\s*(?:mensuel|client|de\s*compte)?\s*(?:n\s*[°o]\.?\s*\S+)?\s*du\b|date\s*(?:de\s*(?:la\s*)?)?(?:facture|facturation|d['’]?\s*emission|emission)|invoice\s*date|issue\s*date|[ée]mise?\s+le\b|[ée]tablie?\s+le\b|[ée]dit[ée]e?\s+le\b/gi,
    /en\s*date\s*du|date\s*:|date\s+ech[ée]ance|date\s+client\s+page|date\s+contrem|,\s*le\s+(?=\d)|\bfait\s+a\s+[a-z\- ]{2,30}\s+le\b/gi,
    /\bdate\b/gi
  ];
  var exclu = /ech[ée]ance|pr[ée]l[èe]vement|pr[ée]lev[ée]|payer\s+avant|limite|due\s*date|validit[ée]|livraison|expedition\s*prevue/i;
  for (var n = 0; n < niveaux.length; n++) {
    var re = niveaux[n], m;
    while ((m = re.exec(t)) !== null) {
      var avant = t.substr(Math.max(0, m.index - 30), Math.min(30, m.index));
      if (n > 0 && exclu.test(avant + " " + m[0])) continue;
      var fen = t.substr(m.index + m[0].length, n === 2 ? 120 : 90);
      var d = lireDatePlausible(fen, limite);
      if (d) return d;
    }
    if (n === 1) {
      // Tickets de caisse : « 02/10/2026 18:12 »
      var tk = t.match(/(\d{2}\/\d{2}\/\d{4})\s+\d{2}:\d{2}/);
      if (tk) { var dt = lireDatePlausible(tk[1], limite); if (dt) return dt; }
    }
  }
  return null;
}

/** Première date de la fenêtre qui n'est pas dans le futur (au delà de `limite`, AAAA-MM-JJ) */
function lireDatePlausible(fen, limite) {
  var reste = fen;
  for (var k = 0; k < 4; k++) {
    var d = lireDate(reste);
    if (!d) return null;
    if (!limite || d <= limite) return d;
    var i = reste.search(/\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{1,2}\s+[a-z]{3,9}\.?\s+\d{4}|\d{4}-\d{2}-\d{2}/i);
    reste = i === -1 ? "" : reste.slice(i + 6);
  }
  return null;
}

/** AAAA-MM-JJ + n jours */
function ajouterJours(iso, n) {
  var p = String(iso).split("-"), d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours entre deux dates AAAA-MM-JJ (b - a) */
function joursEntre(a, b) {
  var pa = String(a).split("-"), pb = String(b).split("-");
  return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
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
/** Nombre de lignes « numéro de facture, date, montant » (tableau d'un relevé) */
function compterLignesFactures(texte) {
  var t = String(texte || "").replace(/ /g, " ");
  var re = /\b\d{6,}\b[^\n]{0,30}?\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b[^\n]{0,40}?\d+[,.]\d{2}/g, n = 0;
  while (re.exec(t) !== null) n++;
  return n;
}

function detecterTypeDocument(texte, montant) {
  if (!texte) return "autre";
  var t = normaliser(texte);
  var signauxFacture = /facture\s*n|n\s*[°o]\.?\s*(?:de\s*)?facture|n\s*[°o]\s*piece|total\s*t\.?\s*t\.?\s*c|net\s*a\s*payer|total\s*a\s*payer|invoice\s*(?:n|number|#)/.test(t);
  if (/releve\s*(?:client|de\s*compte|de\s*lcr|lcr|mensuel|de\s*factures?|de\s*situation)|recapitulatif\s*(?:de\s*|des\s*)?factures?|etat\s*recapitulatif|grand\s*livre|\bl\.?c\.?r\.?\s*\d{6,}/.test(t)) return "releve";
  // Un document qui aligne plusieurs numéros de facture avec leurs dates et montants, et un total, est un relevé
  if (compterLignesFactures(texte) >= CONFIG.releveLignesMin && /\btotal\b/.test(t)) return "releve";
  if (/mandat\s*(?:de\s*prelevement\s*)?sepa|autorisation\s*de\s*prelevement|reference\s*unique\s*d[eu]\s*mandat|\brum\s*:/.test(t)) return "mandat";
  var numeroFacture = /facture\s*n\s*[°o]|n\s*[°o]\.?\s*(?:de\s*)?facture|invoice\s*(?:n|number|#)/.test(t);
  if (/attestation\s+(?:de|d['’])\s*(?:depot|vigilance|regularite|conformite|dsn|assurance|paiement|versement)|attestation\s+employeur|attestation\s+(?:destinee|pour)\s+(?:a\s+)?(?:france\s*travail|pole\s*emploi)|declaration\s*sociale\s*nominative|\bdsn\b/.test(t) && !signauxFacture) return "attestation";
  // Un devis affiche un total TTC : seul un vrai numéro de facture l'emporte
  if (/\bdevis\s*(?:n\s*[°o]|num|:)|ce\s*devis|validite\s*(?:du\s*)?devis|bon\s*pour\s*accord|pro\s*-?\s*forma/.test(t) && !numeroFacture) return "devis";
  if (/\bdevis\b/.test(t) && !signauxFacture) return "devis";
  if (/bon\s*de\s*commande|confirmation\s*de\s*commande|purchase\s*order|accuse\s*de\s*reception\s*de\s*commande/.test(t) && !signauxFacture) return "bon_commande";
  // Épreuves d'imprimeur (Diazo : PDF de contrôle, bon à tirer) et contrats signés électroniquement
  if (/pdf\s*de\s*controle|bon\s*a\s*tirer|\bbat\b|epreuve\s*(?:de\s*)?(?:controle|validation)|validation\s*avant\s*impression/.test(t) && !signauxFacture) return "epreuve";
  if (/docusign|signature\s*electronique|enveloppe\s*(?:completee|signee)|toutes\s*les\s*parties\s*ont\s*(?:complete|signe)/.test(t) && !signauxFacture) return "contrat";
  // Avoir : montant négatif, ou « avoir » dans le TITRE du document (600 premiers caractères), jamais « facture/avoir »
  // (en-tête générique Cozigou) ni « avoir de prix » dans une légende (Cheville 35)
  var titre = t.slice(0, 600).replace(/facture\s*(?:\/|ou|-)\s*avoir/g, "").replace(/avoir\s*de\s*prix/g, "");
  if (montant && parseFloat(montant) < 0 && (signauxFacture || /\bavoir\b|\bfacture\b/.test(t))) return "avoir";
  if (/(?:^|\n|\s)(?:facture\s*d['’]\s*)?avoir\s*(?:n\s*[°o]|num[ée]ro|:|\n)|credit\s*note|note\s*de\s*credit/.test(titre)) return "avoir";
  if (/ticket\s*(?:client|de\s*caisse)|carte\s*bancaire\s*sans\s*contact|a\s*conserver\b/.test(t) && !signauxFacture) return "ticket";
  if (signauxFacture || /\bfacture\b|\binvoice\b|\brecu\b|\breceipt\b/.test(t)) return "facture";
  if (/\b(?:tarifs?|promotions?|promos?|catalogue|newsletter|mercuriale|offre\s*speciale|offres?\s*(?:du\s*moment|de\s*la\s*semaine))\b/.test(t)) return "catalogue";
  return "autre";
}

/** Type imposé par le domaine de l'expéditeur (DocuSign -> contrat, notifications Pennylane…), ou null */
function typeParExpediteur(from) {
  var cands = domainesCandidats(domaineDe(from));
  for (var i = 0; i < cands.length; i++) if (CONFIG.expediteursJournalSeul[cands[i]]) return CONFIG.expediteursJournalSeul[cands[i]];
  return null;
}

/** Vrai si l'expéditeur écrit depuis une messagerie de particulier (gmail, hotmail, icloud, wanadoo…) */
function estParticulier(from) {
  var d = domaineDe(from);
  return !!d && CONFIG.domainesParticuliers.indexOf(d) !== -1;
}

/** Catalogue, tarif, promotion d'après l'objet du mail ou le nom de la pièce (pas d'après le texte) */
function estCatalogueParObjet(subject, nomPiece) {
  var s = sansAccents(String(subject || "") + " " + String(nomPiece || ""));
  if (/\b(facture|invoice|avoir|releve|recu|receipt)\b/i.test(s)) return false;
  return CONFIG.motifsCatalogue.test(s);
}

// ---------------------------------------------------------------- Fournisseur

/**
 * Fournisseur d'après la liste de référence (15_fournisseurs.js) : { nom, source, entree } ou, inconnu,
 * { nom: null, source: "inconnu", propose } où `propose` est le nom tiré du domaine (pour la ligne « à compléter »).
 * Le nom n'est JAMAIS inventé à partir du domaine.
 */
function extraireFournisseur(idx, from, subject, texte) {
  var r = resoudreFournisseur(idx, { from: from, subject: subject, texte: texte });
  if (r) return { nom: r.entree.nom, source: r.source, entree: r.entree };
  return { nom: null, source: "inconnu", propose: nomProposeDepuisDomaine(from) };
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
  var morceaux = [date, a.fournisseur || "Fournisseur inconnu", a.numero ? libelle + " n° " + a.numero : libelle];
  if (a.montant && a.type !== "mandat" && a.type !== "attestation") morceaux.push(a.montant + " EUR");
  return morceaux.join(" — ") + extension;
}

// ---------------------------------------------------------------- Analyse complète

/**
 * Analyse pure d'une pièce. Entrée :
 *   { idx (index des fournisseurs), texte, from, subject, nomPiece, dateMail (AAAA-MM-JJ), extension }
 * Sortie :
 *   { type, etablissement, fournisseur, sourceFournisseur, fournisseurPropose, numero, date, dateSecours, montant, nom, texteLu, raisons[] }
 * `raisons` liste ce qui empêche un classement sûr (vide = pièce sûre).
 */
function analyserDocument(e) {
  var texte = e.texte || "";
  var texteLu = texte.replace(/\s+/g, "").length >= 40;
  var f = extraireFournisseur(e.idx || indexerFournisseurs(listeFournisseursParDefaut()), e.from, e.subject, texte);
  var montant = texteLu ? trouverMontantTTC(texte) : null;
  var type = texteLu ? detecterTypeDocument(texte, montant) : "autre";
  // Expéditeurs qui n'envoient jamais de factures (DocuSign, notifications Pennylane, Vinted, La Poste, JDC, Up Coop)
  var typeForce = typeParExpediteur(e.from);
  if (typeForce) type = typeForce;
  // Mail de particulier (gmail, hotmail…) sans SIRET, ni TVA, ni montant : devis, CV, réservation -> journal seul
  var particulier = estParticulier(e.from) && f.source !== "identifiant";
  if (particulier && type === "autre" && !montant && !listerIdentifiants(texte).length) type = "courrier";
  // Tarifs, promotions, catalogues annoncés par l'objet du mail ou le nom de la pièce : journal seul
  if (type !== "facture" && type !== "avoir" && type !== "releve" && type !== "mandat" && estCatalogueParObjet(e.subject, e.nomPiece)) type = "catalogue";
  if (type === "autre" && texteLu && estCatalogueParObjet(e.subject, e.nomPiece)) type = "catalogue";
  var etabLu = texteLu ? detecterEtablissement(texte) : null;
  var a = {
    type: type,
    etablissement: etabLu,
    sourceEtablissement: etabLu ? "document" : null,
    fournisseur: f.nom,
    sourceFournisseur: f.source,
    fournisseurPropose: f.propose || null,
    numero: texteLu ? (type === "releve" ? trouverNumeroReleve(texte) || trouverNumeroFacture(texte) : trouverNumeroFacture(texte)) : null,
    date: texteLu ? trouverDateFacture(texte, e.dateMail) : null,
    dateSecours: e.dateMail,
    montant: montant,
    texteLu: texteLu,
    raisons: []
  };
  // Établissement par défaut de la liste de référence (colonne remplie par Paul), si « Bello » ou « Piccola »
  if (!a.etablissement && texteLu && f.entree && f.entree.etab) {
    var defaut = etablissementParDefaut(f.entree.etab);
    if (defaut) { a.etablissement = defaut; a.sourceEtablissement = "liste"; }
  }
  a.etabParDefaut = f.entree ? String(f.entree.etab || "") : "";
  // Numéro de secours : dans le nom de la pièce jointe ("CHEVI35 Chev35 00113789.pdf")
  if (!a.numero && e.nomPiece) { var m = String(e.nomPiece).match(/\d{6,}/); if (m) a.numero = m[0]; }
  if (!texteLu) a.raisons.push("texte illisible (OCR)");
  if (texteLu && !a.etablissement) a.raisons.push("établissement inconnu" + (f.entree ? " (liste : « " + (a.etabParDefaut || "vide") + " »)" : ""));
  if ((type === "facture" || type === "avoir" || type === "ticket") && !a.montant) a.raisons.push("montant introuvable");
  if (type === "autre" && texteLu) a.raisons.push("type de document incertain");
  if (!f.nom && ["catalogue", "contrat", "notification", "courrier", "epreuve"].indexOf(type) === -1) a.raisons.push("fournisseur inconnu" + (f.propose ? " (" + f.propose + " ?)" : ""));
  // Une facture de plus de 90 jours reçue aujourd'hui est suspecte (facture de 2025 dans un mail de 2026)
  if (a.date && e.dateMail && (type === "facture" || type === "avoir" || type === "ticket") && joursEntre(a.date, e.dateMail) > CONFIG.ancienneFactureJours) {
    a.raisons.push("ancienne facture (" + a.date + ")");
  }
  a.nom = construireNom(a, e.extension || ".pdf");
  return a;
}

/**
 * Colonne « Établissement par défaut » du Sheet -> nom d'établissement.
 * Variantes acceptées : bello, bello mio, sasha, bm / piccola, piccola mia, fratelli, pm. « Les deux », vide ou autre -> null.
 */
function etablissementParDefaut(valeur) {
  var v = normaliser(valeur).replace(/[^a-z]/g, " ").trim();
  if (!v || /les\s*deux|both|tous/.test(v)) return null;
  if (/^(bello(\s*mio)?|sasha|bm)$/.test(v) || /^bello\b/.test(v)) return "Bello Mio";
  if (/^(piccola(\s*mia)?|fratelli|i\s*fratelli|pm)$/.test(v) || /^piccola\b/.test(v)) return "Piccola Mia";
  return null;
}

/** Année d'archivage d'une pièce : celle de la date de facture, sinon du mail */
function anneeDe(a) { return String(a.date || a.dateSecours || "").slice(0, 4) || "Sans date"; }

/**
 * Destination d'une pièce analysée. Pure.
 *   { destination: "envoi" | "hors_pennylane" | "journal" | "a_verifier", chemin: [...dossiers sous la racine], archive: [...], raison }
 *   - envoi : à plat dans « Envoi Pennylane/<Établissement> » (seuls dossiers lus par Pennylane) ; `archive` est le dossier
 *     <Établissement>/<Fournisseur>/<Année> où le fichier sera déplacé après 3 jours ;
 *   - hors_pennylane : relevés et mandats, « _Hors Pennylane/<Établissement>/<Fournisseur>/<Année> » ;
 *   - journal : devis, bon de commande, attestation, rien n'est rangé ;
 *   - a_verifier : « À vérifier », à plat, la raison dans la description du fichier.
 * Règle d'or : seules les vraies factures, avoirs et tickets, avec établissement sûr, montant lu et fournisseur
 * de la liste de référence, partent vers Pennylane.
 */
function decider(a) {
  var annee = anneeDe(a);
  if (["devis", "bon_commande", "attestation", "catalogue", "contrat", "notification", "courrier", "epreuve"].indexOf(a.type) !== -1) {
    return { destination: "journal", chemin: [], archive: [], raison: a.type + " : rien à ranger" };
  }
  if ((a.type === "releve" || a.type === "mandat") && a.texteLu && a.fournisseur) {
    var etabHp = a.etablissement || "Etablissement inconnu";
    var cheminHp = [CONFIG.dossiers.horsPennylane, etabHp, a.fournisseur, annee];
    return { destination: "hors_pennylane", chemin: cheminHp, archive: cheminHp, raison: "" };
  }
  var piece = a.type === "facture" || a.type === "avoir" || a.type === "ticket";
  if (piece && a.etablissement && a.montant && a.fournisseur && a.raisons.length === 0) {
    return { destination: "envoi", chemin: [CONFIG.dossiers.envoi, a.etablissement], archive: [a.etablissement, a.fournisseur, annee], raison: "" };
  }
  var raison = a.raisons.length ? a.raisons.join(", ") : "type " + a.type;
  return { destination: "a_verifier", chemin: [CONFIG.dossiers.aVerifier], archive: [], raison: raison };
}

// ---------------------------------------------------------------- Anti-doublon (pure)

/** Clés de rapprochement d'une pièce : empreinte, fournisseur+numéro, fournisseur+date+montant */
function clesDoublon(a, md5) {
  var cles = [], f = cleFournisseur(a.fournisseur || "");
  if (md5) cles.push("md5:" + md5);
  if (a.numero && f) cles.push("num:" + f + "|" + String(a.numero).toUpperCase());
  if (a.montant && f && (a.date || a.dateSecours)) cles.push("dm:" + f + "|" + (a.date || a.dateSecours) + "|" + a.montant);
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

