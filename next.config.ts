import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfjs-dist", "web-push"],
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