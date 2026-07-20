// ═══════════════════════════════════════════════════════════════
// Widget Scriptable — Bello Mio Live
// ═══════════════════════════════════════════════════════════════
// 1. Installer "Scriptable" depuis l'App Store
// 2. Copier ce script dans Scriptable
// 3. Ajouter un widget Scriptable sur l'ecran d'accueil
// 4. Configurer le widget pour utiliser ce script
// ═══════════════════════════════════════════════════════════════

// ── CONFIG ───────────────────────────────────────────────────
const API_URL = "https://pizza-app-ifratelli.vercel.app/api/popina-live";
const LIVE_WIDGET_KEY = "REMPLACER_PAR_VOTRE_TOKEN"; // env LIVE_WIDGET_KEY sur Vercel
const APP_URL = "https://pizza-app-ifratelli.vercel.app/ventes/live";
// ─────────────────────────────────────────────────────────────

async function fetchLive() {
  const today = new Date().toISOString().slice(0, 10);
  const url = `${API_URL}?day=${today}&token=${LIVE_WIDGET_KEY}`;
  const req = new Request(url);
  req.timeoutInterval = 10;
  try {
    return await req.loadJSON();
  } catch {
    return null;
  }
}

function fmtEur(n) {
  return Math.round(n).toLocaleString("fr-FR");
}

function createWidget(data) {
  const w = new ListWidget();
  w.backgroundColor = new Color("#f2ede4");
  w.setPadding(12, 14, 12, 14);
  w.url = APP_URL;

  // Header
  const header = w.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();

  const title = header.addText("BELLO MIO");
  title.font = Font.boldSystemFont(11);
  title.textColor = new Color("#D4775A");

  header.addSpacer();

  const live = header.addText("LIVE");
  live.font = Font.boldSystemFont(9);
  live.textColor = new Color("#fff");
  live.backgroundColor = new Color("#2563EB");

  w.addSpacer(6);

  if (!data || data.totalCA === 0) {
    const noData = w.addText("Pas de ventes");
    noData.font = Font.regularSystemFont(13);
    noData.textColor = new Color("#999");
    return w;
  }

  // CA
  const caStack = w.addStack();
  caStack.layoutHorizontally();
  caStack.bottomAlignContent();

  const ca = caStack.addText(`${fmtEur(data.totalCA)} €`);
  ca.font = Font.boldSystemFont(28);
  ca.textColor = new Color("#1a1a1a");
  ca.minimumScaleFactor = 0.6;

  w.addSpacer(4);

  // Couverts + ticket moyen
  const tm = data.couverts > 0 ? data.totalCA / data.couverts : 0;
  const sub = w.addText(`${data.couverts} cvts · TM ${fmtEur(tm)} €`);
  sub.font = Font.mediumSystemFont(11);
  sub.textColor = new Color("#666");

  w.addSpacer(8);

  // Top 3 products
  const top = (data.topProducts || []).slice(0, 3);
  for (const p of top) {
    const row = w.addStack();
    row.layoutHorizontally();
    row.centerAlignContent();
    row.spacing = 4;

    const name = row.addText(p.name);
    name.font = Font.regularSystemFont(10);
    name.textColor = new Color("#333");
    name.lineLimit = 1;

    row.addSpacer();

    const qty = row.addText(`${p.qty}x`);
    qty.font = Font.mediumSystemFont(10);
    qty.textColor = new Color("#999");

    const pca = row.addText(`${fmtEur(p.ca)}€`);
    pca.font = Font.boldSystemFont(10);
    pca.textColor = new Color("#D4775A");

    w.addSpacer(2);
  }

  // Derniere MAJ
  w.addSpacer(4);
  const now = new Date();
  const time = w.addText(`${now.getHours()}h${String(now.getMinutes()).padStart(2, "0")}`);
  time.font = Font.regularSystemFont(8);
  time.textColor = new Color("#bbb");
  time.rightAlignText();

  return w;
}

const data = await fetchLive();
const widget = createWidget(data);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  widget.presentMedium();
}

Script.complete();
