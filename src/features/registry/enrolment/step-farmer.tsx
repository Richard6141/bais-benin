"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { useState } from "react";
import { z } from "zod";
import { PhoneField } from "@/components/forms/phone-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AgentDatabase } from "@/lib/offline/db";
import { cn } from "@/lib/utils";
import type { FarmerSection } from "./enrolment-types";
import { StepShell } from "./step-shell";

interface StepFarmerProps {
  db: AgentDatabase;
  value: FarmerSection | null;
  onValidate: (value: FarmerSection) => void;
  onLater: () => void;
}

const newFarmerSchema = z.object({
  firstName: z.string().trim().min(1, "Le prénom est nécessaire.").max(80),
  lastName: z.string().trim().min(1, "Le nom est nécessaire.").max(80),
  gender: z.enum(["M", "F"]).optional(),
  phone: z
    .string()
    .refine((digits) => digits === "" || (digits.length === 10 && digits.startsWith("01")), {
      message: "Ce numéro doit avoir 10 chiffres et commencer par 01.",
    }),
  birthYear: z
    .string()
    .refine(
      (year) =>
        year === "" || (/^\d{4}$/.test(year) && Number(year) >= 1920 && Number(year) <= 2010),
      {
        message: "Indiquez une année entre 1920 et 2010.",
      },
    ),
});

const normalize = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// A1 : rattacher l'exploitation à un producteur connu (recherche locale, hors réseau) ou en créer
// un nouveau avec le strict minimum : prénom, nom, sexe, téléphone facultatif.
export function StepFarmer({ db, value, onValidate, onLater }: StepFarmerProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"SEARCH" | "NEW">(value?.mode === "NEW" ? "NEW" : "SEARCH");
  const [form, setForm] = useState({
    firstName: value?.firstName ?? "",
    lastName: value?.lastName ?? "",
    gender: value?.gender,
    phone: value?.phone ?? "",
    birthYear: value?.birthYear ? String(value.birthYear) : "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const matches = useLiveQuery(
    async () => {
      const farms = await db.farms.orderBy("updatedAt").reverse().limit(200).toArray();
      const seen = new Map<string, { farmerId: string; farmerName: string; communeName: string }>();
      for (const farm of farms) {
        if (!seen.has(farm.farmerId)) {
          seen.set(farm.farmerId, {
            farmerId: farm.farmerId,
            farmerName: farm.farmerName,
            communeName: farm.communeName,
          });
        }
      }
      const needle = normalize(query.trim());
      return [...seen.values()]
        .filter((farmer) => !needle || normalize(farmer.farmerName).includes(needle))
        .slice(0, 8);
    },
    [db, query],
    [],
  );

  function submitNew() {
    const parsed = newFarmerSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path[0])] = issue.message;
      setErrors(next);
      return;
    }
    setErrors({});
    onValidate({
      mode: "NEW",
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      gender: parsed.data.gender,
      phone: parsed.data.phone || undefined,
      birthYear: parsed.data.birthYear ? Number(parsed.data.birthYear) : undefined,
    });
  }

  if (mode === "NEW") {
    return (
      <StepShell
        title="Nouveau producteur"
        description="Écrivez le nom comme sur la pièce d'identité si elle existe."
        primaryLabel="Continuer"
        onPrimary={submitNew}
        onBack={() => setMode("SEARCH")}
        secondary={{ label: "Finir plus tard", onClick: onLater }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="farmer-first" label="Prénom" error={errors.firstName}>
            <Input
              id="farmer-first"
              autoComplete="off"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
          </Field>
          <Field id="farmer-last" label="Nom" error={errors.lastName}>
            <Input
              id="farmer-last"
              autoComplete="off"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </Field>
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Sexe</span>
          <div className="grid grid-cols-2 gap-2" role="group" aria-label="Sexe">
            {(["F", "M"] as const).map((gender) => (
              <Button
                key={gender}
                type="button"
                variant={form.gender === gender ? "default" : "outline"}
                aria-pressed={form.gender === gender}
                className="h-12"
                onClick={() => setForm({ ...form, gender })}
              >
                {gender === "F" ? "Femme" : "Homme"}
              </Button>
            ))}
          </div>
        </div>
        <Field id="farmer-phone" label="Téléphone (facultatif)" error={errors.phone}>
          <PhoneField
            id="farmer-phone"
            value={form.phone}
            onChange={(phone) => setForm({ ...form, phone })}
          />
        </Field>
        <Field id="farmer-birth" label="Année de naissance (facultatif)" error={errors.birthYear}>
          <Input
            id="farmer-birth"
            inputMode="numeric"
            maxLength={4}
            placeholder="1984"
            value={form.birthYear}
            onChange={(e) => setForm({ ...form, birthYear: e.target.value.replace(/\D/g, "") })}
          />
        </Field>
      </StepShell>
    );
  }

  return (
    <StepShell
      title="Quel producteur ?"
      description="Cherchez un producteur déjà enregistré, ou créez-le."
      primaryLabel="Nouveau producteur"
      onPrimary={() => setMode("NEW")}
      secondary={{ label: "Finir plus tard", onClick: onLater }}
    >
      <Field id="farmer-search" label="Nom du producteur">
        <Input
          id="farmer-search"
          type="search"
          autoComplete="off"
          placeholder="Ex. Adjoa Hounkpatin"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </Field>
      <ul className="flex flex-col gap-2" aria-label="Producteurs connus">
        {(matches ?? []).map((farmer) => {
          const selected = value?.mode === "EXISTING" && value.existingFarmerId === farmer.farmerId;
          return (
            <li key={farmer.farmerId}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() =>
                  onValidate({
                    mode: "EXISTING",
                    existingFarmerId: farmer.farmerId,
                    existingFarmerName: farmer.farmerName,
                  })
                }
                className={cn(
                  "flex min-h-14 w-full items-center justify-between rounded-lg border bg-card px-4 text-left hover:bg-accent/60",
                  selected && "border-primary bg-accent",
                )}
              >
                <span className="font-medium">{farmer.farmerName}</span>
                <span className="text-sm text-muted-foreground">{farmer.communeName}</span>
              </button>
            </li>
          );
        })}
        {matches && matches.length === 0 ? (
          <li className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            Aucun producteur trouvé : créez-le.
          </li>
        ) : null}
      </ul>
    </StepShell>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
