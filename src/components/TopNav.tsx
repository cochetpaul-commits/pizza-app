"use client";

import Link from "next/link";
import React from "react";

export function TopNav({
  title,
  subtitle,
  right,
  backHref,
  backLabel = "Retour",
}: {
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Link className="btn" href="/">
            Accueil
          </Link>

          {backHref ? (
            <Link className="btn" href={backHref}>
              {backLabel}
            </Link>
          ) : null}
        </div>

        {right ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>{right}</div>
        ) : null}
      </div>

      {(title || subtitle) && (
        <div style={{ marginTop: 12 }}>
          {title ? (
            <h1 className="h1" style={{ margin: 0 }}>
              {title}
            </h1>
          ) : null}

          {subtitle ? (
            <p className="muted" style={{ marginTop: 6 }}>
              {subtitle}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}