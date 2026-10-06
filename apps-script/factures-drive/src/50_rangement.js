// ============================================================================
// Rangement dans Drive : dossiers, écriture et déplacement des fichiers.
// Les dossiers existants ne sont jamais renommés (Pennylane et le journal les référencent).
// ============================================================================

var _dossiers = {};

function obtenirOuCreerDossier(parent, nom) {
  var cle = (parent ? parent.getId() : "racine") + "|" + nom;
  if (_dossiers[cle]) return _dossiers[cle];
  var it = parent ? parent.getFoldersByName(nom) : DriveApp.getRootFolder().getFoldersByName(nom);
  var d = it.hasNext() ? it.next() : (parent ? parent.createFolder(nom) : DriveApp.getRootFolder().createFolder(nom));
  _dossiers[cle] = d;
  return d;
}

/** Dossier « Envoi Pennylane/<Établissement> » : par identifiant Drive (créé par Paul), sinon par nom */
function dossierEnvoi(etab) {
  var cle = "envoi|" + etab;
  if (_dossiers[cle]) return _dossiers[cle];
  var d = null, id = CONFIG.envoiIds[etab];
  if (id) { try { d = DriveApp.getFolderById(id); } catch (e) { Logger.log("Dossier Envoi Pennylane/" + etab + " introuvable par identifiant (" + e + ") : repli par nom"); } }
  if (!d) d = obtenirOuCreerDossier(obtenirOuCreerDossier(obtenirOuCreerDossier(null, CONFIG.dossierRacine), CONFIG.dossiers.envoi), etab);
  _dossiers[cle] = d;
  return d;
}

/** Dossier correspondant à un chemin sous « Factures iFratelli » (créé au besoin) */
function dossierDuChemin(chemin) {
  if (chemin.length === 2 && chemin[0] === CONFIG.dossiers.envoi) return dossierEnvoi(chemin[1]);
  var d = obtenirOuCreerDossier(null, CONFIG.dossierRacine);
  for (var i = 0; i < chemin.length; i++) d = obtenirOuCreerDossier(d, chemin[i]);
  return d;
}

/** Nom libre dans le dossier : « nom (2).pdf » si le nom existe déjà (deux pièces distinctes du même mail) */
function nomLibre(dossier, nom) {
  if (!dossier.getFilesByName(nom).hasNext()) return nom;
  var m = nom.match(/^(.*)(\.[a-z0-9]+)$/i), base = m ? m[1] : nom, ext = m ? m[2] : "";
  for (var n = 2; n < 50; n++) { var essai = base + " (" + n + ")" + ext; if (!dossier.getFilesByName(essai).hasNext()) return essai; }
  return base + " (" + Date.now() + ")" + ext;
}

/**
 * Écrit une pièce dans Drive et l'ajoute à l'index. `description` (raison) est posée sur le fichier pour « À vérifier ».
 * `infosIndex.archive` est le dossier d'archive prévu après le passage par « Envoi Pennylane ». Renvoie le fichier créé.
 */
function rangerPiece(blob, nom, chemin, description, infosIndex) {
  var dossier = dossierDuChemin(chemin);
  // Type MIME d'après l'extension, jamais celui du mail (« application/others », « application/octet-stream » : Drive n'affiche pas le PDF)
  var copie = blob.copyBlob().setName(nomLibre(dossier, nom)), type = typeMimePour(nom);
  if (type) copie.setContentType(type);
  var fichier = dossier.createFile(copie);
  if (description) fichier.setDescription(description);
  var dansEnvoi = chemin[0] === CONFIG.dossiers.envoi;
  indexAjouter({ fichierId: fichier.getId(), md5: infosIndex.md5, etablissement: infosIndex.etablissement, fournisseur: infosIndex.fournisseur,
                 numero: infosIndex.numero, date: infosIndex.date, montant: infosIndex.montant, nom: fichier.getName(), chemin: chemin.join("/"), archive: infosIndex.archive || "",
                 arriveEnvoi: dansEnvoi ? dateIso(new Date()) : "" });
  return fichier;
}

/** Type MIME attendu d'après l'extension du nom (CONFIG.mimeParExtension), ou null */
function typeMimePour(nom) { return CONFIG.mimeParExtension[extensionDe(nom)] || null; }

/** Déplace un fichier vers un chemin (le fichier garde son identifiant Drive) et met l'index à jour */
function deplacerFichier(fichier, chemin) {
  var dossier = dossierDuChemin(chemin);
  if (fichier.getName() !== nomLibre(dossier, fichier.getName())) fichier.setName(nomLibre(dossier, fichier.getName()));
  fichier.moveTo(dossier);
  indexDeplacer(fichier.getId(), chemin.join("/"));
  return fichier;
}

/** Fichiers d'un dossier (sans sous-dossiers) plus vieux que `jours` : [{ fichier, chemin }] */
function fichiersAnciens(dossier, chemin, jours) {
  var out = [], limite = Date.now() - jours * 86400000, fs = dossier.getFiles();
  while (fs.hasNext()) { var f = fs.next(); if (f.getDateCreated().getTime() < limite) out.push({ fichier: f, chemin: chemin }); }
  return out;
}

/**
 * Fichiers de « Envoi Pennylane/<Établissement> » présents depuis plus de `jours` : [{ fichier, chemin, etablissement, depuis }].
 * L'âge se compte depuis l'ARRIVÉE dans Envoi (colonne « Dans Envoi depuis » de l'Index), jamais depuis la création du fichier :
 * un fichier déplacé à la main depuis « À vérifier » ou le transit, ou sans date d'arrivée dans l'Index, est daté du jour où il
 * est vu ici pour la première fois (et son chemin dans l'Index est mis à jour) ; un fichier inconnu de l'Index y est ajouté
 * d'après son nom. Ils ne sont donc jamais archivés avant que Pennylane ait eu le temps de les importer.
 */
function fichiersEnvoiAnciens(jours) {
  var out = [], limite = Date.now() - jours * 86400000, aujourdHui = dateIso(new Date()), idxF = null;
  indexCharger();
  CONFIG.etablissements.forEach(function(etab) {
    var chemin = CONFIG.dossiers.envoi + "/" + etab, fs = dossierEnvoi(etab).getFiles();
    while (fs.hasNext()) {
      var f = fs.next(), e = indexParId(f.getId()), depuis = null;
      if (!e) {
        // déposé à la main, inconnu de l'Index : on l'indexe aujourd'hui
        idxF = idxF || fournisseursIndex();
        var n = analyserNomFichier(f.getName()) || {}, fournisseur = n.fournisseur ? (nomCanonique(idxF, n.fournisseur) || n.fournisseur) : null;
        var archive = n.fournisseur && n.date ? [etab, fournisseur, n.date.slice(0, 4)].join("/") : "";
        indexAjouter({ fichierId: f.getId(), md5: md5De(f), etablissement: etab, fournisseur: fournisseur, numero: n.numero || null, date: n.date || dateIso(f.getDateCreated()),
                       montant: n.montant || null, nom: f.getName(), chemin: chemin, archive: archive, arriveEnvoi: aujourdHui });
        continue;
      }
      if (e.chemin !== chemin) { indexMarquerEnvoi(f.getId(), chemin, e.archive, new Date()); continue; }   // déplacé à la main : arrivé aujourd'hui
      // sans date d'arrivée connue (ligne d'avant la v4.6) : daté d'aujourd'hui, JAMAIS de la date de création du fichier
      // (un PDF créé le 23/09 et déposé à la main le 05/10 passait pour « dans Envoi depuis 13 jours » : Masse FACN012603733)
      if (!e.arriveEnvoi) { indexMarquerEnvoi(f.getId(), chemin, e.archive, new Date()); continue; }
      depuis = new Date(e.arriveEnvoi + "T12:00:00").getTime();
      if (depuis < limite) out.push({ fichier: f, chemin: chemin, etablissement: etab, depuis: depuis, entree: e });
    }
  });
  return out;
}

/** Empreinte MD5 d'un fichier Drive (lue par l'API), ou null */
function md5De(f) {
  try { return Drive.Files.get(f.getId(), { fields: "md5Checksum" }).md5Checksum || null; } catch (e) { Logger.log("MD5 illisible " + f.getName() + " : " + e); return null; }
}

/** Fichiers de « À vérifier » (et de l'ancien « _À vérifier ») plus vieux que `jours`, sous-dossiers compris */
function fichiersAVerifierAnciens(jours) {
  var racine = obtenirOuCreerDossier(null, CONFIG.dossierRacine), out = [], limite = Date.now() - jours * 86400000;
  [CONFIG.dossiers.aVerifier, CONFIG.dossiers.ancienAVerifier].forEach(function(nom) {
    var it = racine.getFoldersByName(nom);
    if (!it.hasNext()) return;
    (function parcourir(d, chemin) {
      var fs = d.getFiles();
      while (fs.hasNext()) { var f = fs.next(); if (f.getDateCreated().getTime() < limite) out.push({ fichier: f, chemin: chemin }); }
      var sd = d.getFolders();
      while (sd.hasNext()) { var s = sd.next(); parcourir(s, chemin + "/" + s.getName()); }
    })(it.next(), nom);
  });
  return out;
}

/** Parcourt récursivement un dossier : visite(fichier, chemin) ; renvoie false pour arrêter */
function parcourirDossier(dossier, chemin, visite) {
  var fs = dossier.getFiles();
  while (fs.hasNext()) { if (visite(fs.next(), chemin) === false) return false; }
  var sd = dossier.getFolders();
  while (sd.hasNext()) { var s = sd.next(); if (parcourirDossier(s, chemin + "/" + s.getName(), visite) === false) return false; }
  return true;
}
