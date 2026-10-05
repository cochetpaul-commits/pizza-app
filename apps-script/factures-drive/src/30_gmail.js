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

/** Extension déduite du type MIME d'une pièce sans extension connue (PDF envoyé sans « .pdf »), ou "" */
function extensionParMime(type) {
  var t = String(type || "").toLowerCase().split(";")[0].trim();
  for (var ext in CONFIG.mimeParExtension) if (CONFIG.mimeParExtension[ext] === t) return ext;
  if (t === "image/jpg" || t === "image/pjpeg") return "jpg";
  return "";
}

/**
 * Pièces jointes d'un message, triées : { gardees: [blob], ecartees: [{ nom, raison }] }.
 *   - PDF, XML et images (par extension, ou par type MIME pour un PDF sans extension : le blob est alors renommé « .pdf ») ;
 *   - images de signature écartées sans trace (moins de 20 Ko, ou nom générique image001.png, logo.jpg, Outlook-xxx.png) ;
 *   - tout le reste (zip, p7m, docx, sans extension ni type connu…) est écarté ET journalisé par traiterMessage.
 */
function trierPieces(message) {
  var pieces = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
  var out = { gardees: [], ecartees: [] };
  pieces.forEach(function(p) {
    var nom = String(p.getName() || ""), ext = extensionDe(nom);
    if (CONFIG.extensionsPieces.indexOf(ext) === -1) {
      var parMime = extensionParMime(p.getContentType && p.getContentType());
      if (!parMime) { out.ecartees.push({ nom: nom || "(sans nom)", raison: "pièce écartée : type « " + (ext || (p.getContentType && p.getContentType()) || "inconnu") + " » non traité" }); return; }
      ext = parMime;
      try { p.setName(nom + "." + ext); } catch (e) { Logger.log("Renommage de la pièce impossible : " + e); }
    }
    if (ext !== "pdf" && ext !== "xml") {
      // une image de moins de 20 Ko est un logo, pas une facture photographiée
      if (p.getSize() < 20 * 1024) return;
      // image au nom générique (image001.png, logo.jpg, Outlook-xxx.png…) : signature de mail, quelle que soit la taille
      if (CONFIG.imagesGeneriques.test(nom.replace(/\.[a-z0-9]+$/i, "")) || /^outlook/i.test(nom)) return;
    }
    out.gardees.push(p);
  });
  return out;
}

/** Pièces jointes utiles (compatibilité) */
function piecesDuMessage(message) { return trierPieces(message).gardees; }

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
