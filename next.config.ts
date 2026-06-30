import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "web-push"],
  // Inclure le worker pdfjs-dist dans le bundle des API routes (sinon Vercel
  // ne le trace pas car c'est un path string, pas un import statique → erreur
  // "Cannot find module .../pdf.worker.mjs" sur les routes qui parsent du PDF).
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "qdraedqtdlcjqlbxksqt.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;