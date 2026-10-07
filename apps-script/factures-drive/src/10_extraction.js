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

/**
 * Texte prêt pour la lecture des montants : espaces insécables et fines (U+00A0, U+202F, U+2009, U+2007) ramenées à
 * l'espace, et un O lu par l'OCR à la place d'un zéro entre deux chiffres (« 1 O72,56 » -> « 1 072,56 »).
 */
function normaliserMontants(s) {
  return String(s || "").replace(/[    ]/g, " ").replace(/(?<=\d ?)[oO](?=\d)/g, "0").replace(/(?<=\d)[oO](?=[,.]\d{2}\b)/g, "0");
}

/**
 * Tous les montants « 1 234,56 » / « 12.30 » / « -4,92 » / « 148,12- » d'un texte : [{ c: centimes signés, pos, colle, decolle }].
 * Un signe moins n'est retenu que collé au nombre (« -4,92 », « 148,12- ») ou, après le nombre, suivi d'un « € » ou d'une fin de ligne :
 * « 128,27 - Echéance » est un tiret de mise en page.
 * Lecture collée : « 2 105,40 » peut être le montant 2 105,40 ou une colonne isolée (« 2 ») suivie de 105,40 (OCR). Les deux lectures
 * sont produites : la collée porte `colle`, la non collée `decolle` ; trouverMontantTTC garde celle qui forme un triplet cohérent.
 */
function listerMontants(s) {
  var re = /(-)?(?<![\d.,])(?!0\d)(\d{1,3}(?:[ .]\d{3})+|\d+)[,.](\d{2})(?![\d%])(-(?! ?\d)| ?-(?=\s*(?:€|eur\b|\n|$)))?/gim, a, out = [];
  while ((a = re.exec(s)) !== null) {
    var c = parseInt(a[2].replace(/[ .]/g, ""), 10) * 100 + parseInt(a[3], 10);
    if (a[1] || a[4]) c = -c;
    if (c === 0 || Math.abs(c) >= CONFIG.montantMax) continue;   // « 0,00 » n'est jamais un total ; au delà : capital, SIREN
    var parEspace = a[2].indexOf(" ") !== -1;
    out.push({ c: c, pos: a.index, colle: parEspace });
    if (parEspace) {
      // lecture non collée : le dernier groupe de trois chiffres (« 5 121,58 » -> 121,58)
      var dernier = a[2].slice(a[2].lastIndexOf(" ") + 1), c2 = parseInt(dernier, 10) * 100 + parseInt(a[3], 10);
      if (a[1] || a[4]) c2 = -c2;
      if (c2 !== 0) out.push({ c: c2, pos: a.index + a[0].length - a[3].length - 1 - dernier.length, decolle: true });
    }
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
  var t = normaliserMontants(texte);
  var pasUnTaux = function(m) { return CONFIG.tauxTva.indexOf(Math.abs(m.c)) === -1; };
  var estSommeDans = function(liste, m) {
    for (var x = 0; x < liste.length; x++) {
      if (Math.abs(liste[x].pos - m.pos) > PROXIMITE_TOTAUX) continue;
      for (var y = 0; y < liste.length; y++) {
        if (x === y || Math.abs(liste[y].pos - m.pos) > PROXIMITE_TOTAUX) continue;
        if (tripletCoherent(liste[x].c, liste[y].c, m.c)) return true;
      }
    }
    return false;
  };
  // Lectures collées (« 2 105,40 ») : acceptées seulement si aucun triplet HT + TVA = TTC n'existe sans elles
  var brut = listerMontants(t).filter(pasUnTaux);
  var sansCollees = brut.filter(function(m) { return !m.colle; });
  var tripletSansCollees = sansCollees.some(function(m) { return estSommeDans(sansCollees, m); });
  var tous = tripletSansCollees ? sansCollees : brut.filter(function(m) { return !m.decolle; });
  // Soldes de compte (« Solde antérieur 90,00 Nouveau solde 180,00 ») : jamais un total de facture
  var reS = new RegExp(CONFIG.motifsSolde.source, "gi"), ms, soldes = [];
  while ((ms = reS.exec(t)) !== null) soldes.push([ms.index, ms.index + ms[0].length + 40]);
  tous = tous.filter(function(m) { return !soldes.some(function(f) { return m.pos >= f[0] && m.pos <= f[1]; }); });
  var estSomme = function(m) { return estSommeDans(tous, m); };
  var dansFenetre = function(debut, longueur) { return tous.filter(function(m) { return m.pos >= debut && m.pos < debut + longueur; }); };
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
    return liste.filter(function(m) {
      return !consignes.some(function(k) { return tous.some(function(x) { return x.c === m.c - k; }); });
    });
  };
  var cand = [];
  for (var i = 0; i < cles.length; i++) {
    var re = cles[i], m;
    re.lastIndex = 0;
    while ((m = re.exec(t)) !== null) cand = cand.concat(dansFenetre(m.index + m[0].length, 150));
  }
  // 0) « net à payer » : c'est le montant que Pennylane retient. Il peut différer du TTC quand des consignes et des
  //    déconsignes s'ajoutent (Cozigou : TTC 729,25, consigne +30, déconsigne -64,20, net à payer 695,05).
  //    Dans sa fenêtre : d'abord un montant cohérent HT + TVA, sinon un montant répété ailleurs sur le document.
  var clesNet = [/(?:total\s*)?net\s*[àa]\s*payer/gi, /[àa]\s*payer\s*:/gi];
  var candNet = [];
  for (var n0 = 0; n0 < clesNet.length; n0++) {
    var reN = clesNet[n0], mN;
    reN.lastIndex = 0;
    while ((mN = reN.exec(t)) !== null) candNet = candNet.concat(dansFenetre(mN.index + mN[0].length, 150));
  }
  candNet = sansConsigne(candNet.filter(function(m) { return Math.abs(m.c) <= CONFIG.montantMaxSansTriplet; }));
  var netCoherents = candNet.filter(estSomme);
  if (netCoherents.length) return (meilleur(netCoherents).c / 100).toFixed(2);
  var netRepetes = candNet.filter(function(m) { return (freq[m.c] || 0) >= 2; });
  if (netRepetes.length) return (meilleur(netRepetes).c / 100).toFixed(2);
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

/** Numéro nettoyé : séparateurs unifiés, et un mot collé par l'OCR à la fin d'un numéro chiffré retiré (« 21741SARL » -> « 21741 ») */
function nettoyerNumero(n) { return n.replace(/[\/\\]/g, "-").replace(/[.\-_]+$/, "").replace(/^(\d{4,})[A-Z]{3,}$/, "$1"); }

/** Vrai si le numéro trouvé à la position `pos` est un numéro de client (« client », « code client », « destinataire code »…) */
function numeroDeClient(t, pos) {
  var avant = normaliser(t.substr(Math.max(0, pos - 40), Math.min(40, pos)));
  return /(?:^|[^a-z])(?:n\s*[°o]\s*)?(?:client|code\s*client|destinataire\s*code|compte\s*client|votre\s*code|ref\.?\s*client|facture\s*a|facturé\s*a|facture\s*n\s*[°o]\s*client)\s*(?:n\s*[°o]\.?|:|numero)?\s*$/.test(avant)
      || /client\s*(?:facture|facturé)?\s*(?:n\s*[°o]\.?|:)?\s*$/.test(avant);
}

/**
 * Vrai si le candidat est un identifiant fiscal et non un numéro de facture : TVA intracommunautaire (FR + 11 chiffres,
 * « FR53922735535 » chez Self Stockage), ou SIRET (14 chiffres) / SIREN (9 chiffres) présent dans les identifiants du texte.
 */
function estIdentifiantFiscal(candidat, texte) {
  var k = cleIdentifiant(candidat);
  if (/^FR\d{11}$/.test(k)) return true;
  if (!/^\d{9}$|^\d{14}$/.test(k)) return false;
  var ids = listerIdentifiants(texte);
  if (ids.indexOf(k) !== -1) return true;
  // SIRET dont le SIREN est connu, ou SIREN d'un SIRET connu
  return ids.some(function(i) { return /^\d{14}$/.test(i) && i.slice(0, 9) === k || k.length === 14 && i === k.slice(0, 9); });
}

/** Première occurrence d'un motif dont le numéro n'est pas un numéro de client */
function chercherNumero(t, motif) {
  var re = new RegExp(motif.source, motif.flags.indexOf("g") === -1 ? motif.flags + "g" : motif.flags), m;
  while ((m = re.exec(t)) !== null) {
    var pos = m.index + m[0].lastIndexOf(m[1]);
    if (/^\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}$/.test(m[1])) continue;   // « Date de facture : 30/09/2026 »
    if (estIdentifiantFiscal(m[1], t)) continue;                             // « TVA FR53922735535 », SIRET, SIREN
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
      if (estIdentifiantFiscal(jeton, t)) continue;
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
    /en\s*date\s*du|date\s*:|date\s+ech[ée]ance|date\s+client\s+page|date\s+contrem|,\s*le\s+(?=\d)|\bfait\s+a\s+[a-z\- ]{2,30}\s+le\b|(?:^|\n)[a-z][a-z\- ]{1,30}\s+le,?\s+(?=\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})|\b[a-z]{2,}\s+le,\s+(?=\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/gi,
    /\bdate\b/gi
  ];
  var exclu = /ech[ée]ance|pr[ée]l[èe]vement|pr[ée]lev[ée]|payer\s+avant|limite|due\s*date|validit[ée]|livraison|expedition\s*prevue|transporteur|exp[ée]di[ée]|remis\s+le|envoy[ée]/i;
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
 * Établissement destinataire lu sur le document : { etab: "Bello Mio" | "Piccola Mia" | null, contradictoire, source }.
 *   1) bloc d'adresse de facturation (« Facturé à », « Client : », « Destinataire »…, 300 caractères) : un seul établissement cité -> retenu ;
 *   2) numéro de TVA ou SIREN (preuve forte) ;
 *   3) mots (SASHA, place du Poncel / FRATELLI, rue Ville Pépin…) ; les deux établissements cités -> majorité nette (au moins deux
 *      marqueurs contre un), sinon `contradictoire` : la pièce va dans À vérifier, sans appliquer l'établissement par défaut de la liste.
 * Les phrases de CONFIG.marqueurs.ignorer (« SASHA I FRATELLI AND CO », nom complet de la SARL SASHA) sont retirées avant la recherche.
 */
function analyserEtablissement(texte) {
  var r = { etab: null, contradictoire: false, source: null };
  if (!texte) return r;
  var t = normaliser(texte);
  (CONFIG.marqueurs.ignorer || []).forEach(function(p) { t = t.split(p).join(" "); });
  var compact = t.replace(/[\s.]/g, "");
  var marqueursDans = function(s) {
    var out = {};
    CONFIG.etablissements.forEach(function(etab) {
      var mq = CONFIG.marqueurs[etab], n = 0;
      for (var i = 0; i < mq.mots.length; i++) if (s.indexOf(mq.mots[i]) !== -1) n++;
      if (n) out[etab] = n;
    });
    return out;
  };
  // 1) bloc d'adresse de facturation
  var reA = new RegExp(CONFIG.motifsAdresseFacturation.source, "gi"), ma, dansAdresse = {};
  while ((ma = reA.exec(t)) !== null) {
    var bloc = marqueursDans(t.substr(ma.index + ma[0].length, 300));
    for (var k in bloc) dansAdresse[k] = (dansAdresse[k] || 0) + bloc[k];
  }
  var etabsAdresse = Object.keys(dansAdresse);
  if (etabsAdresse.length === 1) { r.etab = etabsAdresse[0]; r.source = "adresse"; return r; }
  // 2) identifiants
  var fort = CONFIG.etablissements.filter(function(etab) { var mq = CONFIG.marqueurs[etab]; return compact.indexOf(mq.tva.toLowerCase()) !== -1 || compact.indexOf(mq.siren) !== -1; });
  if (fort.length === 1) { r.etab = fort[0]; r.source = "identifiant"; return r; }
  if (fort.length > 1) { r.contradictoire = true; return r; }
  // 3) mots
  var faible = marqueursDans(t), etabs = Object.keys(faible);
  if (etabs.length === 1) { r.etab = etabs[0]; r.source = "mots"; return r; }
  if (etabs.length > 1) {
    var tri = etabs.slice().sort(function(a, b) { return faible[b] - faible[a]; });
    if (faible[tri[0]] >= 2 && faible[tri[1]] === 1) { r.etab = tri[0]; r.source = "mots (majorité)"; return r; }
    r.contradictoire = true;
  }
  return r;
}

/** Établissement seul (compatibilité) : "Bello Mio", "Piccola Mia" ou null (inconnu ou contradictoire) */
function detecterEtablissement(texte) { return analyserEtablissement(texte).etab; }

/** Établissement désigné par l'adresse de réception du mail (facture@piccolamia.fr -> Piccola Mia), ou null */
function etablissementParReception(recuSur) {
  var a = String(recuSur || "").toLowerCase();
  if (!a || CONFIG.adressesFacture.indexOf(a) === -1) return null;
  if (/bellomio/.test(a)) return "Bello Mio";
  if (/piccolamia/.test(a)) return "Piccola Mia";
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
  // Un devis ou un bon de commande affiche un total TTC : seul un vrai numéro de facture l'emporte
  if (/\bdevis\s*(?:n\s*[°o]|num|:)|ce\s*devis|validite\s*(?:du\s*)?devis|bon\s*pour\s*accord|pro\s*-?\s*forma/.test(t) && !numeroFacture) return "devis";
  // « Bon de commande », « BC n° », « purchase order » dans le titre : bon de commande, même si « facture » apparaît plus loin
  var titreNumero = /facture\s*n\s*[°o]|n\s*[°o]\.?\s*(?:de\s*)?facture/.test(t.slice(0, 800));
  if (/bon\s*de\s*commande|\bbc\s*n\s*[°o]|purchase\s*order/.test(t.slice(0, 800)) && !titreNumero) return "bon_commande";
  // Bon de livraison (« Bon de livraison », « BL n° », « BDL00000439 ») : la facture mensuelle le reprend, journal seul.
  // (« facturé » perd son accent dans `normaliser` : cette règle passe AVANT celle des factures)
  if (/bon\s*de\s*livraison|\bbl\s*n\s*[°o]|\bbdl\s*\d|bon\s*de\s*r[ée]ception|delivery\s*note/.test(t.slice(0, 800)) && !titreNumero) return "bon_livraison";
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
  if (r && r.entree) return { nom: r.entree.nom, source: r.source, entree: r.entree, perso: !!r.perso, ignorer: !!r.ignorer };
  // plateforme de facturation sans fournisseur lisible : pas de nom proposé (le domaine n'est pas le fournisseur)
  if (r && r.source === "plateforme") return { nom: null, source: "plateforme", propose: null };
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

// ---------------------------------------------------------------- Factures internes (v4.6.4)

/**
 * Facture interne entre les deux sociétés (émise avec le module de facturation Pennylane, titre « Invoicing ») :
 * les SIREN de SASHA et de FRATELLI sont tous deux sur le document, et les blocs « Émetteur ou Émettrice » / « Client ou Cliente »
 * disent qui facture qui. Pennylane les enregistre déjà des deux côtés : jamais dans Envoi Pennylane (doublon assuré).
 * Retourne { emetteur, client } (noms d'établissement) ou null. Au moindre doute (sens illisible) : null, la pièce suit le
 * circuit normal (À vérifier).
 */
function detecterFactureInterne(texte) {
  if (!texte) return null;
  var t = normaliser(texte);
  var compact = t.replace(/[^0-9a-z]/g, "");
  var presents = CONFIG.etablissements.filter(function(etab) { return compact.indexOf(CONFIG.marqueurs[etab].siren) !== -1; });
  if (presents.length !== CONFIG.etablissements.length) return null;
  var premierCite = function(fen) {
    CONFIG.marqueurs.ignorer.forEach(function(x) { fen = fen.split(x).join(" "); });
    var meilleur = null, pos = Infinity;
    CONFIG.etablissements.forEach(function(etab) {
      var m = CONFIG.marqueurs[etab];
      m.mots.concat([m.siren]).forEach(function(mot) { var i = fen.indexOf(mot); if (i !== -1 && i < pos) { pos = i; meilleur = etab; } });
    });
    return meilleur;
  };
  var bloc = function(re) { var m = re.exec(t); return m ? premierCite(t.slice(m.index + m[0].length, m.index + m[0].length + 250)) : null; };
  var emetteur = bloc(/\bem\w{0,7}\s+ou\s+em\w{0,9}/);       // « Émetteur ou Émettrice » (l'OCR perd parfois les « tt »)
  var client = bloc(/\bclient\s+ou\s+cliente\b/);
  if (!emetteur) { var h = /^\s*(sasha|bello mio|fratelli|piccola mia)\s*:\s*invoice\b/.exec(t); if (h) emetteur = premierCite(h[1]); }
  var autre = function(etab) { return CONFIG.etablissements.filter(function(x) { return x !== etab; })[0]; };
  if (emetteur && !client) client = autre(emetteur);
  if (client && !emetteur) emetteur = autre(client);
  if (!emetteur || !client || emetteur === client) return null;
  return { emetteur: emetteur, client: client };
}

/** « Interne Piccola vers Bello » : nom de fournisseur des factures internes (fichier, journal, index) */
function libelleInterne(i) {
  var court = function(etab) { return String(etab).split(" ")[0]; };
  return "Interne " + court(i.emetteur) + " vers " + court(i.client);
}

// ---------------------------------------------------------------- Analyse complète

/**
 * Analyse pure d'une pièce. Entrée :
 *   { idx (index des fournisseurs), texte, from, subject, nomPiece, dateMail (AAAA-MM-JJ), extension, recuSur (adresse de réception) }
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
  // Un avoir imprimé avec des montants positifs reste un avoir : montant négatif (Pennylane et l'anti-doublon s'y fient)
  if (type === "avoir" && montant && parseFloat(montant) > 0) montant = "-" + montant;
  // Expéditeurs qui n'envoient jamais de factures (DocuSign, notifications Pennylane, Vinted, La Poste, JDC, Up Coop),
  // et fournisseurs dont la colonne « Établissement par défaut » dit « bon de commande »
  var typeForce = typeParExpediteur(e.from) || (f.entree && f.entree.typeForce) || null;
  if (typeForce) type = typeForce;
  // Mail de particulier (gmail, hotmail…) sans SIRET, ni TVA, ni montant : devis, CV, réservation -> journal seul
  var particulier = estParticulier(e.from) && f.source !== "identifiant";
  if (particulier && type === "autre" && !montant && !listerIdentifiants(texte).length) type = "courrier";
  // Tarifs, promotions, catalogues annoncés par l'objet du mail ou le nom de la pièce : journal seul
  if (type !== "facture" && type !== "avoir" && type !== "releve" && type !== "mandat" && estCatalogueParObjet(e.subject, e.nomPiece)) type = "catalogue";
  if (type === "autre" && texteLu && estCatalogueParObjet(e.subject, e.nomPiece)) type = "catalogue";
  var etabA = texteLu ? analyserEtablissement(texte) : { etab: null, contradictoire: false };
  var etabLu = etabA.etab, sourceEtab = etabLu ? "document" : null;
  // Document contradictoire (les deux sociétés citées) : l'adresse de réception (facture@bellomio.fr / facture@piccolamia.fr) départage
  if (!etabLu && etabA.contradictoire) { var parReception = etablissementParReception(e.recuSur); if (parReception) { etabLu = parReception; sourceEtab = "réception"; } }
  var a = {
    type: type,
    etablissement: etabLu,
    sourceEtablissement: sourceEtab,
    etablissementContradictoire: !!etabA.contradictoire && !etabLu,
    fournisseur: f.nom,
    sourceFournisseur: f.source,
    fournisseurPropose: f.propose || null,
    perso: !!f.perso,          // fournisseur « perso » de la liste : _Hors Pennylane/Perso, jamais Pennylane
    ignorer: !!f.ignorer,      // fournisseur « pas besoin » de la liste : journal seul
    numero: texteLu ? (type === "releve" ? trouverNumeroReleve(texte) || trouverNumeroFacture(texte) : trouverNumeroFacture(texte)) : null,
    date: texteLu ? trouverDateFacture(texte, e.dateMail) : null,
    dateSecours: e.dateMail,
    montant: montant,
    texteLu: texteLu,
    raisons: []
  };
  // Établissement par défaut de la liste de référence (colonne remplie par Paul), si « Bello » ou « Piccola » ; jamais sur un document contradictoire
  if (!a.etablissement && !a.etablissementContradictoire && texteLu && f.entree && f.entree.etab) {
    var defaut = etablissementParDefaut(f.entree.etab);
    if (defaut) { a.etablissement = defaut; a.sourceEtablissement = "liste"; }
  }
  a.etabParDefaut = f.entree ? String(f.entree.etab || "") : "";
  // Numéro de secours : dans le nom de la pièce jointe ("CHEVI35 Chev35 00113789.pdf")
  if (!a.numero && e.nomPiece) { var m = String(e.nomPiece).match(/\d{6,}/); if (m) a.numero = m[0]; }
  if (!texteLu) a.raisons.push("texte illisible (OCR)");
  if (texteLu && !a.etablissement) a.raisons.push(a.etablissementContradictoire ? "établissement contradictoire (les deux sociétés citées)" : "établissement inconnu" + (f.entree ? " (liste : « " + (a.etabParDefaut || "vide") + " »)" : ""));
  if ((type === "facture" || type === "avoir" || type === "ticket") && !a.montant) a.raisons.push("montant introuvable");
  if (type === "autre" && texteLu) a.raisons.push("type de document incertain");
  if (!f.nom && ["catalogue", "contrat", "notification", "courrier", "epreuve", "bon_livraison"].indexOf(type) === -1) {
    a.raisons.push(f.source === "plateforme" ? "plateforme, fournisseur non lu" : "fournisseur inconnu" + (f.propose ? " (" + f.propose + " ?)" : ""));
  }
  // Une facture de plus de 90 jours reçue aujourd'hui est suspecte (facture de 2025 dans un mail de 2026)
  if (a.date && e.dateMail && (type === "facture" || type === "avoir" || type === "ticket") && joursEntre(a.date, e.dateMail) > CONFIG.ancienneFactureJours) {
    a.raisons.push("ancienne facture (" + a.date + ")");
  }
  // Facture interne SASHA <-> FRATELLI (v4.6.4) : fournisseur « Interne X vers Y », établissement = la société facturée ;
  // les raisons « établissement contradictoire » et « plateforme, fournisseur non lu » ne s'appliquent pas
  var interne = texteLu && (type === "facture" || type === "avoir") ? detecterFactureInterne(texte) : null;
  if (interne) {
    a.interne = interne;
    a.fournisseur = libelleInterne(interne);
    a.sourceFournisseur = "interne";
    a.fournisseurPropose = null;
    a.etablissement = interne.client;
    a.sourceEtablissement = "document";
    a.etablissementContradictoire = false;
    a.raisons = a.raisons.filter(function(r) { return !/^(établissement|plateforme|fournisseur inconnu)/.test(r); });
    // Montant : sur ces factures Pennylane, « 1 329,04 € 78,36 € 1 407,40 € » se lit aussi 329,04 + 78,36 = 407,40 (lecture décollée).
    // Le plus grand triplet HT + TVA = TTC en lecture collée l'emporte.
    var collees = listerMontants(normaliserMontants(texte)).filter(function(m) { return !m.decolle && m.c > 0; }), totalInterne = 0;
    collees.forEach(function(z) { collees.forEach(function(x) { collees.forEach(function(y) { if (x !== y && tripletCoherent(x.c, y.c, z.c) && z.c > totalInterne) totalInterne = z.c; }); }); });
    if (totalInterne) a.montant = (a.montant && parseFloat(a.montant) < 0 ? "-" : "") + (totalInterne / 100).toFixed(2);
    else if (!a.montant) a.raisons.push("montant introuvable");
  }
  a.nom = construireNom(a, e.extension || ".pdf");
  return a;
}

/**
 * Colonne « Établissement par défaut » du Sheet -> nom d'établissement.
 * Variantes acceptées : bello, bello mio, sasha, bm / piccola, piccola mia, fratelli, pm. « Les deux », vide ou autre -> null.
 */
function etablissementParDefaut(valeur) {
  return interpreterEtablissement(valeur).etab;
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
 *   - perso : fournisseur « perso » de la liste, « _Hors Pennylane/Perso/<Fournisseur>/<Année> » ;
 *   - interne : facture entre SASHA et FRATELLI (v4.6.4), « _Hors Pennylane/Factures internes », jamais Pennylane ;
 *   - a_verifier : « À vérifier », à plat, la raison dans la description du fichier.
 * Règle d'or : seules les vraies factures, avoirs et tickets, avec établissement sûr, montant lu et fournisseur
 * de la liste de référence, partent vers Pennylane.
 */
function decider(a) {
  var annee = anneeDe(a);
  if (["devis", "bon_commande", "bon_livraison", "attestation", "catalogue", "contrat", "notification", "courrier", "epreuve"].indexOf(a.type) !== -1) {
    return { destination: "journal", chemin: [], archive: [], raison: a.type + " : rien à ranger" };
  }
  // Facture interne SASHA <-> FRATELLI (v4.6.4) : déjà dans Pennylane des deux côtés, rangée dans _Hors Pennylane/Factures internes
  if (a.interne) {
    var cheminInterne = [CONFIG.dossiers.horsPennylane, CONFIG.dossiers.facturesInternes];
    return { destination: "interne", chemin: cheminInterne, archive: cheminInterne, raison: a.raisons.join(", ") };
  }
  // Fournisseur « perso » de la liste (Alma, Birkenstock, Boulanger, Bhrbeton…) : rangé dans _Hors Pennylane/Perso/<Fournisseur>/<Année>,
  // jamais dans Envoi Pennylane ni dans À vérifier ; « pas besoin » : journal seul
  if (a.perso && a.fournisseur) {
    var cheminPerso = [CONFIG.dossiers.horsPennylane, CONFIG.dossiers.perso, a.fournisseur, annee];
    return { destination: "perso", chemin: cheminPerso, archive: cheminPerso, raison: "fournisseur perso (liste)" };
  }
  if (a.ignorer && a.fournisseur) return { destination: "journal", chemin: [], archive: [], raison: "fournisseur « pas besoin » (liste) : rien à ranger" };
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

/** Famille d'une pièce pour l'anti-doublon : avoir (montant négatif), relevé, mandat, sinon facture (tickets compris) */
function typeDoublon(a) {
  if (a.type === "releve" || a.type === "mandat") return a.type;
  if (a.type === "avoir" || (a.montant && parseFloat(a.montant) < 0)) return "avoir";
  return "facture";
}

/**
 * Clés de rapprochement d'une pièce : empreinte ; fournisseur + numéro (un numéro de facture est unique chez un fournisseur, quel que
 * soit l'établissement lu) ; fournisseur + établissement + type + date + montant. L'établissement et le type font partie de cette
 * dernière clé : les abonnements Pennylane de Bello et de Piccola du même jour au même prix, ou une facture et son avoir de même
 * montant, ne sont pas des doublons.
 */
function clesDoublon(a, md5) {
  var cles = [], f = cleFournisseur(a.fournisseur || ""), etab = cleFournisseur(a.etablissement || ""), type = typeDoublon(a);
  if (md5) cles.push("md5:" + md5);
  if (a.numero && f) cles.push("num:" + f + "|" + String(a.numero).toUpperCase());
  if (a.montant && f && (a.date || a.dateSecours)) cles.push("dm:" + f + "|" + etab + "|" + type + "|" + (a.date || a.dateSecours) + "|" + a.montant);
  return cles;
}

/**
 * Entrée de l'index qui correspond à la pièce, ou null. `index` = { "md5:…": entrée, "num:…": entrée, "dm:…": entrée }.
 * Deux pièces qui ont chacune un numéro ne sont des doublons que si c'est le même numéro.
 */
function trouverDoublon(index, a, md5) {
  var cles = clesDoublon(a, md5);
  for (var i = 0; i < cles.length; i++) {
    var e = index[cles[i]];
    if (!e) continue;
    if (cles[i].indexOf("dm:") === 0 && a.numero && e.numero && String(a.numero).toUpperCase() !== String(e.numero).toUpperCase()) continue;
    return e;
  }
  return null;
}

/** Reconstruit les clés d'un fichier déjà rangé à partir de son nom normalisé (pour l'indexation de l'existant) ; « (2) » toléré avant l'extension */
function analyserNomFichier(nom) {
  var m = String(nom).match(/^(\d{4}-\d{2}-\d{2}) — (.+?) — (Relevé LCR|Relevé|Facture|Mandat|Devis|Attestation)(?: n°)? ?([^—]*?)?(?: — (-?[\d.]+) EUR)?(?: \(\d+\))?\.(pdf|xml|jpg|jpeg|png)$/i);
  if (!m) return null;
  var numero = (m[4] || "").trim() || null;
  return { date: m[1], fournisseur: m[2], type: /relev/i.test(m[3]) ? "releve" : m[3].toLowerCase(), numero: numero, montant: m[5] || null };
}

