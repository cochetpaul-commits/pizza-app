import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ICON_MAP: Record<string, string> = {
  "01": "☀️", "02": "⛅", "03": "☁️", "04": "☁️",
  "09": "🌧️", "10": "🌦️", "11": "⛈️", "13": "❄️", "50": "🌫️",
};

function iconToEmoji(icon: string): string {
  return ICON_MAP[icon.slice(0, 2)] ?? "🌤️";
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type OWMWeather = { description: string; icon: string };
type OWMMain = { temp: number };
type ForecastEntry = { dt: number; main: OWMMain; weather: OWMWeather[] };

export async function GET() {
  const key = process.env.OPENWEATHER_API_KEY;
  if (!key) return NextResponse.json({ error: "OPENWEATHER_API_KEY manquant" }, { status: 500 });

  const base = "https://api.openweathermap.org/data/2.5";
  const q = "Saint-Malo,FR";
  const [curRes, frcRes] = await Promise.all([
    fetch(`${base}/weather?q=${q}&appid=${key}&units=metric&lang=fr`, { cache: "no-store" }),
    fetch(`${base}/forecast?q=${q}&appid=${key}&units=metric&lang=fr`, { cache: "no-store" }),
  ]);

  if (!curRes.ok) return NextResponse.json({ error: "Météo indisponible" }, { status: 502 });
  const cur = await curRes.json() as { main: OWMMain; weather: OWMWeather[] };

  const todayParis = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());

  let tonight = null;
  if (frcRes.ok) {
    const frc = await frcRes.json() as { list: ForecastEntry[] };
    const entry = (frc.list ?? []).find((e) => {
      const d = new Date(e.dt * 1000);
      const str = d.toLocaleString("sv-SE", { timeZone: "Europe/Paris" }); // "2026-03-10 18:00:00"
      const date = str.slice(0, 10);
      const hour = parseInt(str.slice(11, 13));
      return date === todayParis && hour >= 18 && hour <= 21;
    });
    if (entry) {
      tonight = {
        temp: Math.round(entry.main.temp),
        description: cap(entry.weather[0]?.description ?? ""),
        emoji: iconToEmoji(entry.weather[0]?.icon ?? ""),
      };
    }
  }

  return NextResponse.json({
    temp: Math.round(cur.main.temp),
    description: cap(cur.weather[0]?.description ?? ""),
    emoji: iconToEmoji(cur.weather[0]?.icon ?? ""),
    tonight,
  });
}
