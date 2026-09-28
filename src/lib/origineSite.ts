/** Adresse publique de l'appli pour les liens envoyés par mail (jamais localhost) */
export function origineSite(req: Request): string {
  const reqOrigin = new URL(req.url).origin;
  return process.env.NEXT_PUBLIC_SITE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
    || (reqOrigin.includes("localhost") ? "https://pizza-app-olive-five.vercel.app" : reqOrigin);
}
