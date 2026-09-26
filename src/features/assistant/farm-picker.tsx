"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface FarmOption {
  code: string;
  /** Nom de l'exploitation ou du producteur, et commune : jamais un téléphone. */
  label: string;
}

interface FarmPickerProps {
  farms: readonly FarmOption[];
  value: string | null;
  onChange: (code: string | null) => void;
}

// B1 : choix d'une exploitation du périmètre de l'agent, par recherche (nom, code, commune).
// « Sans exploitation » pour une question générale. Seules les exploitations du périmètre sont
// proposées : le serveur vérifie de toute façon le périmètre à chaque question.
export function FarmPicker({ farms, value, onChange }: FarmPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = farms.find((farm) => farm.code === value);
  return (
    <div className="flex flex-col gap-1.5">
      <span id="exploitation-label" className="text-sm font-medium">
        Exploitation concernée
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-labelledby="exploitation-label"
            className="h-11 w-full justify-between font-normal sm:max-w-md"
          >
            <span className="truncate">
              {selected ? `${selected.code} (${selected.label})` : "Sans exploitation"}
            </span>
            <ChevronsUpDown className="opacity-50" aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command>
            <CommandInput placeholder="Nom, code ou commune" />
            <CommandList>
              <CommandEmpty>Aucune exploitation de votre périmètre ne correspond.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="Sans exploitation"
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                >
                  <Check className={cn(value === null ? "opacity-100" : "opacity-0")} />
                  Sans exploitation (question générale)
                </CommandItem>
                {farms.map((farm) => (
                  <CommandItem
                    key={farm.code}
                    value={`${farm.code} ${farm.label}`}
                    onSelect={() => {
                      onChange(farm.code);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn(value === farm.code ? "opacity-100" : "opacity-0")} />
                    <span className="font-mono text-xs">{farm.code}</span>
                    <span className="truncate">{farm.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
