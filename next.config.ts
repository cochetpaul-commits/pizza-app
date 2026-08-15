import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push"],
  experimental: {
    // Import cible des barrels : evite d'embarquer toute la lib
    optimizePackageImports: ["lucide-react", "recharts", "@hello-pangea/dnd"],
  },
  // pdfjs-dist NE doit PAS etre en serverExternalPackages : le worker .mjs
  // est resolu dynamiquement et Vercel tree-shake le fichier si pdfjs-dist
  // n'est pas bundle. En laissant Next bundler le package, le worker est
  // inclus comme dependence statique.
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