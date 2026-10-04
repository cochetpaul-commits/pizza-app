// ============================================================================
// Lecture Gmail : l'unité de travail est le MESSAGE. Toutes les adresses de la
// boîte sont lues (facture@, contact@, perso), les messages envoyés et ceux qui
// viennent de nos propres adresses sont exclus, sauf les transferts de Pierre
// et Paul vers facture@.
// ============================================================================

function estAdresseInterne(adresse) {
  var a = String(adresse || "").toLowerCase();
  return CONFIG.adressesInternes.some(function(x) { return a.indexOf(x) !== -1; });
}

function adressesDe(message) {
  return [message.getTo(), message.getCc(), message.getBcc()].join(",").toLowerCase();
}

/** Première de nos adresses présente dans les destinataires, sinon « ? » */
function adresseReception(message) {
  var dest = adressesDe(message);
  for (var i = 0; i < CONFIG.adressesInternes.length; i++) if (dest.indexOf(CONFIG.adressesInternes[i]) !== -1) return CONFIG.adressesInternes[i];
  return "?";
}

/** Vrai si le message doit être examiné (expéditeur externe, ou transfert interne vers facture@) */
function messageRecevable(message) {
  var from = String(message.getFrom() || "").toLowerCase();
  if (!estAdresseInterne(from)) return true;
  var transfert = CONFIG.transfertsAutorises.some(function(x) { return from.indexOf(x) !== -1; });
  if (!transfert) return false;
  var dest = adressesDe(message);
  return CONFIG.adressesFacture.some(function(x) { return dest.indexOf(x) !== -1; });
}

function extensionDe(nom) {
  var m = String(nom || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Pièces jointes utiles (PDF, XML, images), sans les images inline des signatures */
function piecesDuMessage(message) {
  var pieces = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
  return pieces.filter(function(p) {
    var ext = extensionDe(p.getName());
    if (CONFIG.extensionsPieces.indexOf(ext) === -1) return false;
    if (ext !== "pdf" && ext !== "xml") {
      // une image de moins de 20 Ko est un logo, pas une facture photographiée
      if (p.getSize() < 20 * 1024) return false;
      // image au nom générique (image001.png, logo.jpg, Outlook-xxx.png…) : signature de mail, quelle que soit la taille
      if (CONFIG.imagesGeneriques.test(String(p.getName()).replace(/\.[a-z0-9]+$/i, "")) || /^outlook/i.test(String(p.getName()))) return false;
    }
    return true;
  });
}

/** Mail sans pièce jointe qui ressemble à une facture (Zenchef, Alan, Mailjet…) : montant + mot clé */
function corpsRessembleAUneFacture(message) {
  var corps = normaliser(message.getPlainBody() || "").slice(0, 20000);
  var motCle = /\b(facture|invoice|recu|receipt|avoir|prelevement)\b/.test(corps);
  var montant = /\d+[,.]\d{2}\s*(?:€|eur)|(?:€|eur)\s*\d+[,.]\d{2}/.test(corps);
  return motCle && montant;
}

/** Requête Gmail d'une passe : tout ce qui a une pièce jointe, ou dont l'objet parle de facture, depuis une date */
function requeteGmail(depuis) {
  var d = Utilities.formatDate(depuis, "Europe/Paris", "yyyy/MM/dd");
  return "after:" + d + " -in:spam -in:trash -in:draft (has:attachment OR subject:(facture OR invoice OR avoir OR reçu OR receipt))";
}

/**
 * Parcourt les messages candidats par lots de fils (pagination Gmail), du plus récent au plus ancien.
 * `visite(message, fil)` renvoie false pour arrêter (limite de temps).
 * Renvoie { fils, messages, arret, position } ; `position` est l'indice du fil où reprendre.
 */
function parcourirMessages(requete, visite, debutLot) {
  var debut = debutLot || 0, lot = CONFIG.tailleLot, st = { fils: 0, messages: 0, arret: false, position: debut };
  while (true) {
    var fils = GmailApp.search(requete, debut, lot);
    if (!fils.length) break;
    for (var i = 0; i < fils.length; i++) {
      st.fils++;
      var messages = fils[i].getMessages();
      for (var j = 0; j < messages.length; j++) {
        st.messages++;
        if (visite(messages[j], fils[i]) === false) { st.arret = true; st.position = debut + i; return st; }
      }
    }
    debut += fils.length;
    st.position = debut;
    if (fils.length < lot) break;
  }
  return st;
}

function etiquetteTraite() {
  return GmailApp.getUserLabelByName(CONFIG.etiquetteTraite) || GmailApp.createLabel(CONFIG.etiquetteTraite);
}
