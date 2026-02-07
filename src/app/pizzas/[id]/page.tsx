"use client";

import { useParams } from "next/navigation";
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
  }

  return <PizzaForm pizzaId={id} />;
}
