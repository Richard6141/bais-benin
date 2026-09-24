"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  "aria-label"?: string;
}

// Saisie d'un code à usage unique : une case par chiffre, collage d'un bloc accepté,
// autocomplete one-time-code pour que le clavier propose le code reçu par SMS ou WhatsApp.
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  autoFocus,
  "aria-label": ariaLabel = "Code de vérification",
}: OtpInputProps) {
  const refs = React.useRef<Array<HTMLInputElement | null>>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? "");

  const commit = (next: string) => {
    const cleaned = next.replace(/\D/g, "").slice(0, length);
    onChange(cleaned);
    if (cleaned.length === length) onComplete?.(cleaned);
  };

  const focusAt = (index: number) =>
    refs.current[Math.max(0, Math.min(length - 1, index))]?.focus();

  return (
    <div role="group" aria-label={ariaLabel} className="flex gap-2">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          autoFocus={autoFocus && index === 0}
          maxLength={length}
          aria-label={`Chiffre ${index + 1} sur ${length}`}
          disabled={disabled}
          value={digit}
          onFocus={(event) => event.target.select()}
          onChange={(event) => {
            const typed = event.target.value.replace(/\D/g, "");
            if (typed.length > 1) {
              // Collage d'un code complet : on remplit à partir de la case courante.
              const merged = (value.slice(0, index) + typed).slice(0, length);
              commit(merged);
              focusAt(merged.length);
              return;
            }
            const next = value.slice(0, index) + typed + value.slice(index + 1);
            commit(next);
            if (typed) focusAt(index + 1);
          }}
          onKeyDown={(event) => {
            if (event.key === "Backspace" && !digit && index > 0) {
              const next = value.slice(0, index - 1) + value.slice(index);
              onChange(next);
              focusAt(index - 1);
            }
            if (event.key === "ArrowLeft") focusAt(index - 1);
            if (event.key === "ArrowRight") focusAt(index + 1);
          }}
          className={cn(
            "tabular h-14 w-11 rounded-md border border-input bg-background text-center text-2xl font-semibold transition-[color,box-shadow] outline-none",
            "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50",
          )}
        />
      ))}
    </div>
  );
}
