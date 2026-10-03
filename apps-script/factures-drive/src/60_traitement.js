// ============================================================================
// Traitement : passe horaire (extraireFactures), rattrapage (simulation puis réel),
// alerte hebdomadaire, déclencheurs.
//
// Pour chaque pièce jointe d'un message :
//   texte (OCR) -> analyserDocument -> decider -> anti-doublon -> rangement -> journal
// Un message n'est traité qu'une fois (onglet « Messages traités »), quel que soit le fil.
// ============================================================================

var DATE_RATTRAPAGE = "2026-07-01";

/** Passe horaire : messages des 72 dernières heures non encore traités */
function extraireFactures() {
  var depuis = new Date(Date.now() - CONFIG.fenetreHeures * 3600000);
  return traiterMessages({ depuis: depuis, simulation: false, cleReprise: "passe" });
}

/** Rattrapage en SIMULATION : rien n'est écrit dans Drive, le rapport va dans l'onglet « Simulation » du journal */
function rattrapage(dateDebut) {
  return traiterMessages({ depuis: lireDateArgument(dateDebut), simulation: true, cleReprise: "rattrapage-simulation" });
}

/** Rattrapage RÉEL, à lancer seulement après validation du rapport de simulation par Paul */
function rattrapageReel(dateDebut) {
  return traiterMessages({ depuis: lireDateArgument(dateDebut), simulation: false, cleReprise: "rattrapage-reel" });
}

// L'éditeur Apps Script ne passe pas d'argument : raccourcis depuis le 01/07/2026
function rattrapageDepuisJuillet() { return rattrapage(DATE_RATTRAPAGE); }
function rattrapageReelDepuisJuillet() { return rattrapageReel(DATE_RATTRAPAGE); }

function lireDateArgument(d) {
  if (d instanceof Date) return d;
  var m = String(d || DATE_RATTRAPAGE).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

/**
 * Cœur du traitement. opts : { depuis: Date, simulation: bool, cleReprise: string }
 * S'arrête avant la limite de 6 min et mémorise où reprendre (PropertiesService) ; relancer jusqu'à « TERMINÉ ».
 */
function traiterMessages(opts) {
  var debut = Date.now();
  var props = PropertiesService.getScriptProperties();
  var cle = "reprise." + opts.cleReprise + "." + Utilities.formatDate(opts.depuis, "Europe/Paris", "yyyyMMdd");
  var position = Number(props.getProperty(cle) || 0);
  if (opts.simulation && position === 0) journalViderSimulation();
  var traites = journalMessagesTraites();
  // En simulation on travaille sur une copie de l'index : les pièces « rangées » virtuellement ne doivent pas rester en mémoire
  var index = opts.simulation ? Object.assign({}, indexCharger()) : indexCharger();
  var stats = { messages: 0, deja: 0, ignores: 0, pieces: 0, sync: 0, hors_pennylane: 0, a_verifier: 0, journal: 0, doublons: 0, corps: 0 };

  var st = parcourirMessages(requeteGmail(opts.depuis), function(message, fil) {
    if (Date.now() - debut > CONFIG.limiteMs) return false;
    if (message.getDate() < opts.depuis) return true;
    var id = message.getId();
    if (!opts.simulation && traites[id]) { stats.deja++; return true; }
    if (!messageRecevable(message)) { stats.ignores++; return true; }
    stats.messages++;
    try {
      traiterMessage(message, fil, opts, index, stats);
      if (!opts.simulation) journalMarquerTraite(id, "reel");
    } catch (e) {
      Logger.log("ERREUR message " + id + " (" + message.getSubject() + ") : " + e);
      journalAjouter({ dateMail: dateIso(message.getDate()), expediteur: message.getFrom(), objet: message.getSubject(), destination: "erreur", raison: String(e),
                       lienMail: lienMail(message), messageId: id }, opts.simulation);
    }
    return true;
  }, position);

  journalVider();
  var resume = (opts.simulation ? "[SIMULATION] " : "") + "messages examinés : " + stats.messages + " (déjà traités : " + stats.deja + ", ignorés : " + stats.ignores + ") — pièces : " + stats.pieces
    + " — rangées Pennylane : " + stats.sync + ", hors Pennylane : " + stats.hors_pennylane + ", à vérifier : " + stats.a_verifier + ", journal seul : " + stats.journal
    + ", doublons : " + stats.doublons + ", factures dans le corps du mail : " + stats.corps;
  if (st.arret) { props.setProperty(cle, String(st.position)); Logger.log(resume); Logger.log("PAS FINI — relancer la même fonction (reprise au fil n° " + st.position + ")"); }
  else { props.deleteProperty(cle); Logger.log(resume); Logger.log("TERMINÉ"); }
  return stats;
}

function lienMail(message) { return "https://mail.google.com/mail/u/0/#all/" + message.getId(); }

/** Traite un message : chaque pièce jointe, ou le corps du mail s'il ressemble à une facture sans pièce jointe */
function traiterMessage(message, fil, opts, index, stats) {
  var pieces = piecesDuMessage(message);
  var base = { dateMail: dateIso(message.getDate()), expediteur: message.getFrom(), recuSur: adresseReception(message), objet: message.getSubject(),
               lienMail: lienMail(message), messageId: message.getId() };
  if (!pieces.length) {
    if (corpsRessembleAUneFacture(message)) {
      stats.corps++;
      journalAjouter(Object.assign({}, base, { piece: "(corps du mail)", type: "facture ?", destination: "a_verifier",
        raison: "facture dans le corps du mail, sans pièce jointe : à télécharger à la main" }), opts.simulation);
    }
    return;
  }
  for (var i = 0; i < pieces.length; i++) {
    var p = pieces[i], ext = extensionDe(p.getName());
    stats.pieces++;
    var md5 = md5Blob(p);
    var texte = lireTexte(p, ext);
    var a = analyserDocument({ texte: texte, from: message.getFrom(), subject: message.getSubject(), nomPiece: p.getName(), dateMail: base.dateMail,
                               extension: "." + (ext === "jpeg" ? "jpg" : ext) });
    var d = decider(a, message.getDate());
    var ligne = Object.assign({}, base, { piece: p.getName(), type: a.type, etablissement: a.etablissement, fournisseur: a.fournisseur, numero: a.numero,
      dateFacture: a.date, montant: a.montant, destination: d.destination, chemin: d.chemin.join("/"), raison: d.raison });
    var doublon = trouverDoublon(index, a, md5);
    if (doublon) {
      stats.doublons++;
      ligne.destination = "doublon";
      ligne.raison = "déjà rangé : " + (doublon.chemin ? doublon.chemin + "/" : "") + doublon.nom;
      ligne.lienFichier = doublon.fichierId ? "https://drive.google.com/file/d/" + doublon.fichierId + "/view" : "";
    } else if (d.destination === "journal") {
      stats.journal++;
    } else {
      stats[d.destination]++;
      var infos = { md5: md5, etablissement: a.etablissement, fournisseur: a.fournisseur, numero: a.numero, date: a.date || a.dateSecours, montant: a.montant, nom: a.nom, fichierId: "" };
      if (opts.simulation) {
        indexInserer(index, infos);   // pour repérer les doublons à l'intérieur même de la simulation
        ligne.chemin = d.chemin.join("/") + "/" + a.nom;
      } else {
        var description = d.destination === "a_verifier" ? "À vérifier : " + d.raison + " — mail : " + base.lienMail : "";
        var fichier = rangerPiece(p, a.nom, d.chemin, description, infos);
        ligne.lienFichier = fichier.getUrl();
        ligne.chemin = d.chemin.join("/") + "/" + fichier.getName();
      }
    }
    journalAjouter(ligne, opts.simulation);
  }
  if (!opts.simulation) { try { fil.addLabel(etiquetteTraite()); } catch (e) { Logger.log("Libellé non posé : " + e); } }
}

/** Alerte hebdomadaire : fichiers de « _À vérifier » de plus de 3 jours -> mail récapitulatif à Paul */
function alerteAVerifier() {
  var anciens = fichiersAVerifierAnciens(CONFIG.alerteAgeJours);
  if (!anciens.length) { Logger.log("Rien à signaler dans " + CONFIG.dossiers.aVerifier); return 0; }
  var lignes = anciens.map(function(x) {
    return "- " + x.chemin + "/" + x.fichier.getName() + " (" + Utilities.formatDate(x.fichier.getDateCreated(), "Europe/Paris", "dd/MM") + ")\n  "
      + (x.fichier.getDescription() || "") + "\n  " + x.fichier.getUrl();
  });
  MailApp.sendEmail({
    to: CONFIG.alerteDestinataire,
    subject: "Factures à vérifier : " + anciens.length + " document(s) en attente depuis plus de " + CONFIG.alerteAgeJours + " jours",
    body: "Bonjour Paul,\n\nCes documents sont dans « Factures iFratelli/" + CONFIG.dossiers.aVerifier + " » et n'ont pas été classés :\n\n" + lignes.join("\n\n")
      + "\n\nPour chacun : le déplacer à la main dans le bon dossier (Bello Mio ou Piccola Mia, fournisseur, mois) s'il s'agit d'une vraie facture, sinon le laisser ou le mettre à la corbeille.\n"
  });
  Logger.log("Alerte envoyée : " + anciens.length + " fichier(s)");
  return anciens.length;
}

/** Déclencheurs : extraireFactures toutes les heures, alerteAVerifier le lundi matin. À lancer une fois après `clasp push`. */
function installerDeclencheurs() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (["extraireFactures", "alerteAVerifier"].indexOf(t.getHandlerFunction()) !== -1) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("extraireFactures").timeBased().everyHours(1).create();
  ScriptApp.newTrigger("alerteAVerifier").timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(8).create();
  Logger.log("Déclencheurs installés : extraireFactures (toutes les heures), alerteAVerifier (lundi 8 h)");
}

/** Oublie la position de reprise d'un rattrapage (pour recommencer une simulation de zéro) */
function reinitialiserReprises() {
  var props = PropertiesService.getScriptProperties();
  props.getKeys().forEach(function(k) { if (k.indexOf("reprise.") === 0) props.deleteProperty(k); });
  Logger.log("Positions de reprise effacées");
}
