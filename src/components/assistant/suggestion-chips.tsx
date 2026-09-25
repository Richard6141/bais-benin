"use client";

import { MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

interface SuggestionChipsProps {
  suggestions: readonly string[];
  onPick: (question: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

// Suggestions contextuelles : un toucher pose la question. Boutons pleine largeur sur téléphone
// (cible de 56 px pour le producteur), texte entier, jamais tronqué.
export function SuggestionChips({
  suggestions,
  onPick,
  disabled = false,
  label = "Questions suggérées",
  className,
}: SuggestionChipsProps) {
  if (suggestions.length === 0) return null;
  return (
    <ul
      aria-label={label}
      className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap", className)}
    >
      {suggestions.map((suggestion) => (
        <li key={suggestion}>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onPick(suggestion)}
            className="flex min-h-14 w-full items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left text-base transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 sm:min-h-11 sm:w-auto sm:text-sm"
          >
            <MessageCircleQuestion className="size-5 shrink-0 text-primary" aria-hidden />
            {suggestion}
          </button>
        </li>
      ))}
    </ul>
  );
}
