"use client";

import { usePathname } from "next/navigation";
import KitchenRecipeForm from "@/components/KitchenRecipeForm";

export default function NewKitchenRecipePage() {
  const pathname = usePathname();
  return <KitchenRecipeForm key={pathname} />;
}