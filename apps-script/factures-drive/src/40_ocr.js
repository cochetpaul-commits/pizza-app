// ============================================================================
// Lecture du texte d'une pièce : OCR Google Drive (PDF et images) ou XML brut.
// ============================================================================

/** Texte d'un blob PDF / image via l'OCR de Google Drive (document temporaire mis à la corbeille) ; null si échec */
function lireTexteOcr(blob) {
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
    Logger.log("Lecture OCR impossible : " + e);
    return null;
  } finally {
    if (tmpId) { try { DriveApp.getFileById(tmpId).setTrashed(true); } catch (e2) {} }
  }
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
