"use client";

import { NavBar } from "@/components/NavBar";
import { CatalogueSalleContent } from "@/components/production/CatalogueSalleTab";

export default function CatalogueFichesPage() {
  return (
    <>
      <NavBar backHref="/recettes" backLabel="Recettes" />
      <CatalogueSalleContent />
    </>
  );
}
