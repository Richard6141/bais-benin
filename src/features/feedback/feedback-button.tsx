"use client";

import { MessageSquareHeart } from "lucide-react";
import { useState } from "react";
import type { SpaceNavAction } from "@/components/layout/space-nav";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { FeedbackDialog } from "./feedback-dialog";

export const FEEDBACK_LABEL = "Donner mon avis";

/** Entrée « Donner mon avis » du menu « Plus » d'un espace, et sa fenêtre. */
export function useFeedbackAction(): { action: SpaceNavAction; dialog: React.ReactNode } {
  const [open, setOpen] = useState(false);
  return {
    action: { label: FEEDBACK_LABEL, icon: MessageSquareHeart, onSelect: () => setOpen(true) },
    dialog: <FeedbackDialog open={open} onOpenChange={setOpen} />,
  };
}

/** Bouton discret « Donner mon avis », pour l'en-tête du pilotage. */
export function FeedbackButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn("h-9 gap-1.5 text-muted-foreground", className)}
        onClick={() => setOpen(true)}
      >
        <MessageSquareHeart className="size-4" aria-hidden />
        {FEEDBACK_LABEL}
      </Button>
      <FeedbackDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
