import type { ParsedComboDocument, ComboEmployeePresence, ComboDayDetail } from "./types";

// ── Helpers ──────────────────────────────────────────────────────────────

function ddmmyyyyToISO(s: string): string {
  const m = s.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return s;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Parse "39h00" or "38h50" → decimal hours (39.00, 38.83) */
function parseHM(s: string): number {
  const m = s.match(/(\d+)h(\d+)/);
  if (!m) return 0;
  return parseInt(m[1]) + parseInt(m[2]) / 60;
}

/** Parse decimal "38.83" or "38,83" → number */
function parseDec(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function parseComboName(raw: string): { prenom: string; nom: string } {
  const parts = raw.trim().split(/\s+/);
  const nomParts: string[] = [];
  const prenomParts: string[] = [];
  for (const p of parts) {
    if (p === p.toUpperCase() && /[A-Z]/.test(p)) {
      nomParts.push(p);
    } else {
      prenomParts.push(p);
    }
  }
  return {
    prenom: prenomParts.join(" ") || parts[0] || "",
    nom: nomParts.join(" ") || parts.slice(1).join(" ") || "",
  };
}

// ── Main parser ──────────────────────────────────────────────────────────

export function parseComboDocument(text: string): ParsedComboDocument {
  // Extract period
  const periodeMatch = text.match(/p[ée]riode\s+du\s+(\d{2}\/\d{2}\/\d{4})\s+au\s+(\d{2}\/\d{2}\/\d{4})/i);
  const periode_debut = periodeMatch ? ddmmyyyyToISO(periodeMatch[1]) : "";
  const periode_fin = periodeMatch ? ddmmyyyyToISO(periodeMatch[2]) : "";

  // Extract establishment name (first line after date d'impression)
  const etabMatch = text.match(/Date d'impression[^\n]*\n([^\n]+)/i);
  const etablissement_nom = etabMatch ? etabMatch[1].trim() : "";

  // Extract equipe from filename context or content
  const equipeMatch = text.match(/[ÉE]quipe\s*(?::\s*)?([^\n,]+)/i);
  let equipe: string | null = null;
  // Try to find the team from the first employee's data
  const firstEquipeMatch = text.match(/(?:Cuisine|Salle|Bar|Service|Shop)/i);
  if (firstEquipeMatch) equipe = firstEquipeMatch[0];
  else if (equipeMatch) equipe = equipeMatch[1].trim();

  // Split by employee blocks
  const salarieParts = text.split(/Salari[ée]\s*:\s*/i);
  // First part is header, skip it
  const employeBlocks = salarieParts.slice(1);

  const employes: ComboEmployeePresence[] = [];

  for (const block of employeBlocks) {
    const lines = block.split("\n");
    const nameLine = lines[0]?.trim() ?? "";
    const { prenom, nom } = parseComboName(nameLine);
    const combo_nom = nameLine;

    // Extract establishment for this employee
    const empEtabMatch = block.match(/[ÉE]tablissement\s*:\s*(.+)/i);
    const etablissement_combo = empEtabMatch ? empEtabMatch[1].trim() : etablissement_nom;

    // Extract team
    const empEquipeLines = block.match(/(?:Cuisine|Salle|Bar|Service|Shop)/gi);
    const empEquipe = empEquipeLines?.[0] ?? equipe;

    // Extract totals
    const hPlanMatch = block.match(/Total des heures planifi[ée]es\s*:\s*[^\n]*?\/\s*([\d.,]+)/i)
      ?? block.match(/Total des heures planifi[ée]es\s*:\s*(\d+h\d+)/i);
    const hTravMatch = block.match(/Total des heures travaill[ée]es\s*:\s*[^\n]*?\/\s*([\d.,]+)/i)
      ?? block.match(/Total des heures travaill[ée]es\s*:\s*(\d+h\d+)/i);
    const hContratMatch = block.match(/Heures pr[ée]vues dans le contrat\s*:\s*[^\n]*?\/\s*([\d.,]+)/i)
      ?? block.match(/Heures pr[ée]vues dans le contrat\s*:\s*(\d+h\d+)/i);
    const repasMatch = block.match(/Total des repas\s*:\s*(\d+)/i);
    const joursMatch = block.match(/Nombre de jours travaill[ée]s\s*:\s*(\d+)/i);

    const heures_planifiees = hPlanMatch
      ? (hPlanMatch[1].includes("h") ? parseHM(hPlanMatch[1]) : parseDec(hPlanMatch[1]))
      : 0;
    const heures_travaillees = hTravMatch
      ? (hTravMatch[1].includes("h") ? parseHM(hTravMatch[1]) : parseDec(hTravMatch[1]))
      : 0;
    const heures_contrat = hContratMatch
      ? (hContratMatch[1].includes("h") ? parseHM(hContratMatch[1]) : parseDec(hContratMatch[1]))
      : 0;
    const nb_repas = repasMatch ? parseInt(repasMatch[1]) : 0;
    const nb_jours_travailles = joursMatch ? parseInt(joursMatch[1]) : 0;

    // Parse daily details (best effort)
    const detail_jours = parseDailyDetails(block);

    employes.push({
      combo_nom,
      prenom,
      nom,
      etablissement_combo,
      equipe: empEquipe,
      heures_planifiees,
      heures_travaillees,
      heures_contrat,
      nb_repas,
      nb_jours_travailles,
      detail_jours,
    });
  }

  return { etablissement_nom, equipe, periode_debut, periode_fin, employes };
}

// ── Daily detail parsing ─────────────────────────────────────────────────

function parseDailyDetails(block: string): ComboDayDetail[] {
  const days: ComboDayDetail[] = [];

  // Find all date anchors DD/MM/YY
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{2})\b/g;
  let match;
  const datePositions: { date: string; pos: number }[] = [];

  while ((match = dateRegex.exec(block)) !== null) {
    // Skip if this looks like a time (preceded by colon)
    if (match.index > 0 && block[match.index - 1] === ":") continue;
    const iso = `20${match[3]}-${match[2]}-${match[1]}`;
    datePositions.push({ date: iso, pos: match.index });
  }

  // For each date, extract the text between it and the previous date
  for (let i = 0; i < datePositions.length; i++) {
    const { date } = datePositions[i];
    const d = new Date(date + "T12:00:00");
    const jourNames = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const jour = jourNames[d.getDay()] ?? "?";

    // Extract time worked from the line containing this date
    const lineStart = Math.max(0, datePositions[i].pos - 300);
    const lineEnd = datePositions[i].pos + 50;
    const vicinity = block.slice(lineStart, lineEnd);

    // Find tps_travail patterns (Xh XX format)
    const tpsMatches = vicinity.match(/(\d{1,2}h\d{2})/g) ?? [];
    // Last one is usually the total time worked for that day
    const tpsTravail = tpsMatches.length > 0 ? parseHM(tpsMatches[tpsMatches.length - 1]) : 0;

    // Find repas count
    const repasMatch = vicinity.match(/(\d+)\s*\(AN\)/);
    const repas = repasMatch ? parseInt(repasMatch[1]) : 0;

    days.push({
      date,
      jour,
      shifts: [{
        prevu: null,
        pause_prevu: null,
        reel: null,
        pause_reel: null,
        emarge: null,
        ecart_minutes: 0,
        tps_travail_minutes: Math.round(tpsTravail * 60),
        equipe: null,
        repas,
      }],
    });
  }

  return days;
}
