"use client";

import Link from "next/link";
import {
  IconBook, IconTag, IconCalculator, IconChefHat, IconClipboard, IconShoppingBag, IconPackage, IconTruck, IconCalendarEvent, IconFileText, IconUsers, IconTrendingUp, IconSettings, IconBox,
} from "@/components/layout/Icons";
import { COULEUR_MIDI, COULEUR_SOIR } from "@/components/analyse/gabarit";
import { BORD, MUTED, OSWALD } from "@/components/ui/charte";

/** Accueil de la tablette, la partie affichage (05/11/2026) : cartes blanches à bord fin, la couleur seulement sur l'icône et le point de la section */
const ICONES: Record<string, (p: { size?: number; color?: string }) => React.ReactElement> = {
  book: IconBook, tag: IconTag, calculator: IconCalculator, chefHat: IconChefHat, clipboard: IconClipboard, shoppingBag: IconShoppingBag,
  package: IconPackage, truck: IconTruck, calendarEvent: IconCalendarEvent, fileText: IconFileText, users: IconUsers, trendingUp: IconTrendingUp, settings: IconSettings, box: IconBox,
};
const COULEURS: Record<string, string> = { Service: "#D4775A", Cuisine: "#4a6741", "Achats et stock": "#2563EB" };
export type MeteoTablette = { service: string; emoji: string | null; description: string | null; temp: number | null };
export type SectionTablette = { titre: string; pages: { href: string; label: string; icon?: string }[] };

export function AccueilTabletteVue({ prenom, etabNom, meteo, sections, bureau }: { prenom: string; etabNom: string; meteo: MeteoTablette[]; sections: SectionTablette[]; bureau: boolean }) {
  const date = new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
  const largeur = bureau ? 172 : 150;
  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: bureau ? "24px 28px 60px" : "16px 14px 60px", display: "grid", gap: 24, justifyItems: "center", textAlign: "center" }}>
      <div style={{ display: "grid", gap: 4, justifyItems: "center" }}>
        <div style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 700 }}>{date}</div>
        <h1 style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: bureau ? 30 : 24, textTransform: "uppercase", margin: 0, color: "#1a1a1a", lineHeight: 1.05 }}>{prenom ? `Bonjour ${prenom}` : "Tablette"}</h1>
        <div style={{ color: MUTED, fontSize: 13 }}>{etabNom} · ce que tu fais ici est enregistré à ton nom.</div>
        {meteo.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 8 }}>
            {meteo.map((m) => {
              const c = m.service === "midi" ? COULEUR_MIDI : COULEUR_SOIR;
              return (
                <span key={m.service} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "#fff", border: `1px solid ${BORD}`, borderRadius: 20, padding: "6px 14px 6px 10px", fontSize: 13 }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{m.emoji ?? ""}</span>
                  <span style={{ fontWeight: 700, color: c }}>{m.service === "midi" ? "Midi" : "Soir"}</span>
                  <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 16 }}>{m.temp != null ? `${Math.round(m.temp)} °` : ""}</span>
                  <span style={{ color: MUTED }}>{m.description ?? ""}</span>
                </span>
              );
            })}
          </div>
        )}
      </div>
      {sections.map((s) => {
        const c = COULEURS[s.titre] ?? "#1a1a1a";
        return (
          <div key={s.titre} style={{ display: "grid", gap: 10, justifyItems: "center", width: "100%" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: MUTED, fontWeight: 700 }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: c }} />{s.titre}
            </span>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              {s.pages.map((p) => {
                const Icone = p.icon ? ICONES[p.icon] : null;
                return (
                  <Link key={p.href} href={p.href} style={{ width: largeur, background: "#fff", border: `1px solid ${BORD}`, borderRadius: 14, padding: "18px 12px 16px", display: "grid", justifyItems: "center", gap: 10, textDecoration: "none", color: "#1a1a1a", touchAction: "manipulation" }}>
                    <span style={{ width: 48, height: 48, borderRadius: 24, background: `${c}1f`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {Icone && <Icone size={24} color={c} />}
                    </span>
                    <span style={{ fontFamily: OSWALD, fontWeight: 700, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", lineHeight: 1.15 }}>{p.label}</span>
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
