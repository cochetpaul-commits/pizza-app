import type { UnitType } from "./types";

export const UNIT_LABELS: Record<UnitType, string> = {
  g: "g",
  ml: "ml",
  pcs: "pcs",
  pinch: "pincée",
  dash: "trait",
};

export const ALL_UNITS: UnitType[] = ["g", "ml", "pcs", "pinch", "dash"];
