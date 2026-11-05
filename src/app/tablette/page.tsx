"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useTablette } from "@/lib/tablette/store";
import { useBureau } from "@/hooks/useBureau";
import { navEtablissement, navTablette, NAV_EQUIPIER, type NavEntry, type NavItemV2 } from "@/components/layout/SidebarNav";
import {
  IconBook, IconTag, IconCalculator, IconChefHat, IconClipboard, IconShoppingBag, IconPackage, IconTruck, IconCalendarEvent, IconFileText, IconUsers, IconTrendingUp, IconSettings, IconBox,
} from "@/components/layout/Icons";
import { BORD, MUTED, INTERTITRE, OSWALD } from "@/components/ui/charte";
import type { Role } from "@/lib/rbac";

/**
 * Accueil de la tablette (05/11/2026, logique de Paul) : la tablette est un poste de service partagé. Après son code,
 * chacun arrive ici, sur les seules sections Service, Cuisine et Achats et stock, en grosses touches.
 * Pas de chiffres personnels : chacun les retrouve avec son propre compte, sur son téléphone ou son ordinateur.
 */
const ICONES: Record<string, (p: { size?: number; color?: string }) => React.ReactElement> = {
  book: IconBook, tag: IconTag, calculator: IconCalculator, chefHat: IconChefHat, clipboard: IconClipboard, shoppingBag: IconShoppingBag,
  package: IconPackage, truck: IconTruck, calendarEvent: IconCalendarEvent, fileText: IconFileText, users: IconUsers, trendingUp: IconTrendingUp, settings: IconSettings, box: IconBox,
};

export default function AccueilTablette() {
  const router = useRouter();
  const bureau = useBureau();
  const tablette = useTablette();
  const { role, can } = useProfile();
  const { current } = useEtablissement();
  const piccola = !!current?.slug?.includes("piccola");
  useEffect(() => { if (!tablette.actif) router.replace("/"); }, [tablette.actif, router]);

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

  const prenom = tablette.employe?.prenom ?? "";
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "22px 28px 60px" : "14px 14px 60px", display: "grid", gap: 18 }}>
      <div>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 30 : 24, textTransform: "uppercase", margin: 0, color: "#1a1a1a" }}>{prenom ? `Bonjour ${prenom}` : "Tablette"}</h1>
        <div style={{ color: MUTED, fontSize: 13.5, marginTop: 4 }}>{current?.nom ?? ""} · tout ce que tu fais ici est enregistré à ton nom. Pense à « Changer d&apos;employé » quand tu as fini.</div>
      </div>
      {sections.map((s) => (
        <div key={s.titre} style={{ display: "grid", gap: 8 }}>
          <span style={INTERTITRE}>{s.titre}</span>
          <div style={{ display: "grid", gridTemplateColumns: bureau ? "repeat(4, 1fr)" : "repeat(2, 1fr)", gap: 10 }}>
            {s.pages.map((p) => {
              const Icone = p.icon ? ICONES[p.icon] : null;
              return (
                <Link key={p.href} href={p.href} style={{ background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "22px 14px", display: "grid", justifyItems: "center", gap: 10, textDecoration: "none", color: "#1a1a1a", touchAction: "manipulation" }}>
                  {Icone && <Icone size={30} color="#D4775A" />}
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "center" }}>{p.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
