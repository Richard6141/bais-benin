"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ReactNode } from "react";

// Thème clair imposé partout : le bouton de bascule jour et nuit est retiré des en-têtes, et un
// choix sombre déjà enregistré dans le navigateur n'est plus appliqué. La salle de situation garde
// son propre aplat sombre (classe `dark` sur son conteneur), indépendant de ce réglage.
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      forcedTheme="light"
      enableSystem={false}
    >
      {children}
    </NextThemesProvider>
  );
}
