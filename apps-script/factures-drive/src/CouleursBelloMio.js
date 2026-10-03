var BELLO_MIO_ID = "1t_ZkBmsqbRNyp8qtmGQEhO6Jt1SfJpH1";
var COULEURS_BELLO_MIO = { "Carniato": "#f83a22", "Cheville 35": "#d06b64", "Lequertier": "#f691b2", "Jehanno": "#9fe1e7", "Maeldistribution": "#16a765", "TerreAzur": "#4986e7", "SDPF": "#ff7537", "GGM Gastro": "#b3dc6c", "Vinoflo": "#cd74e6", "Bar Spirits": "#a47ae2", "Cozigou": "#ac725e", "Cafes-celtik": "#fad165", "Engie": "#92e1c0", "Axenergie": "#fa573c", "Generali-Assurance": "#cca6ac", "Mailjet": "#9fc6e7", "Hiboutik": "#b99aff", "Metro": "#ffad46", "Leroymerlin": "#7bd148", "Bureau-vallee": "#fbe983", "Armor Emballages": "#cabdbf", "Alain Pedron Nettoyage": "#42d692", "UP-COOP": "#c2c2c2", "Combohr": "#b99aff", "Combo": "#b99aff", "Thermifroid": "#9fe1e7", "Hyg-up": "#92e1c0", "Elis": "#9fc6e7", "Orange": "#ff7537", "Elien": "#cabdbf", "Daniel Marquet": "#fa573c", "Apple": "#c2c2c2", "PayByPhone": "#c2c2c2", "Maison-Dreux": "#16a765", "Ubefone": "#4986e7", "Mail": "#c2c2c2", "Gmail": "#c2c2c2", "Yahoo": "#c2c2c2", "Wanadoo": "#c2c2c2", "A-TRIER": "#c2c2c2", "Transfert Pierre": "#c2c2c2", "Invoicing": "#c2c2c2", "2026": "#c2c2c2" , "Alan":"#cca6ac", "Anthropic":"#9a9cff", "Verisure":"#4986e7", "Zenchef":"#7bd148", "Bimpli":"#cca6ac", "SC-M2":"#fa573c", "Alma":"#ffad47"};
function attribuerCouleursBelloMio() { var racine = DriveApp.getFolderById(BELLO_MIO_ID); var folders = racine.getFolders(); var count = 0; var skipped = []; while (folders.hasNext()) { var f = folders.next(); var name = f.getName(); var c = COULEURS_BELLO_MIO[name]; if (c) { try { Drive.Files.update({folderColorRgb: c}, f.getId()); Logger.log("OK " + name + " -> " + c); count++; } catch (e) { Logger.log("ERR " + name + ": " + e.message); } } else { skipped.push(name); } } Logger.log("Done: " + count + " - Skipped: " + skipped.join(", ")); }
function renommerEskerEnElis() { var bm = DriveApp.getFolderById(BELLO_MIO_ID); var iter = bm.getFoldersByName("Esker"); if (iter.hasNext()) { var f = iter.next(); f.setName("Elis"); try { Drive.Files.update({folderColorRgb: "#9fc6e7"}, f.getId()); } catch(e) {} Logger.log("OK Esker renomme en Elis (id " + f.getId() + ")"); } else { Logger.log("Esker non trouve"); } }
function renommerEFCMarquetEnDanielMarquet() { var bm = DriveApp.getFolderById(BELLO_MIO_ID); var iter = bm.getFoldersByName("EFC Marquet"); var iter2 = bm.getFoldersByName("EFCMarquet"); var folder = iter.hasNext() ? iter.next() : (iter2.hasNext() ? iter2.next() : null); if (folder) { folder.setName("Daniel Marquet"); try { Drive.Files.update({folderColorRgb: "#fa573c"}, folder.getId()); } catch(e) {} Logger.log("OK EFC Marquet renomme en Daniel Marquet"); } else { Logger.log("EFC Marquet non trouve (probablement pas encore de dossier)"); } }

// === Fusion dossiers Elis (race condition rename Esker->Elis 30/05/2026) ===
function fusionnerElis() {
  var ELIS_A = '171gv7cQCc_WgYgTVwhniA-x4Ce5LWOWU'; // recent, a fusionner
  var ELIS_B = '1T3bm1te47it0i7ssowM8oTCrDgeUTeBx'; // ancien, canonique
  var srcFolder = DriveApp.getFolderById(ELIS_A);
  var dstFolder = DriveApp.getFolderById(ELIS_B);
  var moved = 0, mergedSub = 0, log = [];
  var subFolders = srcFolder.getFolders();
  while (subFolders.hasNext()) {
    var sub = subFolders.next();
    var name = sub.getName();
    var existing = dstFolder.getFoldersByName(name);
    if (existing.hasNext()) {
      var dstSub = existing.next();
      var files = sub.getFiles();
      while (files.hasNext()) {
        var f = files.next();
        f.moveTo(dstSub);
        moved++;
        log.push('FILE: ' + f.getName() + ' -> ' + name);
      }
      mergedSub++;
      log.push('MERGED subfolder: ' + name);
      sub.setTrashed(true);
    } else {
      sub.moveTo(dstFolder);
      log.push('MOVED subfolder: ' + name);
    }
  }
  // direct files at root of Elis A
  var rootFiles = srcFolder.getFiles();
  while (rootFiles.hasNext()) {
    var f = rootFiles.next();
    f.moveTo(dstFolder);
    moved++;
    log.push('FILE root: ' + f.getName());
  }
  // verifier vide puis trash
  var stillFolders = srcFolder.getFolders();
  var stillFiles = srcFolder.getFiles();
  if (!stillFolders.hasNext() && !stillFiles.hasNext()) {
    srcFolder.setTrashed(true);
    log.push('TRASHED Elis A (empty)');
  } else {
    log.push('Elis A non vide, pas trash');
  }
  Logger.log('=== Fusion Elis OK ===');
  Logger.log('Files moved: ' + moved + ', Subfolders merged: ' + mergedSub);
  log.forEach(function(l){ Logger.log(l); });
  return 'OK moved=' + moved + ' mergedSub=' + mergedSub;
}


// === Anti-doublon : detecte et fusionne automatiquement les dossiers du meme nom ===
function nettoyerDoublonsBelloMio() {
  var BELLO_MIO_ID = '1t_ZkBmsqbRNyp8qtmGQEhO6Jt1SfJpH1';
  var bm = DriveApp.getFolderById(BELLO_MIO_ID);
  var folders = bm.getFolders();
  var byName = {};
  while (folders.hasNext()) {
    var f = folders.next();
    var n = f.getName();
    if (!byName[n]) byName[n] = [];
    byName[n].push({id: f.getId(), folder: f, created: f.getDateCreated()});
  }
  var totalMerged = 0;
  for (var name in byName) {
    var list = byName[name];
    if (list.length < 2) continue;
    // garder le plus ancien comme canonique
    list.sort(function(a,b){ return a.created - b.created; });
    var keep = list[0].folder;
    Logger.log('DOUBLON detecte: ' + name + ' (' + list.length + ' copies). Canonique=' + list[0].id);
    for (var i=1; i<list.length; i++) {
      var src = list[i].folder;
      // merger sous-dossiers et fichiers
      var sub = src.getFolders();
      while (sub.hasNext()) {
        var s = sub.next();
        var existing = keep.getFoldersByName(s.getName());
        if (existing.hasNext()) {
          var dst = existing.next();
          var ff = s.getFiles();
          while (ff.hasNext()) ff.next().moveTo(dst);
          s.setTrashed(true);
        } else { s.moveTo(keep); }
      }
      var fs = src.getFiles();
      while (fs.hasNext()) fs.next().moveTo(keep);
      src.setTrashed(true);
      totalMerged++;
      Logger.log('  -> trashed ' + list[i].id);
    }
  }
  Logger.log('=== ' + totalMerged + ' dossiers doublons fusionnes ===');
  return totalMerged;
}


function nettoyerDossiersBelloMioPiccola() {
  // 1. Trash 3 dossiers créés par erreur dans Bello Mio (sont pour Piccola Mia)
  var WRONG_BM = ['1xoOe2zXBqjOGCN_lUwvkGtvuqgaC1li_','1xTLkYvIQLCB2o8fyi6hiHjn3JoRFVdUY','1Wk10rxsjvQH9BRscmiDTsyp5InK3jbL_'];
  var trashed = 0;
  for (var i=0; i<WRONG_BM.length; i++) {
    try {
      var f = DriveApp.getFolderById(WRONG_BM[i]);
      var hasFiles = f.getFiles().hasNext() || f.getFolders().hasNext();
      if (!hasFiles) { f.setTrashed(true); trashed++; Logger.log('Trashed empty BM dup: ' + f.getName()); }
      else Logger.log('SKIP non vide: ' + f.getName());
    } catch(e) { Logger.log('SKIP ' + WRONG_BM[i] + ': ' + e); }
  }
  // 2. Fusionner Piccola Mia/Sc-m2 dans Piccola Mia/SC M2
  var SC_M2_CANON = '1lvy4VCfWPD7T_JZEsNy-6hqLC6GPBCC8';
  var SC_M2_DUP = '1D62X5MtmXcDKr1Oq0TaVKFa_yl4QVdh-';
  try {
    var canon = DriveApp.getFolderById(SC_M2_CANON);
    var dup = DriveApp.getFolderById(SC_M2_DUP);
    var moved = 0;
    var subFs = dup.getFolders();
    while (subFs.hasNext()) {
      var s = subFs.next();
      var ex = canon.getFoldersByName(s.getName());
      if (ex.hasNext()) {
        var dst = ex.next();
        var ff = s.getFiles();
        while (ff.hasNext()) { ff.next().moveTo(dst); moved++; }
        s.setTrashed(true);
      } else { s.moveTo(canon); moved++; }
    }
    var files = dup.getFiles();
    while (files.hasNext()) { files.next().moveTo(canon); moved++; }
    var hasLeft = dup.getFolders().hasNext() || dup.getFiles().hasNext();
    if (!hasLeft) { dup.setTrashed(true); Logger.log('Trashed SC-m2 dup'); }
    Logger.log('SC M2 merge: ' + moved + ' items moved');
  } catch(e) { Logger.log('SC M2 merge err: ' + e); }
  Logger.log('=== ' + trashed + ' BM trashed + SC M2 merged ===');
  return trashed;
}


// === Nettoyage Piccola Mia (doublons vides + audit suspects) ===
function nettoyerDoublonsPiccolaMia(){
  var PM_ROOT='1XZvEPR8mAo_BtftJ5qsoi-5dZ4Hr1s1o';
  // Doublons vides connus a trash
  var EMPTY_DUPS = {
    '1lWYu5kl5IH-63a7lij5LEAK7MrM1VADl':'Hyg Up (doublon de Hyg-up)',
    '1WYnB8dm3jlUu1-y-Fr7Dz0xPucKsbs1d':'Mael Distribution (doublon de Maeldistribution)',
    '1AsECp8ROl4qP17FLPYEoqxTII7520bkh':'Piccola Mia (self-ref)',
    '1MjVcO7EmdvwALZvWbzyhYD6mvGODDDsy':'Pennylane (self-ref)'
  };
  var trashed=0;
  for(var id in EMPTY_DUPS){
    try{
      var f=DriveApp.getFolderById(id);
      var has=f.getFolders().hasNext()||f.getFiles().hasNext();
      if(!has){f.setTrashed(true); trashed++; Logger.log('Trashed: '+EMPTY_DUPS[id]);} 
      else Logger.log('SKIP non vide: '+EMPTY_DUPS[id]);
    } catch(e){Logger.log('ERR '+id+': '+e);}
  }
  // Audit Bellomio dans Drive PM (anomalie: PDF mal route)
  Logger.log('--- AUDIT folders ---');
  var BELLOMIO_DUP='1Hh1wMfnwl0pd1wDosiZKtLEKBbUZlBY5';
  try{var bf=DriveApp.getFolderById(BELLOMIO_DUP); var subs=bf.getFolders(); while(subs.hasNext()){var s=subs.next(); var files=s.getFiles(); while(files.hasNext()){var fl=files.next(); Logger.log('Bellomio/'+s.getName()+'/'+fl.getName()+' size='+fl.getSize());}}}catch(e){}
  Logger.log('=== '+trashed+' doublons vides trash ===');
  return trashed;
}


// === Couleurs Drive Piccola Mia ===
var PICCOLA_MIA_ID = '1XZvEPR8mAo_BtftJ5qsoi-5dZ4Hr1s1o';
var COULEURS_PICCOLA_MIA = {
  "Carniato":"#f83a22", "Maeldistribution":"#16a765", "Hyg-up":"#fad165",
  "Cheville 35":"#cca6ac", "Armor Emballages":"#cabdbf", "Lucangeli":"#ffad47",
  "Flamigni":"#b99aff", "Verisure":"#4986e7", "SC M2":"#fa573c",
  "Bimpli":"#cca6ac", "Combohr":"#9fc6e7", "Metro":"#fbd75b",
  "EDF":"#8ed3f4", "Masse":"#fbe983", "Distrimalo":"#fad165",
  "Vinoegusto":"#b3dc6c", "La Via del Te":"#a479e2", "Gastrotiger":"#42d692",
  "Labovida":"#7bd148", "AME Hasle":"#4986e7", "APR35":"#9a9cff",
  "Bellomio":"#16a765", "Buffet Plus":"#fbd75b", "Deuba24":"#9a9cff",
  "Groupe GCA":"#4986e7", "Inforegistre":"#c2c2c2", "Mon Emballage":"#cabdbf",
  "PST35":"#a479e2", "Restoflash":"#4986e7", "RME":"#c2c2c2",
  "SUM Online":"#9a9cff", "Storycie":"#4986e7", "Thermifroid":"#9fc6e7",
  "Agence":"#a479e2", "Transfert Pierre":"#c2c2c2", "Autres":"#c2c2c2",
  "Papiers Service":"#c2c2c2", "Pack Prélèvements":"#a479e2", "Facture":"#c2c2c2"
};

function attribuerCouleursPiccolaMia(){
  var folders=DriveApp.getFolderById(PICCOLA_MIA_ID).getFolders();
  var count=0;
  while(folders.hasNext()){
    var f=folders.next(); var name=f.getName(); var c=COULEURS_PICCOLA_MIA[name];
    if(c){try{Drive.Files.update({folderColorRgb:c},f.getId()); count++; Logger.log('OK '+name+' -> '+c);}catch(e){}}
  }
  Logger.log('Done PM: '+count+' folders updated');
}
