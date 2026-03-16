"use client";
import Image from "next/image";
import { useState } from "react";
import { CAT_COLORS, type Category } from "@/types/ingredients";

type Props = {
  ingredientId: string;
  name: string;
  category: Category;
  size?: number;
};

export function IngredientAvatar({ ingredientId, name, category, size = 36 }: Props) {
  const [imgError, setImgError] = useState(false);
  const catColor = CAT_COLORS[category] ?? "#999";

  const imgUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ingredients/${ingredientId}.jpg`;

  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : words[0].slice(0, 2).toUpperCase();

  if (imgError) {
    return (
      <div style={{
        width: size, height: size, borderRadius: "50%",
        background: `${catColor}22`,
        border: `1.5px solid ${catColor}44`,
        display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        <span style={{
          fontFamily: "Oswald, sans-serif", fontWeight: 700,
          fontSize: size * 0.33, color: catColor,
          letterSpacing: "0.02em",
        }}>{initials}</span>
      </div>
    );
  }

  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0,
      border: "1.5px solid #ddd6c8",
      background: "#f2ede4",
    }}>
      <Image
        src={imgUrl}
        alt={name}
        width={size}
        height={size}
        style={{ objectFit: "cover", width: size, height: size }}
        onError={() => setImgError(true)}
        unoptimized
      />
    </div>
  );
}
