"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// Thème clair par défaut ; le centre de pilotage forcera le thème sombre dans
// son propre layout. La classe `dark` est posée sur <html> avant l'hydratation.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false}>
      {children}
    </NextThemesProvider>
  );
}
