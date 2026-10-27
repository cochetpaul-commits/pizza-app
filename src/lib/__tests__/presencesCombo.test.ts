import { describe, expect, it } from "vitest";
import { agregerPlannings, heures } from "@/lib/combo/presences";
import type { ComboShift } from "@/lib/combo/api";

const s = (date: string, debut: string, fin: string, reel?: [string, string], pause = 30): ComboShift => ({
  starts_at: `${date}T${debut}:00.000+02:00`, ends_at: `${date}T${fin}:00.000+02:00`, break_duration: pause, note: null,
  firstname: "Corentin", lastname: "Bodin", employee_number: "00013", location_id: "loc", location_name: "Bello mio", team_name: "Cuisine", team_id: null, label_name: null,
  date, real_starts_at: reel ? `${date}T${reel[0]}:00.000+02:00` : null, real_ends_at: reel ? `${date}T${reel[1]}:00.000+02:00` : null, real_break_duration: reel ? pause : null,
});

describe("présences Combo", () => {
  it("le réel validé fait les heures travaillées, le planning les heures planifiées", () => {
    // 06/10 réel : 09:30-13:45 pour 09:30-14:15 planifié
    const m = agregerPlannings([s("2026-10-06", "09:30", "14:15", ["09:30", "13:45"]), s("2026-10-06", "18:00", "22:30", ["18:00", "21:35"])], "2026-10-26");
    const e = m.get("Corentin Bodin")!;
    expect(heures(e.minutesPlanifiees)).toBe(8.25);
    expect(heures(e.minutesTravaillees)).toBe(6.83);
    expect(e.joursTravailles.size).toBe(1);
    expect(e.repas).toBe(0);
  });

  it("un service à venir compte dans le planifié, pas dans le travaillé", () => {
    const m = agregerPlannings([s("2026-10-26", "09:30", "15:00", ["09:30", "15:00"]), s("2026-10-30", "09:30", "15:00", ["09:30", "15:00"])], "2026-10-26");
    const e = m.get("Corentin Bodin")!;
    expect(heures(e.minutesPlanifiees)).toBe(10);
    expect(heures(e.minutesTravaillees)).toBe(5);
    expect(e.repas).toBe(1);
    expect([...e.joursTravailles]).toEqual(["2026-10-26"]);
  });
});
