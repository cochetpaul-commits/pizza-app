// ============================================================================
// Vérification Pennylane (API v2) avant archivage : un fichier de « Envoi Pennylane » n'est déplacé vers l'archive
// que si Pennylane a bien importé la facture (même numéro, ou même fournisseur, date et montant).
// Jeton par société dans les propriétés du script (Paramètres du projet > Propriétés du script) :
//   pennylane.token.Bello Mio      (SARL SASHA)
//   pennylane.token.Piccola Mia    (SARL I FRATELLI)
// Sans jeton : archivage comme avant (3 jours), avec un avertissement dans le journal.
// ============================================================================

var PENNYLANE_API = "https://app.pennylane.com/api/external/v2";

/** Jeton Pennylane de l'établissement, ou null */
function pennylaneJeton(etab) {
  try { return PropertiesService.getScriptProperties().getProperty("pennylane.token." + etab) || null; } catch (e) { return null; }
}

/** Appel GET à l'API Pennylane : { ok, items } ; ok=false sur erreur réseau ou HTTP */
function pennylaneLister(etab, chemin, filtre) {
  var jeton = pennylaneJeton(etab);
  if (!jeton) return { ok: false, items: [], raison: "pas de jeton" };
  var url = PENNYLANE_API + chemin + "?limit=100&filter=" + encodeURIComponent(JSON.stringify(filtre));
  try {
    var rep = UrlFetchApp.fetch(url, { method: "get", headers: { Authorization: "Bearer " + jeton, Accept: "application/json" }, muteHttpExceptions: true });
    var code = rep.getResponseCode();
    if (code < 200 || code >= 300) { Logger.log("Pennylane HTTP " + code + " (" + etab + ") : " + String(rep.getContentText()).slice(0, 200)); return { ok: false, items: [], raison: "HTTP " + code }; }
    var corps = JSON.parse(rep.getContentText() || "{}");
    return { ok: true, items: corps.items || [] };
  } catch (e) { Logger.log("Pennylane injoignable (" + etab + ") : " + e); return { ok: false, items: [], raison: String(e) }; }
}

/**
 * Vrai si Pennylane (société de l'établissement) a une facture fournisseur de même numéro, ou de même fournisseur (identifiant
 * Pennylane de la ligne du Sheet, s'il est connu), même date et même montant ; faux si rien ne correspond ; null si la
 * vérification est impossible (pas de jeton, API en panne). `infos` : { numero, date, montant, nom, fournisseurId }.
 * Les champs filtrables de l'API sont id, supplier_id, invoice_number, date… (pas le montant) : le montant est comparé ici.
 */
function pennylaneFactureExiste(etab, infos) {
  if (!pennylaneJeton(etab)) return null;
  var montant = infos.montant ? Math.abs(parseFloat(infos.montant)) : null;
  var memeMontant = function(it) { return montant !== null && it.amount !== undefined && Math.abs(Math.abs(parseFloat(it.amount)) - montant) < 0.011; };
  var memeNom = function(it) { return infos.nom && it.filename === infos.nom; };
  if (infos.numero) {
    var r1 = pennylaneLister(etab, "/supplier_invoices", [{ field: "invoice_number", operator: "eq", value: String(infos.numero) }]);
    if (!r1.ok) return null;
    if (r1.items.length) return true;
  }
  if (infos.date) {
    var filtre = [{ field: "date", operator: "eq", value: String(infos.date).slice(0, 10) }];
    if (infos.fournisseurId) filtre.push({ field: "supplier_id", operator: "eq", value: String(infos.fournisseurId) });
    var r2 = pennylaneLister(etab, "/supplier_invoices", filtre);
    if (!r2.ok) return null;
    if (r2.items.some(function(it) { return memeNom(it) || memeMontant(it); })) return true;
  }
  return false;
}

/** Identifiant Pennylane d'un fournisseur de la liste pour un établissement (colonnes « ID Pennylane Bello / Piccola »), ou null */
function pennylaneIdFournisseur(idxF, fournisseur, etab) {
  var e = fournisseur ? entreeParNom(idxF, fournisseur) : null;
  if (!e) return null;
  var id = etab === "Bello Mio" ? e.pennylaneBello : etab === "Piccola Mia" ? e.pennylanePiccola : "";
  return id && String(id).trim() ? String(id).trim() : null;
}
