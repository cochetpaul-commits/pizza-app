"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Barcode,
  Brush,
  ChefHat,
  ClipboardCheck,
  Droplets,
  FileText,
  PackageOpen,
  Printer,
  Soup,
  Thermometer
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEtablissement } from "@/lib/EtablissementContext";
import { useProfile } from "@/lib/ProfileContext";
import { T } from "@/lib/tokens";
import { RequireRole } from "@/components/RequireRole";
import {
  fetchCleaningTasks,
  fetchEquipments,
  type CleaningTask
} from "@/lib/haccp";

// Couleur d'accent des icônes — bleu profond, lisible sur pastilles claires.
const ICON_COLOR = "#2452a8";

interface ModuleDef {
  code: string;
  label: string;
  hint: string;
  Icon: LucideIcon;
  /** Si renseigné, on rend cette image (chemin sous /public) à la place de l'icône Lucide. */
  customIcon?: string;
  /** Multiplicateur de taille pour rééquilibrer les icônes qui remplissent peu leur canvas. */
  iconScale?: number;
}

const FEATURED: ModuleDef[] = [
  { code: "tracability",  label: "Traçabilité",       hint: "Lots de produits, photos.",          Icon: Barcode,     customIcon: "/haccp-icons/tracability.png" },
  { code: "temperatures", label: "Températures",      hint: "Frigos, congel, vitrines.",          Icon: Thermometer, customIcon: "/haccp-icons/temperatures.png" },
  { code: "cleaning",     label: "Plan de nettoyage", hint: "Quotidien / hebdo / mensuel.",        Icon: Brush,       customIcon: "/haccp-icons/cleaning.png" }
];

const SECONDARY: ModuleDef[] = [
  { code: "reception",    label: "Contrôle à réception", hint: "Vérif T°C, DLC, état.",            Icon: PackageOpen,    customIcon: "/haccp-icons/reception.png" },
  { code: "checklist",    label: "Checklist",            hint: "Grilles d'audit.",                Icon: ClipboardCheck, customIcon: "/haccp-icons/checklist.png",    iconScale: 1.35 },
  { code: "product_temp", label: "T°C produit",          hint: "Cuisson / refroidissement.",       Icon: Soup,           customIcon: "/haccp-icons/product_temp.png" },
  { code: "labels",       label: "Étiqueteuse",          hint: "DLC secondaires, imprimante BLE.", Icon: Printer,        customIcon: "/haccp-icons/labels.png",       iconScale: 1.35 }
];

const TERTIARY: ModuleDef[] = [
  { code: "oils",       label: "Huiles",     hint: "Friteuse, % composés polaires.", Icon: Droplets, customIcon: "/haccp-icons/oils.png" },
  { code: "production", label: "Production", hint: "Fabrication, traçabilité.",       Icon: ChefHat,  customIcon: "/haccp-icons/production.png", iconScale: 1.35 },
  { code: "documents",  label: "Documents",  hint: "PMS, protocoles, formations.",    Icon: FileText, customIcon: "/haccp-icons/documents.png",  iconScale: 1.35 }
];

export default function HaccpHome() {
  const { current, isGroupView } = useEtablissement();
  const { role } = useProfile();
  const isAdmin = role === "group_admin";
  const [cleaning, setCleaning] = useState<CleaningTask[]>([]);
  const [equipmentsCount, setEquipmentsCount] = useState(0);

  useEffect(() => {
    if (!current?.id) return;
    let cancelled = false;
    void fetchCleaningTasks(current.id).then((d) => {
      if (!cancelled) setCleaning(d);
    });
    void fetchEquipments(current.id).then((e) => {
      if (!cancelled) setEquipmentsCount(e.length);
    });
    return () => {
      cancelled = true;
    };
  }, [current?.id]);

  const dayCount = cleaning.filter((c) => c.frequency === "day").length;
  const weekCount = cleaning.filter((c) => c.frequency === "week").length;
  const monthCount = cleaning.filter((c) => c.frequency === "month").length;

  const todayTotal = equipmentsCount + dayCount;
  const todayDone = 0;
  const weekTotal = weekCount;
  const monthTotal = monthCount;

  return (
    <RequireRole>
      <main
        style={{
          minHeight: "100vh",
          background: T.creme,
          padding: "16px 12px 40px",
          fontFamily: "var(--font-dm-sans), 'DM Sans', sans-serif"
        }}
      >
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <Header
            etabName={isGroupView ? "Groupe iFratelli" : (current?.nom ?? "Établissement")}
            isAdmin={isAdmin}
          />

          {isGroupView && (
            <div
              style={{
                background: "#fff",
                border: `1px solid ${T.border}`,
                borderRadius: 14,
                padding: "14px 16px",
                color: T.muted,
                fontSize: 13,
                marginBottom: 18
              }}
            >
              Choisis un établissement dans le sélecteur du haut pour afficher
              ses modules HACCP.
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: 10,
              marginBottom: 14
            }}
          >
            <KpiCard title="Aujourd'hui" done={todayDone} total={todayTotal} color="#E2603B" />
            <KpiCard title="Semaine"     done={0}         total={weekTotal}  color="#E8B23A" />
            <KpiCard title="Mois"        done={0}         total={monthTotal} color="#3E7BFB" />
          </div>

          {/* Rangée 1 : 3 grandes cartes mises en avant */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 14,
              marginBottom: 14
            }}
          >
            {FEATURED.map((m) => (
              <ModuleTile
                key={m.code}
                mod={m}
                size="big"
                badges={
                  m.code === "cleaning"
                    ? [
                        { value: dayCount,   tone: "r" as const },
                        { value: weekCount,  tone: "y" as const },
                        { value: monthCount, tone: "b" as const }
                      ].filter((b) => b.value > 0)
                    : []
                }
              />
            ))}
          </div>

          {/* Rangée 2 : 4 cartes secondaires */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14,
              marginBottom: 14
            }}
          >
            {SECONDARY.map((m) => (
              <ModuleTile key={m.code} mod={m} size="small" badges={[]} />
            ))}
          </div>

          {/* Rangée 3 : 3 cartes tertiaires + bouton "voir tous" */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 14
            }}
          >
            {TERTIARY.map((m) => (
              <ModuleTile key={m.code} mod={m} size="small" badges={[]} />
            ))}
            <MoreTile />
          </div>

          <p
            style={{
              marginTop: 28,
              fontSize: 12,
              color: T.muted,
              textAlign: "center"
            }}
          >
            v0.2 · catégorie HACCP. Les modules s&apos;enrichiront au fil des prochaines sessions.
          </p>
        </div>
      </main>
    </RequireRole>
  );
}

function Header({ etabName, isAdmin }: { etabName: string; isAdmin: boolean }) {
  return (
    <header style={{ marginBottom: 18 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <p
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 800,
              letterSpacing: 1.5,
              color: T.muted,
              textTransform: "uppercase"
            }}
          >
            HACCP · Hygiène & conformité
          </p>
          <h1
            style={{
              margin: "6px 0 4px",
              fontFamily: "var(--font-oswald), Oswald, sans-serif",
              fontWeight: 700,
              fontSize: 28,
              color: T.dark,
              letterSpacing: 0.5
            }}
          >
            {etabName}
          </h1>
        </div>
        {isAdmin && (
          <Link
            href="/haccp/admin"
            style={{
              flex: "0 0 auto",
              background: "#fff",
              border: `1px solid ${T.border}`,
              borderRadius: 12,
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 800,
              color: T.dark,
              textDecoration: "none",
              boxShadow: T.tileShadow,
              whiteSpace: "nowrap"
            }}
          >
            ⚙ Paramètres
          </Link>
        )}
      </div>
      <p style={{ margin: 0, color: T.muted, fontSize: 14 }}>
        Autocontrôles, plan de nettoyage et traçabilité. Toutes les écritures sont horodatées et attribuées — preuves disponibles en cas de contrôle DDPP.
      </p>
    </header>
  );
}

function KpiCard({
  title,
  done,
  total,
  color
}: {
  title: string;
  done: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 5;
  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${T.border}`,
        borderRadius: 14,
        padding: "10px 14px 12px",
        boxShadow: T.tileShadow
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, color: T.dark }}>{title}</span>
        <span
          style={{
            width: 9,
            height: 9,
            borderRadius: 999,
            background: color
          }}
        />
      </div>
      <p style={{ margin: "2px 0 6px", fontSize: 11, color: T.muted, fontWeight: 700 }}>
        {done}/{total} tâches
      </p>
      <div
        style={{
          height: 3,
          borderRadius: 3,
          background: "rgba(0,0,0,.06)",
          overflow: "hidden"
        }}
      >
        <div
          style={{
            width: `${Math.max(pct, 5)}%`,
            height: "100%",
            background: color,
            borderRadius: 3
          }}
        />
      </div>
    </div>
  );
}

function ModuleTile({
  mod,
  badges,
  size
}: {
  mod: ModuleDef;
  badges: { value: number; tone: "r" | "y" | "b" }[];
  size: "big" | "small";
}) {
  const toneColor: Record<"r" | "y" | "b", string> = {
    r: "#E2603B",
    y: "#E8B23A",
    b: "#3E7BFB"
  };
  const Icon = mod.Icon;
  const isBig = size === "big";
  const iconPx = Math.round((isBig ? 170 : 130) * (mod.iconScale ?? 1));
  return (
    <Link href={`/haccp/${mod.code}`} style={{ textDecoration: "none", color: "inherit" }}>
      <article
        style={{
          position: "relative",
          background: "#fff",
          border: `1px solid ${T.border}`,
          borderRadius: 18,
          padding: isBig ? "26px 16px 22px" : "20px 12px 18px",
          boxShadow: T.tileShadow,
          aspectRatio: isBig ? "3 / 2" : "1 / 1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: isBig ? 16 : 10,
          cursor: "pointer",
          transition: "transform 0.15s ease, box-shadow 0.15s ease"
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-2px)";
          e.currentTarget.style.boxShadow = T.tileShadowHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "translateY(0)";
          e.currentTarget.style.boxShadow = T.tileShadow;
        }}
      >
        {badges.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: 12,
              right: 12,
              display: "flex",
              gap: 4
            }}
          >
            {badges.map((b, i) => (
              <span
                key={i}
                style={{
                  minWidth: 26,
                  height: 26,
                  padding: "0 8px",
                  borderRadius: 6,
                  background: toneColor[b.tone],
                  color: "#fff",
                  fontWeight: 900,
                  fontSize: 12,
                  display: "grid",
                  placeItems: "center"
                }}
              >
                {b.value}
              </span>
            ))}
          </div>
        )}
        {mod.customIcon ? (
          <img
            src={mod.customIcon}
            alt=""
            style={{ width: iconPx, height: iconPx, objectFit: "contain" }}
          />
        ) : (
          <Icon size={isBig ? 64 : 44} strokeWidth={1.6} color={ICON_COLOR} />
        )}
        <span
          style={{
            fontSize: isBig ? 16 : 14,
            fontWeight: 800,
            color: T.dark,
            textAlign: "center"
          }}
        >
          {mod.label}
        </span>
      </article>
    </Link>
  );
}

function MoreTile() {
  const accent = "#3E7BFB";
  return (
    <Link href="/haccp" style={{ textDecoration: "none", color: "inherit" }}>
      <article
        style={{
          background: "rgba(62,123,251,.05)",
          border: `1px dashed ${accent}`,
          borderRadius: 18,
          padding: "20px 12px 18px",
          aspectRatio: "1 / 1",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          cursor: "pointer",
          color: accent
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 999,
            background: accent,
            color: "#fff",
            display: "grid",
            placeItems: "center",
            fontSize: 32,
            fontWeight: 600,
            lineHeight: 1
          }}
        >
          +
        </div>
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            textAlign: "center",
            lineHeight: 1.3
          }}
        >
          Voir tous les modules<br />disponibles
        </span>
      </article>
    </Link>
  );
}
