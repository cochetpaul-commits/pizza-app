import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "web-push"],
  // Inclure tout pdfjs-dist/legacy/ dans le bundle des API routes (sinon
  // Vercel tree-shake le worker .mjs car il n'est pas import statiquement
  // → erreur "Cannot find module .../pdf.worker.mjs" sur les routes PDF).
  outputFileTracingIncludes: {
    "/api/**/*": ["./node_modules/pdfjs-dist/legacy/**/*"],
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