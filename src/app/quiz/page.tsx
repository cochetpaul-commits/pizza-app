"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { RequireRole } from "@/components/RequireRole";
import { Quiz } from "@/components/quiz/Quiz";

function Contenu() {
  const theme = useSearchParams().get("theme");
  return <Quiz themeInitial={theme === "vins" ? "vins" : "carte"} />;
}
export default function Page() {
  return <RequireRole permission="operations.recettes"><Suspense fallback={null}><Contenu /></Suspense></RequireRole>;
}
