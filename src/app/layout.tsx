import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, DM_Sans, DM_Serif_Display, Oswald } from "next/font/google";
import "./globals.css";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  title: "pizza-app",
  description: "Gestion recettes, achats, coûts",
  manifest: "/manifest.json",
  applicationName: "pizza-app",
  appleWebApp: {
    capable: true,
    title: "pizza-app",
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
      <body className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${dmSerifDisplay.variable} ${oswald.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
