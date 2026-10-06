// ============================================================================
// Liste de référence des fournisseurs : logique PURE (testée en local).
// Le nom d'un dossier d'archive et d'un fichier vient UNIQUEMENT de cette liste,
// jamais du domaine de l'adresse mail. Un fournisseur inconnu envoie la pièce
// dans « À vérifier » et ajoute une ligne « à compléter » au Sheet (25_fournisseurs_sheet.js).
//
// Une entrée : { nom, variantes[], domaines[], identifiants[], etab, pennylaneBello, pennylanePiccola, actif }
// ============================================================================

/** Clé de comparaison : minuscules, sans accents, sans ponctuation ni espaces ("Maël Distribution" -> "maeldistribution") */
function cleFournisseur(s) { return normaliser(s).replace(/[^a-z0-9]/g, ""); }

/** Identifiant (SIRET, SIREN, TVA) réduit à ses lettres et chiffres majuscules */
function cleIdentifiant(s) { return String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, ""); }

/** Liste par défaut (CONFIG.fournisseursReference), au format des lignes du Sheet */
function listeFournisseursParDefaut() {
  return CONFIG.fournisseursReference.map(function(f) {
    return { nom: f.nom, variantes: f.variantes.slice(), domaines: f.domaines.slice(), identifiants: f.identifiants.slice(), etab: f.etab,
             pennylaneBello: "", pennylanePiccola: "", actif: f.actif || "oui", remarque: f.remarque || "" };
  });
}

/**
 * Colonne « Établissement par défaut » du Sheet, valeurs libres comprises :
 *   { etab: "Bello Mio" | "Piccola Mia" | null, lesDeux, inactif ("perso", "pas besoin"), typeForce ("bon de commande" -> "bon_commande"), inconnu }
 */
function interpreterEtablissement(valeur) {
  var v = normaliser(valeur).replace(/[^a-z0-9]/g, " ").replace(/\s+/g, " ").trim();
  var r = { etab: null, lesDeux: false, inactif: false, perso: false, ignorer: false, typeForce: null, inconnu: false, brut: String(valeur || "") };
  if (!v) return r;
  if (/^(les deux|les 2|both|tous|tous les deux|deux)$/.test(v)) { r.lesDeux = true; return r; }
  if (/^(bello( mio)?|sasha|bm)$/.test(v) || /^bello mio\b/.test(v)) { r.etab = "Bello Mio"; return r; }
  if (/^(piccola( mia)?|fratelli|i fratelli|pm)$/.test(v) || /^piccola mia\b/.test(v)) { r.etab = "Piccola Mia"; return r; }
  // « perso » : les pièces vont dans _Hors Pennylane/Perso ; « pas besoin » : journal seul
  if (/^(perso|personnel|personnelle|prive|privee)$/.test(v)) { r.inactif = true; r.perso = true; return r; }
  if (/^(pas besoin|inutile|ignorer|non)$/.test(v)) { r.inactif = true; r.ignorer = true; return r; }
  if (/^(bon de commande|bons de commande|bdc|commande|commandes)$/.test(v)) { r.typeForce = "bon_commande"; return r; }
  r.inconnu = true;
  return r;
}

/**
 * Vrai si la ligne est active : colonne Actif ni « non » ni « à compléter » (une ligne proposée par le script n'est active
 * qu'une fois relue par Paul : c'est ainsi que « Cmb », « Indy » et « Esker » étaient devenus des fournisseurs), et colonne
 * Établissement ni « perso » ni « pas besoin ».
 */
function ligneActive(f) {
  if (!f) return false;
  var a = normaliser(f.actif || "oui").trim();
  if (a === "non" || a === "0" || a === "false" || /^a\s*completer/.test(a)) return false;
  return !interpreterEtablissement(f.etab).inactif;
}

/** Vrai pour une plateforme de facturation (Crédit Mutuel, Esker, Indy, Mon Expert en Gestion…) : le domaine n'est pas le fournisseur */
function estDomainePlateforme(domaine) {
  return domainesCandidats(domaine).some(function(d) { return CONFIG.domainesPlateformes.indexOf(d) !== -1; });
}

/** Vrai pour une messagerie grand public (gmail, hotmail, wanadoo…) : seule une adresse complète identifie un fournisseur */
function estDomaineGrandPublic(domaine) {
  return CONFIG.domainesParticuliers.indexOf(String(domaine || "").toLowerCase().trim()) !== -1;
}

/**
 * Index de recherche construit une fois par liste : clés -> entrée.
 *   parCle (nom et variantes), parDomaine, parAdresse (adresses complètes), parIdentifiant.
 * Une ligne active l'emporte toujours sur une ligne inactive ; deux lignes actives avec la même clé : la première
 * gagne et un avertissement est consigné dans idx.avertissements (écrit dans le journal par fournisseursIndex()).
 * Un domaine grand public seul (wanadoo.fr) est ignoré avec un avertissement : il attribuerait tout expéditeur à ce fournisseur.
 */
function indexerFournisseurs(liste) {
  var idx = { parCle: {}, parDomaine: {}, parAdresse: {}, parIdentifiant: {}, liste: liste, avertissements: [] };
  var poser = function(table, cle, f, libelle) {
    if (!cle) return;
    var actuel = table[cle];
    if (!actuel) { table[cle] = f; return; }
    if (actuel === f) return;
    var aActif = ligneActive(actuel), fActif = ligneActive(f);
    if (fActif && !aActif) { table[cle] = f; return; }           // l'actif remplace l'inactif
    if (fActif && aActif) idx.avertissements.push("Fournisseurs : " + libelle + " « " + cle + " » partagé par « " + actuel.nom + " » et « " + f.nom + "» : la première ligne est gardée");
  };
  liste.forEach(function(f) {
    if (!f || !f.nom) return;
    var inter = interpreterEtablissement(f.etab);
    f.typeForce = inter.typeForce;
    if (inter.inactif) f.actif = "non";
    if (inter.inconnu) idx.avertissements.push("Fournisseurs : « " + f.nom + " » a une valeur d'établissement non reconnue (« " + inter.brut + " »), traitée comme vide");
    poser(idx.parCle, cleFournisseur(f.nom), f, "nom");
    (f.variantes || []).forEach(function(v) { poser(idx.parCle, cleFournisseur(v), f, "variante"); });
    (f.domaines || []).forEach(function(d) {
      var k = String(d).toLowerCase().trim();
      if (!k) return;
      if (k.indexOf("@") !== -1) { poser(idx.parAdresse, k, f, "adresse"); return; }
      if (estDomaineGrandPublic(k)) { idx.avertissements.push("Fournisseurs : « " + f.nom + " » utilise le domaine grand public « " + k + "» seul : ignoré, mettre l'adresse complète"); return; }
      poser(idx.parDomaine, k, f, "domaine");
    });
    (f.identifiants || []).forEach(function(i) { poser(idx.parIdentifiant, cleIdentifiant(i), f, "identifiant"); });
  });
  return idx;
}

/** Nom canonique d'un ancien nom de dossier ou d'une variante ("Maeldistribution" -> "Maël Distribution"), ou null (inconnu ou inactif) */
function nomCanonique(idx, nom) {
  var f = idx.parCle[cleFournisseur(nom)];
  return f && ligneActive(f) ? f.nom : null;
}

/** Entrée (active ou non) correspondant à un nom de dossier, ou null : sert à repérer les fournisseurs inactifs de l'archive */
function entreeParNom(idx, nom) {
  return idx.parCle[cleFournisseur(nom)] || null;
}

/** Domaine d'une adresse ("Paul <x@mail.sumup.com>" -> "mail.sumup.com") */
function domaineDe(from) {
  var m = String(from || "").toLowerCase().match(/@([a-z0-9.\-]+)/);
  return m ? m[1] : null;
}

/** Candidats de domaine, du plus précis au plus large : "mail.sumup.com" -> ["mail.sumup.com", "sumup.com"] */
function domainesCandidats(domaine) {
  if (!domaine) return [];
  var parts = domaine.split("."), out = [];
  for (var i = 0; i < parts.length - 1; i++) out.push(parts.slice(i).join("."));
  return out;
}

/** Nom proposé pour un fournisseur inconnu, tiré du domaine en sautant les sous-domaines génériques ("facture@mail.sumup.com" -> "Sumup") */
function nomProposeDepuisDomaine(from) {
  var domaine = domaineDe(from);
  if (!domaine) return null;
  var parts = domaine.split(".");
  if (/^\d+$/.test(parts[0])) return null;
  var nom = parts[parts.length - 2] || parts[0];
  for (var k = 0; k < parts.length - 1; k++) {
    if (CONFIG.sousDomainesGeneriques.indexOf(parts[k]) === -1) { nom = parts[k]; break; }
  }
  return nom.charAt(0).toUpperCase() + nom.slice(1);
}

/** Identifiants (TVA FR, SIRET 14 chiffres, SIREN 9 chiffres) présents dans un texte, hors ceux de nos deux sociétés */
function listerIdentifiants(texte) {
  var t = String(texte || "").replace(/ /g, " "), out = [], notres = [];
  CONFIG.etablissements.forEach(function(e) { notres.push(cleIdentifiant(CONFIG.marqueurs[e].tva)); notres.push(CONFIG.marqueurs[e].siren); });
  // les nôtres : TVA, SIREN, et tout SIRET qui commence par notre SIREN (« 91321738600014 » s'était retrouvé sur la ligne Cmb)
  var sirenDe = function(k) { return /^FR\d{11}$/.test(k) ? k.slice(4) : k.slice(0, 9); };
  var ajouter = function(k) { if (k && notres.indexOf(k) === -1 && notres.indexOf(sirenDe(k)) === -1 && out.indexOf(k) === -1) out.push(k); };
  var m, reTva = /\bFR\s?\d{2}(?:\s?\d{3}){3}\b/gi;
  while ((m = reTva.exec(t)) !== null) ajouter(cleIdentifiant(m[0]));
  var reSiret = /(?:siret|siren|rcs)\s*:?\s*[A-Za-z\s]{0,12}?((?:\d\s?){9}(?:(?:\d\s?){5})?)\b/gi;
  while ((m = reSiret.exec(t)) !== null) { var d = m[1].replace(/\s/g, ""); if (d.length === 9 || d.length === 14) { ajouter(d); if (d.length === 14) ajouter(d.slice(0, 9)); } }
  return out;
}

/**
 * Nom ou variante de la liste présent, en entier et en mots entiers, dans un texte : { entree, cle } (le plus long) ou null.
 *   - `minimum` : longueur minimale de la clé (sans espaces) ; par défaut 6 (« Apple » dans « Apple Pay », « masse » : jamais sur 5 lettres)
 *   - seules les entrées actives comptent.
 */
function chercherNomDans(idx, texte, minimum) {
  var min = minimum || 6;
  var texteNorm = " " + normaliser(texte || "").replace(/[^a-z0-9]+/g, " ") + " ";
  var compact = texteNorm.replace(/ /g, "");
  var meilleur = null, longueur = 0;
  for (var k in idx.parCle) {
    if (k.length < min) continue;
    var f = idx.parCle[k];
    if (!ligneActive(f)) continue;
    // nom complet : « mael distribution » ou « maeldistribution », jamais une partie
    var phrases = [];
    [f.nom].concat(f.variantes || []).forEach(function(v) { if (cleFournisseur(v) === k) phrases.push(" " + normaliser(v).replace(/[^a-z0-9]+/g, " ").trim() + " "); });
    var trouve = phrases.some(function(p) { return texteNorm.indexOf(p) !== -1; })
      || (k.length >= 8 && compact.indexOf(k) !== -1 && texteNorm.indexOf(" " + k + " ") !== -1);
    if (!trouve && texteNorm.indexOf(" " + k + " ") !== -1) trouve = true;
    if (trouve && k.length > longueur) { meilleur = f; longueur = k.length; }
  }
  return meilleur ? { entree: meilleur, cle: longueur } : null;
}

/**
 * Résolution d'un fournisseur : { entree, source } ou null ({ source: "plateforme" } si l'expéditeur est une plateforme sans fournisseur lisible).
 *  1) identifiant (TVA, SIRET, SIREN) lu sur le document ;
 *  2) adresse complète, puis domaine de l'expéditeur (sous-domaine puis domaine) — jamais pour une messagerie grand public
 *     (adresse complète seulement) ni pour une plateforme de facturation (CONFIG.domainesPlateformes) ;
 *  3) nom complet ou variante dans l'objet ou dans le nom affiché de l'expéditeur (6 caractères au moins ; 4 dans le nom affiché) ;
 *  4) plateforme : nom complet lu dans le document lui-même (3 000 premiers caractères, 5 caractères au moins : « Sysco ») ;
 *  5) pour un transfert interne (Pierre, Paul) : nom ou variante présent dans l'objet.
 * Les entrées inactives ou « à compléter » ne sont jamais retenues, sauf les lignes « perso » et « pas besoin » (renvoyées avec
 * perso: true / ignorer: true : _Hors Pennylane/Perso, ou journal seul).
 */
function resoudreFournisseur(idx, e) {
  var actif = function(f) { return ligneActive(f); };
  // ligne inactive « perso » (Alma, Birkenstock, Boulanger…) ou « pas besoin » : retenue avec son étiquette, la pièce ne va jamais vers Pennylane
  var retenir = function(f, source) {
    if (!f) return null;
    if (actif(f)) return { entree: f, source: source };
    var inter = interpreterEtablissement(f.etab);
    if (inter.perso) return { entree: f, source: source, perso: true };
    if (inter.ignorer) return { entree: f, source: source, ignorer: true };
    return null;
  };
  var ids = listerIdentifiants(e.texte);
  for (var i = 0; i < ids.length; i++) { var ri = retenir(idx.parIdentifiant[ids[i]], "identifiant"); if (ri) return ri; }
  var from = String(e.from || "").toLowerCase();
  var adresse = (from.match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+/) || [""])[0];
  var domaine = domaineDe(from);
  var interne = CONFIG.transfertsAutorises.some(function(x) { return from.indexOf(x) !== -1; }) || CONFIG.adressesInternes.some(function(x) { return from.indexOf(x) !== -1; });
  var plateforme = !interne && estDomainePlateforme(domaine);
  if (!interne && !plateforme) {
    // adresse complète (obligatoire pour gmail, hotmail, wanadoo… : SDPF écrit depuis sdpfcompta@hotmail.com)
    var fa = adresse && (idx.parAdresse[adresse] || idx.parDomaine[adresse]);
    var ra = retenir(fa, "adresse");
    if (ra) return ra;
    if (!estDomaineGrandPublic(domaine)) {
      var cands = domainesCandidats(domaine);
      for (var j = 0; j < cands.length; j++) { if (estDomaineGrandPublic(cands[j])) continue; var rd = retenir(idx.parDomaine[cands[j]], "domaine"); if (rd) return rd; }
    }
  }
  // nom complet dans l'objet (6 caractères au moins) ; dans le nom affiché de l'expéditeur (« Metro <noreply@…> ») dès 4 caractères,
  // sans la partie adresse (« Wanadoo » est une variante de Self Stockage, quelqun@wanadoo.fr n'est pas Self Stockage)
  var dansObjet = chercherNomDans(idx, e.subject || "", 6);
  if (dansObjet) return { entree: dansObjet.entree, source: "nom" };
  if (!interne && !plateforme) {
    var affiche = String(e.from || "").replace(/<[^>]*>/, " ").replace(/[a-z0-9._%+\-]+@[a-z0-9.\-]+/gi, " ");
    var dansFrom = chercherNomDans(idx, affiche, 4);
    if (dansFrom) return { entree: dansFrom.entree, source: "nom" };
  }
  if (plateforme) {
    var dansDoc = chercherNomDans(idx, String(e.texte || "").slice(0, 3000), 5);
    if (dansDoc) return { entree: dansDoc.entree, source: "nom (document)" };
    return { entree: null, source: "plateforme" };
  }
  return null;
}

/**
 * Identifiants du bloc émetteur d'une facture, pour compléter la liste : jamais les nôtres (listerIdentifiants les écarte),
 * jamais ceux déjà portés par une autre ligne (`dejaPris` : { identifiant: nom de ligne }), et un seul groupe (SIREN, SIRET, TVA
 * d'une même société) : celui écrit le plus près du nom du fournisseur (`noms`), sinon le premier du document.
 * Renvoie { identifiants: [...], ecartes: [{ id, ligne }] }.
 */
function identifiantsEmetteur(texte, noms, dejaPris) {
  var t = String(texte || "").replace(/\u00a0/g, " "), out = { identifiants: [], ecartes: [] };
  var ids = listerIdentifiants(t);
  if (!ids.length) return out;
  var siren = function(id) { return /^FR\d{11}$/.test(id) ? id.slice(4) : id.slice(0, 9); };
  var position = function(id) {
    var motif = /^FR/.test(id) ? "FR\\s?" + id.slice(2, 4) + "\\s?" + id.slice(4).replace(/(\d{3})(?=\d)/g, "$1\\s?") : id.replace(/(\d{3})(?=\d)/g, "$1\\s?");
    var m = t.match(new RegExp(motif, "i"));
    return m ? m.index : t.length;
  };
  var groupes = {};
  ids.forEach(function(id) {
    if (dejaPris && dejaPris[id]) { out.ecartes.push({ id: id, ligne: dejaPris[id] }); return; }
    var g = siren(id);
    if (!groupes[g]) groupes[g] = { ids: [], pos: t.length };
    groupes[g].ids.push(id);
    groupes[g].pos = Math.min(groupes[g].pos, position(id));
  });
  var cles = Object.keys(groupes);
  if (!cles.length) return out;
  var posNom = -1, tn = normaliser(t);
  (noms || []).forEach(function(n) { var k = normaliser(n).trim(); if (k.length >= 4) { var p = tn.indexOf(k); if (p !== -1 && (posNom === -1 || p < posNom)) posNom = p; } });
  cles.sort(function(a, b) {
    var da = posNom === -1 ? groupes[a].pos : Math.abs(groupes[a].pos - posNom), db = posNom === -1 ? groupes[b].pos : Math.abs(groupes[b].pos - posNom);
    return da - db;
  });
  out.identifiants = groupes[cles[0]].ids;
  return out;
}

/** Ligne « à compléter » pour un fournisseur inconnu (proposition de nom, domaine, identifiants lus) */
function ligneACompleter(e) {
  var ids = listerIdentifiants(e.texte), domaine = domaineDe(e.from);
  // messagerie grand public : on propose l'adresse complète, jamais le domaine seul
  var adresse = (String(e.from || "").toLowerCase().match(/[a-z0-9._%+\-]+@[a-z0-9.\-]+/) || [""])[0];
  var domaines = !domaine ? [] : estDomaineGrandPublic(domaine) ? (adresse ? [adresse] : []) : [domaine];
  var nom = estDomaineGrandPublic(domaine) ? (adresse ? adresse.split("@")[0] : "?") : (nomProposeDepuisDomaine(e.from) || "?");
  return { nom: nom, variantes: [], domaines: domaines, identifiants: ids, etab: "",
           pennylaneBello: "", pennylanePiccola: "", actif: "à compléter", remarque: "objet : " + (e.subject || "") };
}

// ---- Conversion lignes de Sheet <-> entrées

var COLONNES_FOURNISSEURS = ["Nom", "Variantes", "Domaines mail", "SIRET / TVA", "Établissement par défaut", "ID Pennylane Bello", "ID Pennylane Piccola", "Actif", "Remarque"];

function decouperListe(v) { return String(v || "").split(/[;,\n]/).map(function(x) { return x.trim(); }).filter(Boolean); }

function entreeDepuisLigne(r) {
  return { nom: String(r[0] || "").trim(), variantes: decouperListe(r[1]), domaines: decouperListe(r[2]).map(function(d) { return d.toLowerCase(); }),
           identifiants: decouperListe(r[3]), etab: String(r[4] || "").trim(), pennylaneBello: String(r[5] || ""), pennylanePiccola: String(r[6] || ""),
           actif: String(r[7] || "oui").trim(), remarque: String(r[8] || "") };
}

function ligneDepuisEntree(f) {
  return [f.nom, (f.variantes || []).join("; "), (f.domaines || []).join("; "), (f.identifiants || []).join("; "), f.etab || "", f.pennylaneBello || "", f.pennylanePiccola || "", f.actif || "oui", f.remarque || ""];
}
