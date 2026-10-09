"use client";

import { useEffect, useState } from "react";
import type { DateRange } from "@/components/ui/DateRangePicker";
import { useEtablissement } from "@/lib/EtablissementContext";
import { fetchApi } from "@/lib/fetchApi";
import { periodePrecedente } from "./gabarit";

/** Ce que les pages Analyse lisent dans la réponse de /api/ventes/stats (agrégat Popina) */
export type ServiceJour = { date: string; jour: string; svc: "midi" | "soir"; ttc: number; ht: number; cov: number; sp_ttc: number; sp_ht: number; emp_ttc: number; emp_ht: number; sp_cov: number; z_ttc: Record<string, number>; z_ht: Record<string, number> };
export type StatsVentes = {
  dates: string[];
  ca_ttc: number; ca_ht: number; couverts: number; tickets: number;
  /** Ticket moyen par date (même ordre que `dates`) */
  tm_ttc: number[]; tm_ht: number[];
  /** CA par zone de la caisse, une valeur par date (même ordre que `dates`) */
  zones_ttc: Record<string, number[]>; zones_ht: Record<string, number[]>;
  place_sur_ttc: number; place_sur_ht: number; place_emp_ttc: number; place_emp_ht: number;
  cov_sur: number; cov_emp: number; cov_midi: number; cov_soir: number; tickets_midi: number; tickets_soir: number;
  services: ServiceJour[];
  food_ttc: number; food_ht: number; drink_ttc: number; drink_ht: number;
  hourly_ttc: number[];
  pay?: Record<string, number>;
};
export type MeteoJour = { emoji: string; desc: string; temp: number };
/** Ticket moyen TTC par couvert sur place sur la période */
export const ticketMoyen = (s: StatsVentes | null | undefined) => (s && s.cov_sur > 0 ? s.place_sur_ttc / s.cov_sur : 0);
/** Total par zone sur la période (les zones sont données jour par jour) */
export const totalZones = (s: StatsVentes) => Object.fromEntries(Object.entries(s.zones_ttc).map(([z, v]) => [z, (Array.isArray(v) ? v : [v]).reduce((t, x) => t + (Number(x) || 0), 0)]));

export type EtatStats = { chargement: boolean; erreur: string | null; stats: StatsVentes | null; prec: StatsVentes | null; meteo: Record<string, MeteoJour> };

/** Stats de la période et de la période précédente (même longueur), météo par service en option */
export function useStatsVentes(range: DateRange, avecMeteo = false): EtatStats {
  const { current: etab } = useEtablissement();
  const [etat, setEtat] = useState<EtatStats & { cle: string }>({ cle: "", chargement: true, erreur: null, stats: null, prec: null, meteo: {} });
  const etabId = etab?.id ?? null;
  const cle = `${etabId}|${range.from}|${range.to}`;

  useEffect(() => {
    if (!etabId) return;
    let annule = false;
    (async () => {
      const prec = periodePrecedente(range);
      const charge = async (r: DateRange): Promise<StatsVentes | null> => {
        const res = await fetchApi(`/api/ventes/stats?etablissement_id=${etabId}&from=${r.from}&to=${r.to}`);
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "Chargement impossible");
        const j = await res.json();
        return (j?.stats ?? null) as StatsVentes | null;
      };
      try {
        const [stats, precStats, meteoRes] = await Promise.all([
          charge(range), charge(prec).catch(() => null),
          avecMeteo ? fetchApi(`/api/meteo?from=${range.from}&to=${range.to}`).catch(() => null) : Promise.resolve(null),
        ]);
        const meteo: Record<string, MeteoJour> = {};
        if (meteoRes && meteoRes.ok) {
          const mj = await meteoRes.json().catch(() => null);
          for (const m of (mj?.meteo ?? []) as { date_service: string; service: string; emoji: string; description: string; temp: number }[]) {
            meteo[`${m.date_service}:${m.service}`] = { emoji: m.emoji, desc: m.description, temp: m.temp };
          }
        }
        if (annule) return;
        setEtat({ cle, chargement: false, erreur: null, stats, prec: precStats, meteo });
      } catch (e) {
        if (!annule) setEtat({ cle, chargement: false, erreur: e instanceof Error ? e.message : "Chargement impossible", stats: null, prec: null, meteo: {} });
      }
    })();
    return () => { annule = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle, avecMeteo]);

  // Période ou établissement changés : on affiche « chargement » sans attendre l'effet
  if (etat.cle !== cle) return { chargement: true, erreur: null, stats: etat.stats, prec: etat.prec, meteo: etat.meteo };
  return etat;
}
