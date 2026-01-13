"use client";

import { TopNav } from "@/components/TopNav";
import PizzaForm from "@/components/PizzaForm";

export default function NewPizzaPage() {
  return (
    <main className="container">
      <TopNav
        title="Nouvelle pizza"
        subtitle="Création d’une fiche pizza"
      />

      <PizzaForm />
    </main>
  );
}