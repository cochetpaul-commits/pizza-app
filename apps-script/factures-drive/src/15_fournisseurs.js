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
             pennylaneBello: "", pennylanePiccola: "", actif: "oui" };
  });
}

/** Index de recherche construit une fois par liste : clés -> entrée */
function indexerFournisseurs(liste) {
  var idx = { parCle: {}, parDomaine: {}, parIdentifiant: {}, liste: liste };
  liste.forEach(function(f) {
    if (!f.nom) return;
    idx.parCle[cleFournisseur(f.nom)] = f;
    (f.variantes || []).forEach(function(v) { var k = cleFournisseur(v); if (k && !idx.parCle[k]) idx.parCle[k] = f; });
    (f.domaines || []).forEach(function(d) { var k = String(d).toLowerCase().trim(); if (k) idx.parDomaine[k] = f; });
    (f.identifiants || []).forEach(function(i) { var k = cleIdentifiant(i); if (k) idx.parIdentifiant[k] = f; });
  });
  return idx;
}

/** Nom canonique d'un ancien nom de dossier ou d'une variante ("Maeldistribution" -> "Maël Distribution"), ou null */
function nomCanonique(idx, nom) {
  var f = idx.parCle[cleFournisseur(nom)];
  return f ? f.nom : null;
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
  var ajouter = function(k) { if (k && notres.indexOf(k) === -1 && out.indexOf(k) === -1) out.push(k); };
  var m, reTva = /\bFR\s?\d{2}(?:\s?\d{3}){3}\b/gi;
  while ((m = reTva.exec(t)) !== null) ajouter(cleIdentifiant(m[0]));
  var reSiret = /(?:siret|siren|rcs)\s*:?\s*[A-Za-z\s]{0,12}?((?:\d\s?){9}(?:(?:\d\s?){5})?)\b/gi;
  while ((m = reSiret.exec(t)) !== null) { var d = m[1].replace(/\s/g, ""); if (d.length === 9 || d.length === 14) { ajouter(d); if (d.length === 14) ajouter(d.slice(0, 9)); } }
  return out;
}

/**
 * Résolution d'un fournisseur : { entree, source } ou null.
 *  1) identifiant (TVA, SIRET, SIREN) lu sur le document ;
 *  2) domaine de l'expéditeur (sous-domaine puis domaine) ;
 *  3) nom ou variante présent dans l'objet ou l'expéditeur (mots entiers, 4 caractères au moins) ;
 *  4) pour un transfert interne (Pierre, Paul) : nom ou variante présent dans l'objet.
 * Les entrées « non » (inactives) ne sont jamais retenues.
 */
function resoudreFournisseur(idx, e) {
  var actif = function(f) { return f && String(f.actif || "oui").toLowerCase() !== "non"; };
  var ids = listerIdentifiants(e.texte);
  for (var i = 0; i < ids.length; i++) { var fi = idx.parIdentifiant[ids[i]]; if (actif(fi)) return { entree: fi, source: "identifiant" }; }
  var from = String(e.from || "").toLowerCase();
  var interne = CONFIG.transfertsAutorises.some(function(x) { return from.indexOf(x) !== -1; }) || CONFIG.adressesInternes.some(function(x) { return from.indexOf(x) !== -1; });
  if (!interne) {
    var cands = domainesCandidats(domaineDe(from));
    for (var j = 0; j < cands.length; j++) { var fd = idx.parDomaine[cands[j]]; if (actif(fd)) return { entree: fd, source: "domaine" }; }
    if (idx.parDomaine[from.replace(/^.*<|>.*$/g, "")] && actif(idx.parDomaine[from.replace(/^.*<|>.*$/g, "")])) return { entree: idx.parDomaine[from.replace(/^.*<|>.*$/g, "")], source: "domaine" };
  }
  var champ = cleFournisseur(" " + (e.subject || "") + " " + (interne ? "" : (e.from || "")) + " ");
  var texteNorm = " " + normaliser((e.subject || "") + " " + (interne ? "" : (e.from || ""))).replace(/[^a-z0-9]+/g, " ") + " ";
  var meilleur = null, longueur = 0;
  for (var k in idx.parCle) {
    if (k.length < 4) continue;
    var f = idx.parCle[k];
    if (!actif(f)) continue;
    var mot = " " + k.replace(/([a-z])(\d)/g, "$1 $2") + " ";
    var trouve = texteNorm.indexOf(" " + k + " ") !== -1 || texteNorm.replace(/ /g, "").indexOf(k) !== -1 && champ.indexOf(k) !== -1 && k.length >= 6;
    if (!trouve && texteNorm.indexOf(mot) !== -1) trouve = true;
    if (trouve && k.length > longueur) { meilleur = f; longueur = k.length; }
  }
  if (meilleur) return { entree: meilleur, source: "nom" };
  return null;
}

/** Ligne « à compléter » pour un fournisseur inconnu (proposition de nom, domaine, identifiants lus) */
function ligneACompleter(e) {
  var ids = listerIdentifiants(e.texte);
  return { nom: nomProposeDepuisDomaine(e.from) || "?", variantes: [], domaines: domaineDe(e.from) ? [domaineDe(e.from)] : [], identifiants: ids, etab: "",
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
