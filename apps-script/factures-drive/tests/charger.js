// Charge tous les fichiers de src/ dans un même contexte, comme le fait Apps Script
// (un seul espace global), avec des bouchons pour les services Google. Les tests
// n'appellent que les fonctions pures ; les bouchons évitent juste les erreurs au chargement.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function chargerContexte() {
  const journal = [];
  const bouchon = new Proxy(function() {}, { get: () => bouchon, apply: () => bouchon, construct: () => bouchon });
  const ctx = {
    console,
    Logger: { log: (m) => journal.push(String(m)) },
    Utilities: bouchon, DriveApp: bouchon, GmailApp: bouchon, SpreadsheetApp: bouchon, DocumentApp: bouchon,
    Drive: bouchon, MailApp: bouchon, PropertiesService: bouchon, ScriptApp: bouchon, Session: bouchon, LockService: bouchon,
    _journalTest: journal
  };
  vm.createContext(ctx);
  const dossier = path.join(__dirname, "..", "src");
  fs.readdirSync(dossier).filter((f) => f.endsWith(".js")).sort().forEach((f) => {
    vm.runInContext(fs.readFileSync(path.join(dossier, f), "utf8"), ctx, { filename: f });
  });
  return ctx;
}

function lireFixtures() {
  const dossier = path.join(__dirname, "fixtures");
  const attendus = JSON.parse(fs.readFileSync(path.join(dossier, "attendus.json"), "utf8"));
  const cas = [];
  for (const nom of Object.keys(attendus)) {
    if (nom.startsWith("_")) continue;
    const fichier = path.join(dossier, nom + ".txt");
    if (!fs.existsSync(fichier)) throw new Error("Fixture manquante : " + fichier);
    cas.push({ nom, texte: fs.readFileSync(fichier, "utf8"), ...attendus[nom] });
  }
  return cas;
}

module.exports = { chargerContexte, lireFixtures };
