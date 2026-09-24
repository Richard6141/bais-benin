"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// Formulaire de démonstration : une déclaration de récolte simplifiée.
// Il illustre l'assemblage Form + Zod ; le vrai formulaire vivra dans
// features/harvest-declaration avec les schémas du module registry.
const schema = z.object({
  crop: z.string().min(1, "Choisissez une culture"),
  // Le champ arrive sous forme de chaîne ; la conversion en nombre est explicite.
  quantity: z
    .string()
    .min(1, "Indiquez une quantité")
    .transform((raw) => Number(raw.replace(",", ".")))
    .pipe(
      z
        .number({ error: "Indiquez une quantité valide" })
        .positive("La quantité doit être supérieure à zéro")
        .max(100_000, "Quantité invraisemblable, vérifiez l'unité"),
    ),
  unit: z.enum(["KG", "BAG_100KG", "T"]),
  notes: z.string().max(280, "280 caractères maximum").optional(),
  consent: z.boolean().refine((value) => value, {
    message: "Le consentement est nécessaire pour enregistrer la déclaration",
  }),
});

// Le type saisi (chaînes) diffère du type validé (nombre) : react-hook-form reçoit les deux.
type HarvestDeclarationInput = z.input<typeof schema>;
type HarvestDeclaration = z.output<typeof schema>;

const crops = [
  { code: "MAIZE", label: "Maïs" },
  { code: "CASSAVA", label: "Manioc" },
  { code: "YAM", label: "Igname" },
  { code: "COTTON", label: "Coton" },
  { code: "RICE", label: "Riz" },
];

export function HarvestDeclarationDemo() {
  const [submitted, setSubmitted] = useState<HarvestDeclaration | null>(null);
  const form = useForm<HarvestDeclarationInput, undefined, HarvestDeclaration>({
    resolver: zodResolver(schema),
    defaultValues: { crop: "", quantity: "", unit: "KG", notes: "", consent: false },
  });

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit((values) => setSubmitted(values))}
          className="flex flex-col gap-5"
          noValidate
        >
          <FormField
            control={form.control}
            name="crop"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Culture</FormLabel>
                <Select onValueChange={field.onChange} value={field.value}>
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choisir une culture" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {crops.map((crop) => (
                      <SelectItem key={crop.code} value={crop.code}>
                        {crop.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <FormField
              control={form.control}
              name="quantity"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Quantité récoltée</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="unit"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Unité</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="KG">kg</SelectItem>
                      <SelectItem value="BAG_100KG">sac de 100 kg</SelectItem>
                      <SelectItem value="T">tonne</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Observations</FormLabel>
                <FormControl>
                  <Textarea placeholder="Pertes, qualité, stockage…" rows={3} {...field} />
                </FormControl>
                <FormDescription>Facultatif. Visible par votre agent.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="consent"
            render={({ field }) => (
              <FormItem className="flex items-start gap-3 rounded-md border p-3">
                <FormControl>
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                </FormControl>
                <div className="flex flex-col gap-1">
                  <FormLabel className="font-normal">
                    J&apos;autorise l&apos;enregistrement de cette déclaration dans le registre
                    national.
                  </FormLabel>
                  <FormMessage />
                </div>
              </FormItem>
            )}
          />
          <Button type="submit" className="h-12 sm:self-start">
            Enregistrer la déclaration
          </Button>
        </form>
      </Form>
      <div className="flex flex-col gap-3">
        {submitted ? (
          <Alert variant="success">
            <AlertTitle>Déclaration enregistrée (démonstration)</AlertTitle>
            <AlertDescription>
              <p>
                {crops.find((crop) => crop.code === submitted.crop)?.label} : {submitted.quantity}{" "}
                {submitted.unit === "KG" ? "kg" : submitted.unit === "T" ? "t" : "sac(s) de 100 kg"}
                .
              </p>
            </AlertDescription>
          </Alert>
        ) : (
          <Alert variant="info">
            <AlertTitle>Validation côté client et serveur</AlertTitle>
            <AlertDescription>
              <p>
                Le même schéma Zod sert au formulaire et à l&apos;action serveur : les messages
                d&apos;erreur sont identiques des deux côtés.
              </p>
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
