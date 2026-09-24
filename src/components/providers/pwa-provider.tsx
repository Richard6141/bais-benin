"use client";

import { SerwistProvider } from "@serwist/turbopack/react";
import type { ReactNode } from "react";

// Enregistre le service worker. Désactivé en développement pour ne pas servir
// des pages périmées depuis le cache pendant que l'on itère.
export function PwaProvider({ children }: { children: ReactNode }) {
  return (
    <SerwistProvider swUrl="/serwist/sw.js" disable={process.env.NODE_ENV === "development"}>
      {children}
    </SerwistProvider>
  );
}
