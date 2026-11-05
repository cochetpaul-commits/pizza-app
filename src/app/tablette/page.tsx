"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchApi } from "@/lib/fetchApi";
import { COULEUR_MIDI, COULEUR_SOIR } from "@/components/analyse/gabarit";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/ProfileContext";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useTablette } from "@/lib/tablette/store";
import { useBureau } from "@/hooks/useBureau";
import { navEtablissement, navTablette, NAV_EQUIPIER, type NavEntry, type NavItemV2 } from "@/components/layout/SidebarNav";
import {
  IconBook, IconTag, IconCalculator, IconChefHat, IconClipboard, IconShoppingBag, IconPackage, IconTruck, IconCalendarEvent, IconFileText, IconUsers, IconTrendingUp, IconSettings, IconBox,
} from "@/components/layout/Icons";
import { MUTED, OSWALD } from "@/components/ui/charte";
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

/** Une couleur par section (05/11/2026, demande de Paul) */
const COULEURS: Record<string, string> = { Service: "#D4775A", Cuisine: "#4a6741", "Achats et stock": "#2563EB" };
type Meteo = { service: string; emoji: string | null; description: string | null; temp: number | null };
const jourIso = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

export default function AccueilTablette() {
  const router = useRouter();
  const bureau = useBureau();
  const tablette = useTablette();
  const { role, can } = useProfile();
  const { current } = useEtablissement();
  const piccola = !!current?.slug?.includes("piccola");
  useEffect(() => { if (!tablette.actif) router.replace("/"); }, [tablette.actif, router]);
  // Météo du jour, midi et soir (05/11/2026)
  const [meteo, setMeteo] = useState<Meteo[]>([]);
  useEffect(() => {
    const j = jourIso();
    fetchApi(`/api/meteo?from=${j}&to=${j}`).then((r) => (r.ok ? r.json() : null)).then((d) => setMeteo(((d?.meteo ?? []) as Meteo[]))).catch(() => undefined);
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

  const prenom = tablette.employe?.prenom ?? "";
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const taille = bureau ? 180 : 150;
  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: bureau ? "26px 28px 60px" : "16px 14px 60px", display: "grid", gap: 22, justifyItems: "center", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 12, letterSpacing: 2, textTransform: "uppercase", color: "#D4775A", fontWeight: 700 }}>{date}</div>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 34 : 26, textTransform: "uppercase", margin: "4px 0 0", color: "#1a1a1a" }}>{prenom ? `Bonjour ${prenom}` : "Tablette"}</h1>
        <div style={{ color: MUTED, fontSize: 13.5, marginTop: 4 }}>{current?.nom ?? ""} · ce que tu fais ici est enregistré à ton nom. Pense à « Changer d&apos;employé » quand tu as fini.</div>
      </div>
      {meteo.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          {meteo.map((m) => {
            const c = m.service === "midi" ? COULEUR_MIDI : COULEUR_SOIR;
            return (
              <div key={m.service} style={{ background: `${c}1a`, borderRadius: 14, padding: "10px 18px", display: "flex", alignItems: "center", gap: 10, boxShadow: `inset 0 0 0 1px ${c}40` }}>
                <span style={{ fontSize: 28, lineHeight: 1 }}>{m.emoji ?? ""}</span>
                <span style={{ textAlign: "left" }}>
                  <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: c }}>{m.service === "midi" ? "Midi" : "Soir"}</span>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 22 }}>{m.temp != null ? `${Math.round(m.temp)} °` : ""}</span>
                  <span style={{ fontSize: 12.5, color: MUTED, marginLeft: 6 }}>{m.description ?? ""}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {sections.map((s) => {
        const c = COULEURS[s.titre] ?? "#1a1a1a";
        return (
          <div key={s.titre} style={{ display: "grid", gap: 10, justifyItems: "center", width: "100%" }}>
            <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, letterSpacing: 2, textTransform: "uppercase", color: c }}>{s.titre}</span>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              {s.pages.map((p) => {
                const Icone = p.icon ? ICONES[p.icon] : null;
                return (
                  <Link key={p.href} href={p.href} style={{ width: taille, minHeight: 120, background: `linear-gradient(160deg, ${c} 0%, ${c}cc 100%)`, borderRadius: 16, padding: "20px 12px", display: "grid", justifyItems: "center", alignContent: "center", gap: 10, textDecoration: "none", color: "#fff", touchAction: "manipulation" }}>
                    {Icone && <Icone size={32} color="#fff" />}
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 17, textTransform: "uppercase", letterSpacing: ".03em", textAlign: "center", lineHeight: 1.15 }}>{p.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
