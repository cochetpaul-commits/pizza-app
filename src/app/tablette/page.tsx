"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { etatTablette, useTablette } from "@/lib/tablette/store";
import { useBureau } from "@/hooks/useBureau";
import { navEtablissement, navTablette, NAV_EQUIPIER, type NavEntry, type NavItemV2 } from "@/components/layout/SidebarNav";
import { AccueilTabletteVue, type MeteoTablette } from "@/components/tablette/AccueilTablette";
import type { Role } from "@/lib/rbac";

/**
 * Accueil de la tablette (05/11/2026, logique de Paul) : la tablette est un poste de service partagé. Après son code,
 * chacun arrive ici, sur les seules sections Service, Cuisine et Achats et stock, en grosses touches.
 * Pas de chiffres personnels : chacun les retrouve avec son propre compte, sur son téléphone ou son ordinateur.
 */

const jourIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default function AccueilTablette() {
  const router = useRouter();
  const bureau = useBureau();
  const tablette = useTablette();
  const { role, can } = useProfile();
  const { current } = useEtablissement();
  const piccola = !!current?.slug?.includes("piccola");
  // Lu directement dans le stockage : au premier rendu, le store n'est pas encore hydraté (il renvoyait « inactif »)
  useEffect(() => { if (!etatTablette().actif) router.replace("/"); }, [router]);
  // Météo du jour, midi et soir (05/11/2026)
  const [meteo, setMeteo] = useState<MeteoTablette[]>([]);
  useEffect(() => {
    const j = jourIso();
    fetchApi(`/api/meteo?from=${j}&to=${j}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMeteo(((d?.meteo ?? []) as MeteoTablette[]))).catch(() => undefined);
  }, []);

  const sections = useMemo(() => {
    const manager = role === "group_admin" || role === "manager";
    const base = navTablette(manager ? navEtablissement(piccola ? "/piccola-mia" : "/bello-mio", piccola) : NAV_EQUIPIER);
    const visible = (i: { roles?: Role[]; permission?: string }) => (!i.roles || (role != null && i.roles.includes(role))) && (!i.permission || can(i.permission));
    const out: { titre: string; pages: NavItemV2[] }[] = [];
    for (const e of base as NavEntry[]) {
      if (e.kind === "divider") out.push({ titre: e.label ?? "", pages: [] });
      else if (out.length && e.kind === "page" && e.href !== "/tablette" && visible(e)) out[out.length - 1].pages.push(e);
      else if (out.length && e.kind === "group" && visible(e)) out[out.length - 1].pages.push(...e.items.filter(visible));
    }
    return out.filter((s) => s.pages.length);
  }, [role, can, piccola]);

  return <AccueilTabletteVue prenom={tablette.employe?.prenom ?? ""} etabNom={current?.nom ?? ""} meteo={meteo} sections={sections} bureau={bureau} />;
}
