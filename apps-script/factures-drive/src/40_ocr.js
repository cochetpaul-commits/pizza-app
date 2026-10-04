// ============================================================================
// Lecture du texte d'une pièce : OCR Google Drive (PDF et images) ou XML brut.
// Quota Drive (« User rate limit exceeded ») : trois nouveaux essais (2 s, 5 s, 15 s),
// puis une ErreurOcrQuota est levée : le message n'est PAS marqué traité et sera repris.
// ============================================================================

function ErreurOcrQuota(message) { this.name = "ErreurOcrQuota"; this.message = message; }
ErreurOcrQuota.prototype = Object.create(Error.prototype);

function estErreurDeQuota(e) {
  return /rate\s*limit|quota|too\s*many\s*requests|backend\s*error|limit\s*exceeded/i.test(String(e && e.message || e));
}

/** Texte d'un blob PDF / image via l'OCR de Google Drive (document temporaire mis à la corbeille) ; null si le document est illisible */
function lireTexteOcr(blob) {
  var attentes = CONFIG.ocrAttentesMs, essai = 0, derniere = null;
  while (true) {
    var tmpId = null;
    try {
      var doc = Drive.Files.create(
        { name: "tmp_ocr_facture", mimeType: "application/vnd.google-apps.document" },
        blob,
        { ocrLanguage: "fr" }
      );
      tmpId = doc.id;
      return DocumentApp.openById(tmpId).getBody().getText();
    } catch (e) {
      derniere = e;
      if (!estErreurDeQuota(e)) { Logger.log("Lecture OCR impossible : " + e); return null; }
      if (essai >= attentes.length) break;
      Logger.log("Quota OCR atteint, nouvel essai dans " + attentes[essai] / 1000 + " s (" + e + ")");
      Utilities.sleep(attentes[essai]);
      essai++;
    } finally {
      if (tmpId) { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e2) {} }
    }
  }
  throw new ErreurOcrQuota("Quota OCR Drive dépassé après " + attentes.length + " nouveaux essais : " + derniere);
}

/** Texte d'une pièce selon son extension (pdf, image -> OCR ; xml -> texte brut) */
function lireTexte(blob, extension) {
  if (extension === "xml") {
    try { return blob.getDataAsString("UTF-8"); } catch (e) { return null; }
  }
  var copie = blob.copyBlob();
  if (extension === "pdf") copie.setContentType("application/pdf");
  return lireTexteOcr(copie);
}

/** Compatibilité avec les anciennes fonctions de maintenance */
function lireTextePdf(blob) { return lireTexte(blob, "pdf"); }

/** Empreinte MD5 (hexadécimal) d'un blob, identique à md5Checksum de Drive */
function md5Blob(blob) {
  var octets = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, blob.getBytes());
  return octets.map(function(b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? "0" + h : h; }).join("");
}
