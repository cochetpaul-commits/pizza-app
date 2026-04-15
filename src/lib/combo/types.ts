export type ComboShiftDetail = {
  prevu: string | null;
  pause_prevu: number | null;
  reel: string | null;
  pause_reel: number | null;
  emarge: string | null;
  ecart_minutes: number;
  tps_travail_minutes: number;
  equipe: string | null;
  repas: number;
};

export type ComboDayDetail = {
  date: string;       // YYYY-MM-DD
  jour: string;       // "Lun", "Mar", etc.
  shifts: ComboShiftDetail[];
};

export type ComboEmployeePresence = {
  combo_nom: string;
  prenom: string;
  nom: string;
  etablissement_combo: string;
  equipe: string | null;
  heures_planifiees: number;   // decimal hours
  heures_travaillees: number;
  heures_contrat: number;
  nb_repas: number;
  nb_jours_travailles: number;
  detail_jours: ComboDayDetail[];
};

export type ParsedComboDocument = {
  etablissement_nom: string;
  equipe: string | null;
  periode_debut: string;       // YYYY-MM-DD
  periode_fin: string;
  employes: ComboEmployeePresence[];
};
