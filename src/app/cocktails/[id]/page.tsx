"use client";

import { useParams } from "next/navigation";
import CocktailForm from "@/components/CocktailForm";

export default function CocktailDetailPage() {
  const params = useParams();
  const id = (params?.id as string) || "";

  if (!id) {
    return (
      <main className="container">
        <p className="muted">Cocktail introuvable.</p>
      </main>
    );
  }

  return <CocktailForm cocktailId={id} />;
}
