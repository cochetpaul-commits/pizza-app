import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const OW_KEY = process.env.OPENWEATHER_API_KEY!;
const LAT = 48.6493;
const LON = -2.0007;

function iconToEmoji(icon: string): string {
  const m: Record<string, string> = {
    "01d": "\u2600\uFE0F", "01n": "\uD83C\uDF19",
    "02d": "\uD83C\uDF24\uFE0F", "02n": "\uD83C\uDF24\uFE0F",
    "03d": "\uD83C\uDF25\uFE0F", "03n": "\uD83C\uDF25\uFE0F",
    "04d": "\u2601\uFE0F", "04n": "\u2601\uFE0F",
    "09d": "\uD83C\uDF27\uFE0F", "09n": "\uD83C\uDF27\uFE0F",
    "10d": "\uD83C\uDF26\uFE0F", "10n": "\uD83C\uDF26\uFE0F",
    "11d": "\u26C8\uFE0F", "11n": "\u26C8\uFE0F",
    "13d": "\u2744\uFE0F", "13n": "\u2744\uFE0F",
    "50d": "\uD83C\uDF2B\uFE0F", "50n": "\uD83C\uDF2B\uFE0F",
  };
  return m[icon] ?? "\uD83C\uDF24\uFE0F";
}

/** GET — read stored meteo for a date range */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const action = searchParams.get("action");

  // Cron trigger: GET ?action=fetch → same as POST (fetch forecast & store)
  if (action === "fetch") return fetchAndStore();

  if (!from || !to) return NextResponse.json({ error: "from, to requis" }, { status: 400 });

  const { data } = await supabase
    .from("meteo_daily")
    .select("*")
    .gte("date_service", from)
    .lte("date_service", to)
    .order("date_service");

  return NextResponse.json({ meteo: data ?? [] });
}

async function fetchAndStore() {
  try {
    const res = await fetch(
      `https://api.openweathermap.org/data/2.5/forecast?lat=${LAT}&lon=${LON}&appid=${OW_KEY}&units=metric&lang=fr`
    );
    const json = await res.json();
    if (!json.list) return NextResponse.json({ error: "API error", detail: json.message }, { status: 500 });

    type FItem = { dt: number; main: { temp: number }; weather: { icon: string; description: string }[] };
    const dayMap = new Map<string, { midi: FItem | null; soir: FItem | null }>();

    for (const item of json.list as FItem[]) {
      const dt = new Date(item.dt * 1000);
      const dateStr = dt.toISOString().slice(0, 10);
      const hour = dt.getHours();
      if (!dayMap.has(dateStr)) dayMap.set(dateStr, { midi: null, soir: null });
      const day = dayMap.get(dateStr)!;
      if (hour >= 10 && hour <= 14) {
        if (!day.midi || Math.abs(hour - 12) < Math.abs(new Date(day.midi.dt * 1000).getHours() - 12)) day.midi = item;
      }
      if (hour >= 17 && hour <= 21) {
        if (!day.soir || Math.abs(hour - 19) < Math.abs(new Date(day.soir.dt * 1000).getHours() - 19)) day.soir = item;
      }
    }

    const rows: { date_service: string; service: string; icon: string; emoji: string; description: string; temp: number }[] = [];
    for (const [dateStr, { midi, soir }] of dayMap.entries()) {
      if (midi) rows.push({ date_service: dateStr, service: "midi", icon: midi.weather[0].icon, emoji: iconToEmoji(midi.weather[0].icon), description: midi.weather[0].description, temp: Math.round(midi.main.temp * 10) / 10 });
      if (soir) rows.push({ date_service: dateStr, service: "soir", icon: soir.weather[0].icon, emoji: iconToEmoji(soir.weather[0].icon), description: soir.weather[0].description, temp: Math.round(soir.main.temp * 10) / 10 });
    }

    let inserted = 0;
    for (const row of rows) {
      const { error } = await supabase.from("meteo_daily").upsert(row, { onConflict: "date_service,service" });
      if (!error) inserted++;
    }

    return NextResponse.json({ ok: true, inserted, dates: [...dayMap.keys()] });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/** POST — fetch 5-day forecast from OpenWeather and store in DB */
export async function POST() {
  return fetchAndStore();
}
