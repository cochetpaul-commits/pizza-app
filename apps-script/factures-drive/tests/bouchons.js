// Faux services Google (Gmail, Drive, Sheets, OCR, propriétés) pour tester l'enchaînement complet
// traiterMessages -> analyse -> décision -> anti-doublon -> rangement -> journal, sans compte Google.
// Le texte « OCR » d'une pièce est simplement le contenu du blob (les fixtures sont déjà du texte).
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function creerEnvironnement() {
  let compteur = 0;
  const id = (p) => p + "_" + (++compteur);
  const journalLog = [];
  const mails = [];

  // ---- Blobs
  function blob(nom, contenu, type) {
    const octets = Buffer.from(contenu, "utf8");
    const b = {
      getName: () => nom, getSize: () => octets.length, getBytes: () => [...octets], getContentType: () => type || "application/pdf",
      getDataAsString: () => octets.toString("utf8"), setName: (n) => { nom = n; return b; }, setContentType: (t) => { type = t; return b; },
      copyBlob: () => blob(nom, contenu, type), _contenu: contenu
    };
    return b;
  }

  // ---- Drive
  const fichiers = {};
  function fichier(nom, b, parent) {
    const f = { _id: id("f"), _nom: nom, _blob: b, _desc: "", _parent: parent, _cree: new Date(), _corbeille: false };
    Object.assign(f, {
      getId: () => f._id, getName: () => f._nom, setName: (n) => { f._nom = n; return f; }, getUrl: () => "https://drive.google.com/file/d/" + f._id + "/view",
      setDescription: (d) => { f._desc = d; return f; }, getDescription: () => f._desc, getDateCreated: () => f._cree, getSize: () => f._blob.getSize(),
      getBlob: () => f._blob, getMimeType: () => f._blob.getContentType(), setTrashed: (t) => { f._corbeille = t; return f; },
      moveTo: (d) => { f._parent._fichiers = f._parent._fichiers.filter((x) => x !== f); d._fichiers.push(f); f._parent = d; return f; },
      makeCopy: (n, d) => { const c = fichier(n, b.copyBlob(), d); d._fichiers.push(c); return c; }
    });
    fichiers[f._id] = f;
    return f;
  }
  const dossiers = {};
  function iterateur(liste) { let i = 0; return { hasNext: () => i < liste.length, next: () => liste[i++] }; }
  function dossier(nom, parent) {
    const d = { _id: id("d"), _nom: nom, _dossiers: [], _fichiers: [], _parent: parent, _corbeille: false };
    Object.assign(d, {
      getId: () => d._id, getName: () => d._nom,
      getFoldersByName: (n) => iterateur(d._dossiers.filter((x) => x._nom === n && !x._corbeille)),
      getFilesByName: (n) => iterateur(d._fichiers.filter((x) => x._nom === n && !x._corbeille)),
      getFolders: () => iterateur(d._dossiers.filter((x) => !x._corbeille)), getFiles: () => iterateur(d._fichiers.filter((x) => !x._corbeille)),
      createFolder: (n) => { const s = dossier(n, d); d._dossiers.push(s); return s; },
      createFile: (a, contenu, type) => { const b = typeof a === "string" ? blob(a, contenu, type) : a; const f = fichier(b.getName(), b, d); d._fichiers.push(f); return f; },
      setTrashed: (t) => { d._corbeille = t; return d; },
      moveTo: (p) => { d._parent._dossiers = d._parent._dossiers.filter((x) => x !== d); p._dossiers.push(d); d._parent = p; return d; }
    });
    dossiers[d._id] = d;
    return d;
  }
  const racine = dossier("Mon Drive", null);
  const docsOcr = {};
  const DriveApp = {
    getRootFolder: () => racine,
    getFileById: (i) => { if (fichiers[i]) return fichiers[i]; if (String(i).startsWith("doc_")) return { setTrashed: () => {} }; throw new Error("fichier introuvable : " + i); },
    getFolderById: (i) => { if (dossiers[i]) return dossiers[i]; throw new Error("dossier introuvable : " + i); }
  };
  const pannes = { ocr: 0, ocrErreurs: 0, appelsOcr: 0, pauses: [] };
  const verrou = { pris: false, demandes: 0 };
  const Drive = { Files: {
    create: (meta, b) => {
      pannes.appelsOcr++;
      if (pannes.ocr > 0) { pannes.ocr--; throw new Error("API call to drive.files.create failed with error: User rate limit exceeded"); }
      if (pannes.ocrErreurs > 0) { pannes.ocrErreurs--; throw new Error("Internal error: conversion failed"); }
      const i = id("doc"); docsOcr[i] = b._contenu; return { id: i };
    },
    get: (i) => ({ md5Checksum: fichiers[i] ? md5(fichiers[i]._blob) : null }),
    // nouvelle révision avec le type du blob (reparerTypesFichiersReel) : même identifiant
    update: (meta, i, b) => { if (b && fichiers[i]) fichiers[i]._blob = b; return {}; }
  } };
  const DocumentApp = { openById: (i) => ({ getBody: () => ({ getText: () => docsOcr[i] }) }) };
  function md5(b) { return crypto.createHash("md5").update(Buffer.from(b.getBytes())).digest("hex"); }

  // ---- Sheets
  function feuille(nom) {
    const f = { _nom: nom, _lignes: [] };
    Object.assign(f, {
      getName: () => f._nom, setName: (n) => { f._nom = n; return f; }, appendRow: (r) => { f._lignes.push(r); return f; }, setFrozenRows: () => f, getLastRow: () => f._lignes.length,
      getLastColumn: () => Math.max(...f._lignes.map((l) => l.length), 0), getMaxRows: () => 1000,
      getRange: (r, c, n, m) => ({
        getValues: () => f._lignes.slice(r - 1, r - 1 + n).map((l) => { const out = []; for (let k = 0; k < m; k++) out.push(l[c - 1 + k] === undefined ? "" : l[c - 1 + k]); return out; }),
        setValues: (v) => { for (let k = 0; k < v.length; k++) { if (!f._lignes[r - 1 + k]) f._lignes[r - 1 + k] = []; for (let j = 0; j < v[k].length; j++) f._lignes[r - 1 + k][c - 1 + j] = v[k][j]; } },
        setValue: (v) => { if (!f._lignes[r - 1]) f._lignes[r - 1] = []; f._lignes[r - 1][c - 1] = v; },
        setNumberFormat: () => { f._format = "@"; },
        // TextFinder sur une colonne : recherche par identifiant de fichier dans l'Index (après un tri éventuel)
        createTextFinder: (texte) => ({ matchEntireCell: function() { return this; }, findNext: () => {
          for (let k = r - 1; k < Math.min(f._lignes.length, r - 1 + n); k++) if (String((f._lignes[k] || [])[c - 1]) === String(texte)) return { getRow: () => k + 1 };
          return null;
        } })
      }),
      /** tri de l'onglet (test : indexDeplacer ne doit pas écrire au mauvais endroit) */
      sort: (col) => { const tete = f._lignes[0]; const corps = f._lignes.slice(1).sort((a, b) => String(a[col - 1]).localeCompare(String(b[col - 1]))); f._lignes = [tete].concat(corps); },
      deleteRows: (r, n) => { f._lignes.splice(r - 1, n); }
    });
    return f;
  }
  const classeurs = {};
  function classeur(nom) {
    const c = { _id: id("ss"), _nom: nom, _feuilles: [feuille("Feuille 1")] };
    Object.assign(c, {
      getId: () => c._id, getUrl: () => "https://docs.google.com/spreadsheets/d/" + c._id, getSheetByName: (n) => c._feuilles.find((x) => x._nom === n) || null, insertSheet: (n) => { const f = feuille(n); c._feuilles.push(f); return f; },
      getSheets: () => c._feuilles, deleteSheet: (f) => { c._feuilles = c._feuilles.filter((x) => x !== f); }
    });
    classeurs[c._id] = c;
    return c;
  }
  const SpreadsheetApp = {
    create: (nom) => { const c = classeur(nom); const f = fichier(nom, blob(nom, "", "sheet"), racine); f._id = c._id; fichiers[c._id] = f; racine._fichiers.push(f); return c; },
    open: (f) => classeurs[f.getId()]
  };

  // ---- Gmail
  const fils = [];
  const labels = {};
  function message(o) {
    const m = { _id: id("m"), _labels: [] };
    Object.assign(m, {
      getId: () => m._id, getDate: () => new Date(o.date), getFrom: () => o.from, getTo: () => o.to || "", getCc: () => o.cc || "", getBcc: () => "",
      getSubject: () => o.subject || "", getPlainBody: () => o.corps || "",
      getAttachments: () => (o.pieces || []).map((p) => blob(p.nom, p.contenu, p.type))
    });
    return m;
  }
  function fil(messagesDef) {
    const t = { _id: id("t"), _messages: messagesDef.map(message), _labels: [] };
    Object.assign(t, { getId: () => t._id, getMessages: () => t._messages, addLabel: (l) => { if (!t._labels.includes(l.getName())) t._labels.push(l.getName()); return t; } });
    fils.push(t);
    return t;
  }
  const GmailApp = {
    search: (q, debut, n) => { const tri = [...fils].sort((a, b) => b._messages[0].getDate() - a._messages[0].getDate()); return tri.slice(debut || 0, (debut || 0) + (n || 50)); },
    getUserLabelByName: (n) => labels[n] || null, createLabel: (n) => (labels[n] = { getName: () => n }),
    getMessageById: (i) => fils.flatMap((t) => t._messages).find((m) => m._id === i)
  };

  // ---- Divers
  const props = {};
  const Utilities = {
    formatDate: (d, tz, fmt) => {
      const p = (n) => String(n).padStart(2, "0"), y = d.getFullYear(), M = p(d.getMonth() + 1), D = p(d.getDate());
      return fmt.replace("yyyy", y).replace("MM", M).replace("dd", D);
    },
    DigestAlgorithm: { MD5: "md5" },
    sleep: (ms) => { pannes.pauses.push(ms); },
    computeDigest: (alg, octets) => [...crypto.createHash("md5").update(Buffer.from(octets)).digest()].map((x) => (x > 127 ? x - 256 : x))
  };
  const ctx = {
    console, Logger: { log: (m) => journalLog.push(String(m)) },
    DriveApp, Drive, DocumentApp, SpreadsheetApp, GmailApp, Utilities,
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; }, getKeys: () => Object.keys(props) }) },
    MailApp: { sendEmail: (o) => mails.push(o) },
    LockService: { getScriptLock: () => ({ tryLock: () => { verrou.demandes++; if (verrou.pris) return false; verrou.pris = true; return true; }, releaseLock: () => { verrou.pris = false; } }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ everyHours: () => ({ create: () => {} }), everyDays: () => ({ atHour: () => ({ create: () => {} }) }), onWeekDay: () => ({ atHour: () => ({ create: () => {} }) }) }) }), WeekDay: { MONDAY: 1 } }
  };
  vm.createContext(ctx);
  const src = path.join(__dirname, "..", "src");
  fs.readdirSync(src).filter((f) => f.endsWith(".js")).sort().forEach((f) => vm.runInContext(fs.readFileSync(path.join(src, f), "utf8"), ctx, { filename: f }));

  // Aides pour les tests
  const aides = {
    ctx, racine, fils, fil, mails, journalLog, props, pannes, verrou,
    /** Date du contexte VM (pour simuler l'horloge : DateVm.now = ...) */
    DateVm: vm.runInContext("Date", ctx),
    fixture: (nom) => fs.readFileSync(path.join(__dirname, "fixtures", nom + ".txt"), "utf8"),
    /** Liste "chemin/nom" de tous les fichiers sous « Factures iFratelli » (hors journal) */
    arbre: () => {
      const out = [];
      const it = racine.getFoldersByName("Factures iFratelli");
      if (!it.hasNext()) return out;
      (function parcourir(d, chemin) {
        d._fichiers.filter((f) => !f._corbeille && f._blob.getContentType() !== "sheet").forEach((f) => out.push(chemin + "/" + f._nom));
        d._dossiers.filter((s) => !s._corbeille).forEach((s) => parcourir(s, chemin + "/" + s._nom));
      })(it.next(), "");
      return out.sort();
    },
    feuille: (nom) => { const c = Object.values(classeurs).find((x) => x._nom === "Journal factures"); return c ? c.getSheetByName(nom)._lignes.slice(1) : []; },
    onglet: (nom) => { const c = Object.values(classeurs).find((x) => x._nom === "Journal factures"); return c ? c.getSheetByName(nom) : null; },
    fichierParId: (i) => fichiers[i],
    fournisseurs: () => { const c = Object.values(classeurs).find((x) => x._nom === "Fournisseurs iFratelli"); return c ? c.getSheets()[0]._lignes.slice(1) : []; }
  };
  return aides;
}

module.exports = { creerEnvironnement };
