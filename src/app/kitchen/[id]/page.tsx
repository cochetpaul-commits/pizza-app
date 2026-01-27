import KitchenRecipeForm from "@/components/KitchenRecipeForm";

export default async function KitchenRecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <KitchenRecipeForm recipeId={id} />;
}