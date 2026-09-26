"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface ActionDialogProps {
  /** Libellé du bouton, qui est aussi le titre de la fenêtre pour les lecteurs d'écran. */
  label: string;
  /** Phrase courte lue par les lecteurs d'écran à l'ouverture. */
  description: string;
  variant?: "default" | "outline";
  children: ReactNode;
}

// Action de page qui porte un formulaire (former un groupe, publier) : un bouton en tête de page,
// le formulaire dans une fenêtre. Le tableau reste la première chose que l'on voit ; le formulaire
// garde son propre titre visible, la fenêtre ne le répète pas.
export function ActionDialog({
  label,
  description,
  variant = "outline",
  children,
}: ActionDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant={variant} className="h-11">
          {label}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl [&_form]:border-0 [&_form]:p-0">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
