/** Textes libres Pennylane : parfois en « rich text » JSON ([{type:paragraph, children:[{text}]}]), on garde le texte */
const vide = (s: string | null | undefined) => { const t = (s ?? "").trim(); return t ? t : null; };

export function texteBrut(s: string | null | undefined): string | null {
  const t = vide(s);
  if (!t || !t.startsWith("[{")) return t;
  try {
    const blocs = JSON.parse(t) as { children?: { text?: string }[] }[];
    return vide(blocs.flatMap((b) => (b.children ?? []).map((c) => c.text ?? "")).join(" ").replace(/\s+/g, " "));
  } catch { return t; }
}
