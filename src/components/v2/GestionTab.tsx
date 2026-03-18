"use client";

import { useState } from "react";
import type { CpuByUnit } from "@/lib/offerPricing";
import type { Ingredient } from "@/types/ingredients";
import { GestionFoodCost } from "./GestionFoodCost";
import { GestionCommandes } from "./GestionCommandes";
import { GestionPilotage } from "./GestionPilotage";

type SubTab = "fc" | "cmd" | "pop";

interface IngLine {
  ingredient_id: string;
  qty: number | "";
  unit: string;
}

export interface GestionTabProps {
  recipeId: string;
  recipeType: "cuisine" | "pizza" | "cocktail" | "empatement";
  lines: IngLine[];
  ingredients: Ingredient[];
  priceByIngredient: Record<string, CpuByUnit>;
  supplierByIngredient?: Record<string, string | null>;
  totalCost: number;
  sellPrice: number | null;
  onSellPriceChange: (price: number) => void;
  portionsCount?: number | null;
  yieldGrams?: number | null;
  etablissementId?: string;
  recipeName?: string;
}

const TABS: { key: SubTab; label: string }[] = [
  { key: "fc", label: "Food cost" },
  { key: "cmd", label: "Commandes" },
  { key: "pop", label: "Pilotage" },
];

export function GestionTab(props: GestionTabProps) {
  const [sub, setSub] = useState<SubTab>("fc");

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setSub(t.key)}
            style={{
              padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 600,
              cursor: "pointer",
              border: sub === t.key ? "1.5px solid #D4775A" : "1px solid #ddd6c8",
              background: sub === t.key ? "#D4775A" : "#fff",
              color: sub === t.key ? "#fff" : "#666",
              transition: "all 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {sub === "fc" && (
        <GestionFoodCost
          recipeId={props.recipeId}
          recipeType={props.recipeType}
          lines={props.lines}
          ingredients={props.ingredients}
          priceByIngredient={props.priceByIngredient}
          supplierByIngredient={props.supplierByIngredient}
          totalCost={props.totalCost}
          sellPrice={props.sellPrice}
          onSellPriceChange={props.onSellPriceChange}
          portionsCount={props.portionsCount}
          yieldGrams={props.yieldGrams}
        />
      )}

      {sub === "cmd" && (
        <GestionCommandes
          recipeId={props.recipeId}
          recipeType={props.recipeType}
          lines={props.lines}
          ingredients={props.ingredients}
          etablissementId={props.etablissementId}
        />
      )}

      {sub === "pop" && (
        <GestionPilotage
          recipeName={props.recipeName}
          recipeType={props.recipeType}
        />
      )}
    </div>
  );
}
