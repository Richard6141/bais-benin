import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Montserrat } from "next/font/google";
import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/feedback/offline-banner";
import { PwaProvider } from "@/components/providers/pwa-provider";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// Montserrat pour tout le texte, titres et corps : police de fait des portails de l'État béninois
// (service-public.bj, agriculture.gouv.bj, gouv.bj), rendue ici en 16 px au minimum pour le corps.
// Quatre graisses seulement, auto-hébergées par next/font (docs/modules/charte-officielle.md).
const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

const APP_NAME = "BAIS";
const APP_TITLE = "Bénin Agricultural Intelligence System";
const APP_DESCRIPTION =
  "Plateforme nationale de connaissance, d'accompagnement et de pilotage de l'agriculture béninoise.";

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: {
    default: APP_TITLE,
    template: `%s (${APP_NAME})`,
  },
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_TITLE,
  },
  formatDetection: { telephone: false },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: APP_TITLE,
    description: APP_DESCRIPTION,
    locale: "fr_BJ",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1624" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning : next-themes pose la classe de thème sur <html> avant React.
    <html
      lang="fr"
      dir="ltr"
      className={`${montserrat.variable} ${jetbrainsMono.variable} h-full`}
      suppressHydrationWarning
    >
      <body className="flex min-h-full flex-col">
        <ThemeProvider>
          <TooltipProvider delayDuration={200}>
            <PwaProvider>
              <OfflineBanner />
              {children}
            </PwaProvider>
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
