"use client";
import { useState, useId } from "react";
import { CAT_COLORS, type Category } from "@/types/ingredients";
import { supabase } from "@/lib/supabaseClient";
import { compressImage } from "@/lib/compressImage";

type Props = {
  ingredientId: string;
  name: string;
  category: Category;
  size?: number;
  editable?: boolean;
};

export function IngredientAvatar({ ingredientId, name, category, size = 36, editable = false }: Props) {
  const [imgError, setImgError] = useState(false);
  const [imgUrl, setImgUrl] = useState(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ingredients/${ingredientId}.jpg`
  );
  const [uploading, setUploading] = useState(false);
  const inputId = useId();
  const catColor = CAT_COLORS[category] ?? "#999";

  const words = name.trim().split(/\s+/);
  const initials = words.length >= 2
    ? `${words[0][0]}${words[1][0]}`.toUpperCase()
    : words[0].slice(0, 2).toUpperCase();

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const compressed = await compressImage(file, 200, 0.8);
      const { error } = await supabase.storage
        .from("ingredients")
        .upload(`${ingredientId}.jpg`, compressed, { upsert: true, contentType: "image/jpeg" });
      if (error) throw error;
      setImgUrl(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/ingredients/${ingredientId}.jpg?t=${Date.now()}`);
      setImgError(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setUploading(false);
    }
  }

  const hasPhoto = !imgError;

  const avatar = (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      overflow: "hidden", flexShrink: 0, position: "relative",
      border: hasPhoto ? "1.5px solid #ddd6c8" : `1.5px solid ${catColor}44`,
      background: hasPhoto ? "#f2ede4" : `${catColor}22`,
      display: "flex", alignItems: "center", justifyContent: "center",
      cursor: editable ? "pointer" : "default",
    }}>
      {hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imgUrl}
          alt={name}
          width={size}
          height={size}
          style={{ objectFit: "cover", width: size, height: size }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span style={{
          fontFamily: "Oswald, sans-serif", fontWeight: 700,
          fontSize: size * 0.33, color: catColor,
          letterSpacing: "0.02em",
        }}>{initials}</span>
      )}
      {uploading && (
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <span style={{ color: "#fff", fontSize: size * 0.25, fontWeight: 700 }}>...</span>
        </div>
      )}
    </div>
  );

  if (!editable) return avatar;

  return (
    <>
      <label htmlFor={inputId} style={{ cursor: "pointer", flexShrink: 0 }}>
        {avatar}
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden", pointerEvents: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = "";
        }}
      />
    </>
  );
}
