#!/usr/bin/env node
// Produit le texte de PDF pour constituer tests/fixtures.
//
//   node tools/ocr_dump.js chemin/vers/facture.pdf [autre.pdf …]
//
// Écrit « tests/fixtures/<nom>.txt » pour chaque PDF (texte extrait localement avec `unpdf`,
// disponible dans node_modules à la racine du dépôt). Attention : c'est une extraction de texte,
// pas l'OCR Google que le script utilise en production. Pour un texte identique à la prod,
// déposer les PDF dans « Factures iFratelli/_Fixtures OCR » et lancer `ocrDump` depuis l'éditeur
// Apps Script : un .txt est créé à côté de chaque PDF.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const fichiers = process.argv.slice(2);
  if (!fichiers.length) { console.error("Usage : node tools/ocr_dump.js facture.pdf [...]"); process.exit(1); }
  let unpdf;
  try { unpdf = require(path.join(__dirname, "..", "..", "..", "node_modules", "unpdf")); }
  catch (e) { console.error("unpdf introuvable : lancer `npm install` à la racine du dépôt pizza-app (" + e.message + ")"); process.exit(1); }
  const dossier = path.join(__dirname, "..", "tests", "fixtures");
  for (const f of fichiers) {
    const octets = new Uint8Array(fs.readFileSync(f));
    const pdf = await unpdf.getDocumentProxy(octets);
    const { text } = await unpdf.extractText(pdf, { mergePages: true });
    const nom = path.basename(f).replace(/\.pdf$/i, "").replace(/[^A-Za-z0-9_-]+/g, "_").toLowerCase() + ".txt";
    fs.writeFileSync(path.join(dossier, nom), text);
    console.log(f + " -> tests/fixtures/" + nom + " (" + text.length + " caractères)");
  }
  console.log("Décrire maintenant l'attendu de chaque fichier dans tests/fixtures/attendus.json.");
}

main().catch((e) => { console.error(e); process.exit(1); });
