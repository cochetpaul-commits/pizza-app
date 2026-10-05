// ============================================================================
// Journal : un Google Sheet « Journal factures » dans « Factures iFratelli ».
//   - onglet « Journal »          : une ligne par pièce jointe traitée (ou par mail sans pièce jointe repéré)
//   - onglet « Messages traités » : identifiants Gmail déjà vus (l'unité de travail est le message, pas le fil)
//   - onglet « Index »            : empreinte et clés métier de chaque fichier rangé (anti-doublon), dossier d'archive prévu
//   - onglet « Simulation »       : rapport du rattrapage en mode simulation
//   - onglet « Réorganisation »   : plan de reorganiserArchive (simulation), puis exécution (réel)
// Les écritures sont groupées en mémoire et vidées par journalVider() (une seule écriture Sheet par lot).
// ============================================================================

var COLONNES_JOURNAL = ["Horodatage", "Date mail", "Expéditeur", "Reçu sur", "Objet", "Pièce", "Type", "Établissement", "Fournisseur", "Numéro", "Date facture", "Montant", "Destination", "Chemin", "Raison", "Lien fichier", "Lien mail", "Message id", "Mode"];
var COLONNES_INDEX = ["Fichier id", "MD5", "Établissement", "Fournisseur", "Numéro", "Date", "Montant", "Nom", "Chemin", "Ajouté le", "Archive prévue", "Dans Envoi depuis"];
var COLONNES_REORG = ["Fichier id", "Ancien chemin", "Nouveau chemin", "Nom", "Méthode", "Statut", "Horodatage", "Nouveau nom"];
var COLONNES_TYPES = ["Fichier id", "Chemin", "Nom", "Type actuel", "Type attendu", "Statut", "Horodatage"];

var _journal = { classeur: null, tampon: { Journal: [], "Messages traités": [], Index: [], Simulation: [], "Réorganisation": [], Types: [] }, traites: null, index: null, parId: null, lignesIndex: {} };

function journalClasseur() {
  if (_journal.classeur) return _journal.classeur;
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  var it = racine.getFilesByName(CONFIG.journalNom), classeur;
  if (it.hasNext()) classeur = SpreadsheetApp.open(it.next());
  else {
    classeur = SpreadsheetApp.create(CONFIG.journalNom);
    DriveApp.getFileById(classeur.getId()).moveTo(racine);
  }
  journalOnglet(classeur, "Journal", COLONNES_JOURNAL);
  journalOnglet(classeur, "Messages traités", ["Message id", "Traité le", "Mode"]);
  journalOnglet(classeur, "Index", COLONNES_INDEX);
  journalOnglet(classeur, "Simulation", COLONNES_JOURNAL);
  journalOnglet(classeur, "Réorganisation", COLONNES_REORG);
  journalOnglet(classeur, "Types", COLONNES_TYPES);
  var defaut = classeur.getSheetByName("Feuille 1") || classeur.getSheetByName("Sheet1");
  if (defaut && classeur.getSheets().length > 1) classeur.deleteSheet(defaut);
  _journal.classeur = classeur;
  return classeur;
}

function journalOnglet(classeur, nom, colonnes) {
  var f = classeur.getSheetByName(nom);
  if (!f) { f = classeur.insertSheet(nom); f.appendRow(colonnes); f.setFrozenRows(1); }
  if (nom === "Index" && !_journal.indexPrepare) {
    _journal.indexPrepare = true;
    // colonnes ajoutées après coup (« Dans Envoi depuis », v4.6) et format texte : « 00113789 » ne devient pas 113789
    if (f.getLastColumn && f.getLastColumn() < colonnes.length) for (var c = f.getLastColumn() + 1; c <= colonnes.length; c++) f.getRange(1, c).setValue(colonnes[c - 1]);
    try { f.getRange(1, 1, Math.max(f.getMaxRows ? f.getMaxRows() : 5000, 2), colonnes.length).setNumberFormat("@"); } catch (e) { Logger.log("Format texte de l'Index non posé : " + e); }
  }
  return f;
}

/** Identifiants des messages déjà traités (chargés une fois par exécution) */
function journalMessagesTraites() {
  if (_journal.traites) return _journal.traites;
  var f = journalOnglet(journalClasseur(), "Messages traités", ["Message id", "Traité le", "Mode"]);
  var n = f.getLastRow(), set = {};
  if (n > 1) f.getRange(2, 1, n - 1, 1).getValues().forEach(function(r) { if (r[0]) set[String(r[0])] = true; });
  _journal.traites = set;
  return set;
}

function journalMarquerTraite(messageId, mode) {
  journalMessagesTraites()[messageId] = true;
  _journal.tampon["Messages traités"].push([messageId, new Date(), mode || "reel"]);
}

/** Index anti-doublon : { "md5:…": entrée, "num:…": entrée, "dm:…": entrée } ; entrée = { fichierId, md5, etablissement, fournisseur, numero, date, montant, nom, chemin, archive } */
function indexCharger() {
  if (_journal.index) return _journal.index;
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  var n = f.getLastRow(), index = {}, parId = {};
  if (n > 1) f.getRange(2, 1, n - 1, COLONNES_INDEX.length).getValues().forEach(function(r, i) {
    var e = { fichierId: r[0], md5: r[1], etablissement: r[2], fournisseur: r[3], numero: r[4] ? String(r[4]) : null, date: r[5] ? dateIso(r[5]) : null,
              montant: r[6] !== "" && r[6] !== null ? montantTexte(r[6]) : null, nom: r[7], chemin: r[8], archive: r[10] || "", arriveEnvoi: r[11] ? dateIso(r[11]) : null };
    indexInserer(index, e);
    parId[e.fichierId] = e;
    _journal.lignesIndex[e.fichierId] = i + 2;
  });
  _journal.index = index;
  _journal.parId = parId;
  return index;
}

/** Entrée de l'index d'un fichier par son identifiant Drive, ou null */
function indexParId(fichierId) { indexCharger(); return _journal.parId[fichierId] || null; }

function indexInserer(index, e) {
  var n = e.nom ? analyserNomFichier(e.nom) : null;
  var a = { fournisseur: e.fournisseur, etablissement: e.etablissement, numero: e.numero, date: e.date, dateSecours: e.date, montant: e.montant, type: e.type || (n ? n.type : null) };
  clesDoublon(a, e.md5).forEach(function(k) { if (!index[k]) index[k] = e; });
}

/** Ajoute un fichier rangé à l'index (mémoire + Sheet) */
function indexAjouter(e) {
  indexInserer(indexCharger(), e);
  if (e.fichierId) _journal.parId[e.fichierId] = e;
  _journal.tampon.Index.push([e.fichierId, e.md5 || "", e.etablissement || "", e.fournisseur || "", e.numero || "", e.date || "", e.montant || "", e.nom || "", e.chemin || "", new Date(), e.archive || "", e.arriveEnvoi || ""]);
}

/**
 * Ligne du Sheet « Index » d'un fichier, cherchée par identifiant (un tri de l'onglet ne trompe pas l'écriture), ou 0.
 * Les lignes écrites pendant l'exécution sont dans le tampon tant que journalVider n'a pas été appelé : on le vide d'abord.
 */
function indexLigneDe(fichierId) {
  if (_journal.tampon.Index.length) journalVider();
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  var plage = f.getRange(1, 1, Math.max(f.getLastRow(), 1), 1);
  if (plage.createTextFinder) {
    try {
      var cellule = plage.createTextFinder(String(fichierId)).matchEntireCell(true).findNext();
      if (cellule) return cellule.getRow();
    } catch (e) { Logger.log("Recherche dans l'Index impossible (" + e + ") : position mémorisée"); }
  }
  return _journal.lignesIndex[fichierId] || 0;
}

function indexEcrire(fichierId, colonne, valeur) {
  var ligne = indexLigneDe(fichierId);
  if (ligne) journalOnglet(journalClasseur(), "Index", COLONNES_INDEX).getRange(ligne, colonne).setValue(valeur);
  return ligne;
}

/** Met à jour le chemin d'un fichier déplacé (mémoire et Sheet) */
function indexDeplacer(fichierId, chemin) {
  var e = indexParId(fichierId);
  if (e) e.chemin = chemin;
  indexEcrire(fichierId, 9, chemin);
}

/**
 * Met à jour un fichier renommé (mémoire et Sheet) : nom, et fournisseur, numéro, date, montant relus dans le nouveau nom
 * (« Wanadoo » -> « Self Stockage »), avec de nouvelles clés anti-doublon.
 */
function indexRenommer(fichierId, nom) {
  var e = indexParId(fichierId), n = analyserNomFichier(nom), idx = indexCharger();
  if (e) {
    e.nom = nom;
    if (n) { e.fournisseur = n.fournisseur; e.numero = n.numero; e.date = n.date; e.montant = n.montant; indexInserer(idx, e); }
  }
  var ligne = indexLigneDe(fichierId);
  if (!ligne) return;
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  f.getRange(ligne, 8).setValue(nom);
  if (n) f.getRange(ligne, 4, 1, 4).setValues([[n.fournisseur, n.numero || "", n.date, n.montant || ""]]);
}

/** Un fichier arrivé dans « Envoi Pennylane » (déposé par le script, ou déplacé à la main) : chemin, archive prévue et date d'arrivée */
function indexMarquerEnvoi(fichierId, chemin, archive, date) {
  var e = indexParId(fichierId), iso = dateIso(date || new Date());
  if (e) { e.chemin = chemin; if (archive) e.archive = archive; e.arriveEnvoi = iso; }
  var ligne = indexLigneDe(fichierId);
  if (!ligne) return;
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  f.getRange(ligne, 9).setValue(chemin);
  if (archive) f.getRange(ligne, 11).setValue(archive);
  f.getRange(ligne, 12).setValue(iso);
}

/** Vide l'onglet « Index » (reindexerArchive) : mémoire et Sheet */
function indexVider() {
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  if (f.getLastRow() > 1) f.deleteRows(2, f.getLastRow() - 1);
  _journal.index = {}; _journal.parId = {}; _journal.lignesIndex = {}; _journal.tampon.Index = [];
}

/** Une ligne de journal (objet avec les clés de COLONNES_JOURNAL, en minuscules sans accents) */
function journalAjouter(l, simulation) {
  var ligne = [new Date(), l.dateMail || "", l.expediteur || "", l.recuSur || "", l.objet || "", l.piece || "", l.type || "", l.etablissement || "", l.fournisseur || "",
               l.numero || "", l.dateFacture || "", l.montant || "", l.destination || "", l.chemin || "", l.raison || "", l.lienFichier || "", l.lienMail || "", l.messageId || "",
               simulation ? "simulation" : "reel"];
  _journal.tampon[simulation ? "Simulation" : "Journal"].push(ligne);
}

/** Lignes du journal des `jours` derniers jours : [{ horodatage, dateMail, expediteur, objet, destination, lienMail }] */
function journalLignesRecentes(jours) {
  var f = journalOnglet(journalClasseur(), "Journal", COLONNES_JOURNAL), n = f.getLastRow(), limite = Date.now() - jours * 86400000, out = [];
  if (n < 2) return out;
  var depart = Math.max(2, n - 2000);
  f.getRange(depart, 1, n - depart + 1, COLONNES_JOURNAL.length).getValues().forEach(function(r) {
    var h = r[0] && typeof r[0].getTime === "function" ? r[0].getTime() : Date.parse(r[0]);
    if (!h || h < limite) return;
    out.push({ horodatage: r[0], dateMail: dateIso(r[1]), expediteur: r[2], objet: r[4], destination: r[12], lienMail: r[16] });
  });
  return out;
}

/** Avertissement (liste de référence incohérente, valeur non reconnue…) : une ligne de journal, destination « avertissement » */
function journalAvertir(texte) {
  journalAjouter({ destination: "avertissement", raison: texte }, false);
}

/** Ligne du plan de réorganisation : { fichierId, ancien, nouveau, nom, methode, statut, nouveauNom } */
function reorgAjouter(r) {
  _journal.tampon["Réorganisation"].push([r.fichierId, r.ancien, r.nouveau, r.nom, r.methode, r.statut, new Date(), r.nouveauNom || ""]);
}

/** Lignes du plan de réorganisation : [{ ligne, fichierId, ancien, nouveau, nom, methode, statut }] */
function reorgLire() {
  var f = journalOnglet(journalClasseur(), "Réorganisation", COLONNES_REORG), n = f.getLastRow();
  if (n < 2) return [];
  // L'onglet a pu être créé en v4.1 sans la colonne « Nouveau nom » : on l'ajoute au besoin
  if (f.getLastColumn && f.getLastColumn() < COLONNES_REORG.length) f.getRange(1, COLONNES_REORG.length).setValue(COLONNES_REORG[COLONNES_REORG.length - 1]);
  return f.getRange(2, 1, n - 1, COLONNES_REORG.length).getValues().map(function(r, i) {
    return { ligne: i + 2, fichierId: r[0], ancien: r[1], nouveau: r[2], nom: r[3], methode: r[4], statut: r[5], nouveauNom: r[7] || "" };
  });
}

function reorgStatut(ligne, statut) {
  var f = journalOnglet(journalClasseur(), "Réorganisation", COLONNES_REORG);
  f.getRange(ligne, 6).setValue(statut);
  f.getRange(ligne, 7).setValue(new Date());
}

/** Ligne du plan de réparation des types MIME : { fichierId, chemin, nom, actuel, attendu, statut } */
function typesAjouter(r) {
  _journal.tampon.Types.push([r.fichierId, r.chemin, r.nom, r.actuel, r.attendu, r.statut, new Date()]);
}

function typesLire() {
  var f = journalOnglet(journalClasseur(), "Types", COLONNES_TYPES), n = f.getLastRow();
  if (n < 2) return [];
  return f.getRange(2, 1, n - 1, COLONNES_TYPES.length).getValues().map(function(r, i) {
    return { ligne: i + 2, fichierId: r[0], chemin: r[1], nom: r[2], actuel: r[3], attendu: r[4], statut: r[5] };
  });
}

function typesStatut(ligne, statut) {
  var f = journalOnglet(journalClasseur(), "Types", COLONNES_TYPES);
  f.getRange(ligne, 6).setValue(statut);
  f.getRange(ligne, 7).setValue(new Date());
}

/** Dernière passe horaire terminée (curseur) : Date ou null */
function curseurPasseLire() {
  var v = PropertiesService.getScriptProperties().getProperty("curseur.passe");
  return v ? new Date(v) : null;
}

function curseurPasseEcrire(date) {
  PropertiesService.getScriptProperties().setProperty("curseur.passe", date.toISOString());
}

/** Écrit tout ce qui est en attente (à appeler en fin de passe et avant la limite de temps) */
function journalVider() {
  var classeur = journalClasseur();
  for (var nom in _journal.tampon) {
    var lignes = _journal.tampon[nom];
    if (!lignes.length) continue;
    var f = classeur.getSheetByName(nom);
    var premiere = f.getLastRow() + 1;
    f.getRange(premiere, 1, lignes.length, lignes[0].length).setValues(lignes);
    if (nom === "Index") lignes.forEach(function(l, i) { if (l[0]) _journal.lignesIndex[l[0]] = premiere + i; });
    _journal.tampon[nom] = [];
  }
}

function journalViderSimulation() {
  var f = journalOnglet(journalClasseur(), "Simulation", COLONNES_JOURNAL);
  if (f.getLastRow() > 1) f.deleteRows(2, f.getLastRow() - 1);
}

/** AAAA-MM-JJ d'une Date (ou d'une chaîne qui commence par une date ISO) */
function dateIso(v) {
  if (v && typeof v.getTime === "function") return Utilities.formatDate(v, "Europe/Paris", "yyyy-MM-dd");
  return String(v).slice(0, 10);
}

function montantTexte(v) {
  if (typeof v === "number") return v.toFixed(2);
  return String(v);
}
