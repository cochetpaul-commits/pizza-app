import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, DM_Sans, DM_Serif_Display, Oswald, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
});

const dmSerifDisplay = DM_Serif_Display({
  variable: "--font-dm-serif-display",
  subsets: ["latin"],
  weight: "400",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin"],
  weight: ["600", "700"],
});

const cormorantGaramond = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "600", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#D4775A",
};

export const metadata: Metadata = {
  title: "BelloMio — iFratelli Group",
  description: "Gestion restaurant : planning, RH, recettes, ingrédients",
  manifest: "/manifest.json",
  applicationName: "BelloMio",
  appleWebApp: {
    capable: true,
    title: "BelloMio",
    statusBarStyle: "default",
  },
  icons: {
    icon: [{ url: "/logo.png" }],
    apple: [{ url: "/logo.png" }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${dmSerifDisplay.variable} ${oswald.variable} ${cormorantGaramond.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
