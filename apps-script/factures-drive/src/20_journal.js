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
var COLONNES_INDEX = ["Fichier id", "MD5", "Établissement", "Fournisseur", "Numéro", "Date", "Montant", "Nom", "Chemin", "Ajouté le", "Archive prévue"];
var COLONNES_REORG = ["Fichier id", "Ancien chemin", "Nouveau chemin", "Nom", "Méthode", "Statut", "Horodatage"];

var _journal = { classeur: null, tampon: { Journal: [], "Messages traités": [], Index: [], Simulation: [], "Réorganisation": [] }, traites: null, index: null, parId: null, lignesIndex: {} };

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
  var defaut = classeur.getSheetByName("Feuille 1") || classeur.getSheetByName("Sheet1");
  if (defaut && classeur.getSheets().length > 1) classeur.deleteSheet(defaut);
  _journal.classeur = classeur;
  return classeur;
}

function journalOnglet(classeur, nom, colonnes) {
  var f = classeur.getSheetByName(nom);
  if (!f) { f = classeur.insertSheet(nom); f.appendRow(colonnes); f.setFrozenRows(1); }
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
              montant: r[6] !== "" && r[6] !== null ? montantTexte(r[6]) : null, nom: r[7], chemin: r[8], archive: r[10] || "" };
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
  var a = { fournisseur: e.fournisseur, numero: e.numero, date: e.date, dateSecours: e.date, montant: e.montant };
  clesDoublon(a, e.md5).forEach(function(k) { if (!index[k]) index[k] = e; });
}

/** Ajoute un fichier rangé à l'index (mémoire + Sheet) */
function indexAjouter(e) {
  indexInserer(indexCharger(), e);
  if (e.fichierId) _journal.parId[e.fichierId] = e;
  _journal.tampon.Index.push([e.fichierId, e.md5 || "", e.etablissement || "", e.fournisseur || "", e.numero || "", e.date || "", e.montant || "", e.nom || "", e.chemin || "", new Date(), e.archive || ""]);
}

/** Met à jour le chemin d'un fichier déplacé (mémoire, et Sheet si la ligne est connue) */
function indexDeplacer(fichierId, chemin) {
  var e = indexParId(fichierId);
  if (e) e.chemin = chemin;
  var ligne = _journal.lignesIndex[fichierId];
  if (ligne) journalOnglet(journalClasseur(), "Index", COLONNES_INDEX).getRange(ligne, 9).setValue(chemin);
}

/** Une ligne de journal (objet avec les clés de COLONNES_JOURNAL, en minuscules sans accents) */
function journalAjouter(l, simulation) {
  var ligne = [new Date(), l.dateMail || "", l.expediteur || "", l.recuSur || "", l.objet || "", l.piece || "", l.type || "", l.etablissement || "", l.fournisseur || "",
               l.numero || "", l.dateFacture || "", l.montant || "", l.destination || "", l.chemin || "", l.raison || "", l.lienFichier || "", l.lienMail || "", l.messageId || "",
               simulation ? "simulation" : "reel"];
  _journal.tampon[simulation ? "Simulation" : "Journal"].push(ligne);
}

/** Ligne du plan de réorganisation : { fichierId, ancien, nouveau, nom, methode, statut } */
function reorgAjouter(r) {
  _journal.tampon["Réorganisation"].push([r.fichierId, r.ancien, r.nouveau, r.nom, r.methode, r.statut, new Date()]);
}

/** Lignes du plan de réorganisation : [{ ligne, fichierId, ancien, nouveau, nom, methode, statut }] */
function reorgLire() {
  var f = journalOnglet(journalClasseur(), "Réorganisation", COLONNES_REORG), n = f.getLastRow();
  if (n < 2) return [];
  return f.getRange(2, 1, n - 1, COLONNES_REORG.length).getValues().map(function(r, i) {
    return { ligne: i + 2, fichierId: r[0], ancien: r[1], nouveau: r[2], nom: r[3], methode: r[4], statut: r[5] };
  });
}

function reorgStatut(ligne, statut) {
  var f = journalOnglet(journalClasseur(), "Réorganisation", COLONNES_REORG);
  f.getRange(ligne, 6).setValue(statut);
  f.getRange(ligne, 7).setValue(new Date());
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

function dateIso(v) {
  if (v instanceof Date) return Utilities.formatDate(v, "Europe/Paris", "yyyy-MM-dd");
  return String(v).slice(0, 10);
}

function montantTexte(v) {
  if (typeof v === "number") return v.toFixed(2);
  return String(v);
}
