"use client";

import { useParams } from "next/navigation";
import { TopNav } from "@/components/TopNav";
import PizzaForm from "@/components/PizzaForm";

export default function PizzaPage() {
  const params = useParams();
  const id = (params?.id as string) || "";

if (!id) {
  return (
    <main className="container">
      <p className="muted">Fiche introuvable.</p>
    </main>
  );
}  return (
    <main className="container">
      <TopNav title="Fiche pizza" subtitle="Empâtement + ingrédients + notes" />
      <PizzaForm pizzaId={id} />
    </main>
  );
}
