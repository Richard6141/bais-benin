"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface PhoneFieldProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type"
> {
  value: string;
  onChange: (nationalDigits: string) => void;
}

// Champ téléphone béninois : indicatif +229 fixe, saisie des dix chiffres nationaux
// groupés par deux (01 XX XX XX XX). Le clavier numérique s'ouvre sur mobile et le
// navigateur peut proposer le numéro de l'appareil (autocomplete tel-national).
export function PhoneField({ value, onChange, className, id, ...props }: PhoneFieldProps) {
  const formatted = value.replace(/(\d{2})(?=\d)/g, "$1 ").trim();

  return (
    <div className={cn("flex items-stretch", className)}>
      <span
        aria-hidden
        className="tabular flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground"
      >
        +229
      </span>
      <Input
        id={id}
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="01 XX XX XX XX"
        maxLength={14}
        className="tabular rounded-l-none text-base tracking-wide"
        value={formatted}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 10))}
        {...props}
      />
    </div>
  );
}
