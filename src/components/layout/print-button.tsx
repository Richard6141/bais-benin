"use client";

import { Printer } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// Impression par la boîte de dialogue du navigateur (« Enregistrer en PDF » compris) : pas de
// moteur PDF côté serveur en phase 1. Le thème sombre ne s'imprime pas : il est retiré le temps
// de l'impression, y compris quand elle est lancée au clavier (Ctrl+P).
export function PrintButton({ label = "Imprimer ou enregistrer en PDF" }: { label?: string }) {
  useEffect(() => {
    const root = document.documentElement;
    let wasDark = false;
    const before = () => {
      wasDark = root.classList.contains("dark");
      root.classList.remove("dark");
    };
    const after = () => {
      if (wasDark) root.classList.add("dark");
    };
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 print:hidden"
      onClick={() => window.print()}
    >
      <Printer aria-hidden />
      {label}
    </Button>
  );
}
