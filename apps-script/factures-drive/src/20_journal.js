// ============================================================================
// Journal : un Google Sheet « Journal factures » dans « Factures iFratelli ».
//   - onglet « Journal »          : une ligne par pièce jointe traitée (ou par mail sans pièce jointe repéré)
//   - onglet « Messages traités » : identifiants Gmail déjà vus (l'unité de travail est le message, pas le fil)
//   - onglet « Index »            : empreinte et clés métier de chaque fichier rangé (anti-doublon)
//   - onglet « Simulation »       : rapport du rattrapage en mode simulation
// Les écritures sont groupées en mémoire et vidées par journalVider() (une seule écriture Sheet par lot).
// ============================================================================

var COLONNES_JOURNAL = ["Horodatage", "Date mail", "Expéditeur", "Reçu sur", "Objet", "Pièce", "Type", "Établissement", "Fournisseur", "Numéro", "Date facture", "Montant", "Destination", "Chemin", "Raison", "Lien fichier", "Lien mail", "Message id", "Mode"];
var COLONNES_INDEX = ["Fichier id", "MD5", "Établissement", "Fournisseur", "Numéro", "Date", "Montant", "Nom", "Chemin", "Ajouté le"];

var _journal = { classeur: null, tampon: { Journal: [], "Messages traités": [], Index: [], Simulation: [] }, traites: null, index: null };

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

/** Index anti-doublon : { "md5:…": entrée, "num:…": entrée, "dm:…": entrée } */
function indexCharger() {
  if (_journal.index) return _journal.index;
  var f = journalOnglet(journalClasseur(), "Index", COLONNES_INDEX);
  var n = f.getLastRow(), index = {};
  if (n > 1) f.getRange(2, 1, n - 1, COLONNES_INDEX.length).getValues().forEach(function(r) {
    var e = { fichierId: r[0], md5: r[1], etablissement: r[2], fournisseur: r[3], numero: r[4] ? String(r[4]) : null, date: r[5] ? dateIso(r[5]) : null,
              montant: r[6] !== "" && r[6] !== null ? montantTexte(r[6]) : null, nom: r[7], chemin: r[8] };
    indexInserer(index, e);
  });
  _journal.index = index;
  return index;
}

function indexInserer(index, e) {
  var a = { fournisseur: e.fournisseur, numero: e.numero, date: e.date, dateSecours: e.date, montant: e.montant };
  clesDoublon(a, e.md5).forEach(function(k) { if (!index[k]) index[k] = e; });
}

/** Ajoute un fichier rangé à l'index (mémoire + Sheet) */
function indexAjouter(e) {
  indexInserer(indexCharger(), e);
  _journal.tampon.Index.push([e.fichierId, e.md5 || "", e.etablissement || "", e.fournisseur || "", e.numero || "", e.date || "", e.montant || "", e.nom || "", e.chemin || "", new Date()]);
}

/** Une ligne de journal (objet avec les clés de COLONNES_JOURNAL, en minuscules sans accents) */
function journalAjouter(l, simulation) {
  var ligne = [new Date(), l.dateMail || "", l.expediteur || "", l.recuSur || "", l.objet || "", l.piece || "", l.type || "", l.etablissement || "", l.fournisseur || "",
               l.numero || "", l.dateFacture || "", l.montant || "", l.destination || "", l.chemin || "", l.raison || "", l.lienFichier || "", l.lienMail || "", l.messageId || "",
               simulation ? "simulation" : "reel"];
  _journal.tampon[simulation ? "Simulation" : "Journal"].push(ligne);
}

/** Écrit tout ce qui est en attente (à appeler en fin de passe et avant la limite de temps) */
function journalVider() {
  var classeur = journalClasseur();
  for (var nom in _journal.tampon) {
    var lignes = _journal.tampon[nom];
    if (!lignes.length) continue;
    var f = classeur.getSheetByName(nom);
    f.getRange(f.getLastRow() + 1, 1, lignes.length, lignes[0].length).setValues(lignes);
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
