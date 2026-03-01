import type { SupabaseClient } from "@supabase/supabase-js";

export async function photoToBase64(supabase: SupabaseClient, url: string): Promise<string | null> {
  try {
    // Parse Supabase Storage public URL: /storage/v1/object/public/{bucket}/{path}
    const match = url.match(/\/storage\/v1\/object\/public\/([^/?]+)\/(.+)/);
    if (!match) return null;
    const bucket = match[1];
    const filePath = decodeURIComponent(match[2].split("?")[0]);

    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error || !data) return null;

    const buf = Buffer.from(await data.arrayBuffer());
    if (buf.length === 0) return null;

    const ext = filePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const mime = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}
