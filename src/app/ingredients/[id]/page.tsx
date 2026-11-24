import { redirect } from "next/navigation";

/**
 * L'ancienne page détaillée d'un produit (24/11/2026, Paul : « on ne l'utilise pas ») est retirée : l'adresse ouvre
 * la fiche dans la Base produits, pour les anciens liens et favoris.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/ingredients?edit=${encodeURIComponent(id)}`);
}
