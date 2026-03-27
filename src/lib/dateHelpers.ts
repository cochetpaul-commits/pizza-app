/** Date YYYY-MM-DD en heure de Paris, offsetDays = -N pour les jours précédents */
export function getParisDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(d);
}

/** YYYY-MM-DD → ISO week string "YYYY-WW" */
export function dateToISOWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

/** ISO week "YYYY-WW" → Monday UTC Date */
export function isoWeekToMonday(weekStr: string): Date {
  const [y, w] = weekStr.split("-").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  const week1Mon = new Date(Date.UTC(y, 0, 4 - dow + 1));
  const monday = new Date(week1Mon);
  monday.setUTCDate(week1Mon.getUTCDate() + (w - 1) * 7);
  return monday;
}

/** UTC Date → "YYYY-MM-DD" */
export function fmtDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}
