/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["pdfjs-dist"],
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

module.exports = nextConfig;