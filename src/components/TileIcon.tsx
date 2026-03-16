import React from "react";

type IconName =
  | "cuisine"
  | "planning"
  | "horloge"
  | "messagerie"
  | "evenements"
  | "gestion"
  | "pilotage"
  | "factures"
  | "variations"
  | "finances"
  | "mercuriale"
  | "prix"
  | "masse-salariale"
  | "rapports"
  | "admin"
  | "upload"
  | "epicerie"
  | "parametres"
  | "commandes"
  | "fournisseurs"
  | "pointer"
  | "equipe"
  | "recettes"
  | "ingredients";

const paths: Record<IconName, React.ReactNode> = {
  cuisine: (
    // Toque de chef
    <>
      <path d="M12 4c-1.6 0-3 .8-3.8 2C6.3 6.2 5 7.7 5 9.5 5 11.4 6.6 13 8.5 13H9v5h6v-5h.5c1.9 0 3.5-1.6 3.5-3.5 0-1.8-1.3-3.3-3.2-3.5C15 4.8 13.6 4 12 4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M10 20h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  planning: (
    // Calendrier
    <>
      <rect x="4" y="5" width="16" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M4 10h16" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 3v4M16 3v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="15" r="1" fill="currentColor" />
      <circle cx="12" cy="15" r="1" fill="currentColor" />
      <circle cx="16" cy="15" r="1" fill="currentColor" />
    </>
  ),
  horloge: (
    // Horloge
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 7v5l3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  messagerie: (
    // Bulle de chat
    <>
      <path d="M21 12c0 4-4.03 7-9 7-1.2 0-2.34-.16-3.38-.46L4 20l1.46-3.62C4.55 15.1 4 13.6 4 12c0-4 4.03-7 9-7s8 3 8 7z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 12h.01M12 12h.01M16 12h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  evenements: (
    // Etoile
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.27 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  ),
  gestion: (
    // Engrenage
    <>
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  pilotage: (
    // Graphe barres
    <>
      <rect x="4" y="12" width="4" height="8" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="10" y="6" width="4" height="14" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <rect x="16" y="9" width="4" height="11" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </>
  ),
  factures: (
    // Recu/facture
    <>
      <path d="M6 2l1.5 1.5L9 2l1.5 1.5L12 2l1.5 1.5L15 2l1.5 1.5L18 2v20l-1.5-1.5L15 22l-1.5-1.5L12 22l-1.5-1.5L9 22l-1.5-1.5L6 22V2z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 7h6M9 11h6M9 15h4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  variations: (
    // Flèches haut/bas (variation prix)
    <>
      <path d="M7 17l-3-3 3-3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 14h12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M17 7l3 3-3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 10H8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  finances: (
    // Euro dans un cercle
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 10h5c0-1.1-.9-2-2.5-2S9 9.1 9 10zm0 4h5c0 1.1-.9 2-2.5 2S9 15.1 9 14zM8 10h2M8 14h2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  mercuriale: (
    // Liste avec prix
    <>
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </>
  ),
  prix: (
    // Etiquette de prix
    <>
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1.5" fill="currentColor" />
    </>
  ),
  "masse-salariale": (
    // Groupe de personnes
    <>
      <circle cx="9" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 21v-2c0-2.2 2.7-4 6-4s6 1.8 6 4v2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M21 21v-1.5c0-1.5-1.5-2.8-3.5-3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  rapports: (
    // Document
    <>
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  admin: (
    // Bouclier
    <>
      <path d="M12 2l8 4v5c0 5.5-3.4 9.7-8 11-4.6-1.3-8-5.5-8-11V6l8-4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  upload: (
    // Upload/import
    <>
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17 8l-5-5-5 5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 3v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
  epicerie: (
    // Panier/chariot
    <>
      <path d="M6 6h15l-1.5 9H7.5L6 6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 6L5 2H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="19" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="19" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  parametres: (
    // Engrenage simple
    <>
      <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  commandes: (
    // Panier de courses
    <>
      <path d="M6 6h15l-1.5 9H7.5L6 6z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 6L5 2H2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="9" cy="19" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="19" r="1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  fournisseurs: (
    // Camion livraison
    <>
      <rect x="1" y="6" width="14" height="10" rx="1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15 10h4l3 3v3h-7V10z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="6" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="19" cy="18" r="2" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
  pointer: (
    // Check / pointage
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 12l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  equipe: (
    // Groupe de personnes
    <>
      <circle cx="9" cy="7" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 21v-2c0-2.2 2.7-4 6-4s6 1.8 6 4v2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="17" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M21 21v-1.5c0-1.5-1.5-2.8-3.5-3.3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  recettes: (
    // Livre ouvert
    <>
      <path d="M2 4c2-1 4-1.5 6-1.5S12 3 12 4v16c-1-1-3-1.5-4-1.5S4 19 2 20V4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M22 4c-2-1-4-1.5-6-1.5S12 3 12 4v16c1-1 3-1.5 4-1.5s4 .5 6 1.5V4z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </>
  ),
  ingredients: (
    // Feuille / ingredient
    <>
      <path d="M12 22c5.5-3 8-7.5 8-13-3 0-5.5 1-8 4-2.5-3-5-4-8-4 0 5.5 2.5 10 8 13z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 22V9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

export function TileIcon({
  name,
  size = 22,
  color = "currentColor",
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  const content = paths[name];
  if (!content) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      style={{ color, flexShrink: 0 }}
    >
      {content}
    </svg>
  );
}
