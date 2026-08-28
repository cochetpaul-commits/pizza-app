import type { Metadata, Viewport } from "next";
import { FreshnessGuard } from "@/components/FreshnessGuard";
import { Geist, Geist_Mono, DM_Sans, Oswald, Cormorant_Garamond } from "next/font/google";
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
  themeColor: "#e4dfd6",
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
      <head>
        {/* Mouchard de plantage : posé AVANT tout le code de l'app, en
            syntaxe ES5 pour tourner même sur un navigateur ancien (un
            vieux Safari qui ne parse pas le bundle moderne déclenche
            window.onerror avec une SyntaxError → on la reçoit ici). */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function () {
            var envoyes = 0;
            function envoyer(msg, src, stack) {
              if (envoyes >= 3) return;
              envoyes++;
              try {
                var corps = JSON.stringify({
                  message: String(msg || ""), source: String(src || ""),
                  stack: String(stack || ""), ua: navigator.userAgent,
                  url: location.href
                });
                if (navigator.sendBeacon) { navigator.sendBeacon("/api/client-error", corps); }
                else {
                  var x = new XMLHttpRequest();
                  x.open("POST", "/api/client-error", true);
                  x.setRequestHeader("Content-Type", "application/json");
                  x.send(corps);
                }
              } catch (e) {}
            }
            window.addEventListener("error", function (e) {
              envoyer(e.message, (e.filename || "") + ":" + (e.lineno || 0), e.error && e.error.stack);
            });
            window.addEventListener("unhandledrejection", function (e) {
              var r = e.reason || {};
              envoyer(r.message || String(r), "unhandledrejection", r.stack);
            });
          })();
        `}} />
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes slideUp {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeIn {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
        `}} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} ${dmSans.variable} ${oswald.variable} ${cormorantGaramond.variable} antialiased`}>
        <FreshnessGuard />
        <Providers>{children}</Providers>
        <script dangerouslySetInnerHTML={{ __html: `
          if ("serviceWorker" in navigator) {
            window.addEventListener("load", function() {
              navigator.serviceWorker.register("/sw.js").catch(function() {});
            });
          }
        `}} />
      </body>
    </html>
  );
}
