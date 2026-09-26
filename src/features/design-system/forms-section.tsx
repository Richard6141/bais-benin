import { Search } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";
import { HarvestDeclarationDemo } from "@/features/design-system/harvest-declaration-demo";

export function FormsSection() {
  return (
    <DemoSection
      id="formulaires"
      title="Formulaires"
      description="Champs à 44 px minimum, libellés toujours visibles, erreurs sous le champ, validation partagée avec le serveur."
    >
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-nom">Nom de l&apos;exploitation</Label>
          <Input id="demo-nom" placeholder="Ferme de Kpakpavissa" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-recherche">Recherche</Label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="demo-recherche"
              className="pl-9"
              placeholder="Commune, agriculteur ou code"
            />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-commune">Commune</Label>
          <Select>
            <SelectTrigger id="demo-commune" className="w-full">
              <SelectValue placeholder="Choisir une commune" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="djougou">Djougou</SelectItem>
              <SelectItem value="parakou">Parakou</SelectItem>
              <SelectItem value="abomey-calavi">Abomey-Calavi</SelectItem>
              <SelectItem value="kandi">Kandi</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-superficie">Superficie déclarée</Label>
          <div className="flex items-center gap-2">
            <Input id="demo-superficie" type="number" inputMode="decimal" placeholder="1,5" />
            <span className="text-sm text-muted-foreground">ha</span>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <Label htmlFor="demo-notes">Observations</Label>
          <Textarea id="demo-notes" placeholder="Relevé effectué en présence du producteur." />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-erreur">Téléphone (état d&apos;erreur)</Label>
          <Input
            id="demo-erreur"
            aria-invalid
            aria-describedby="demo-erreur-message"
            defaultValue="01 12 34"
          />
          <p id="demo-erreur-message" className="text-sm text-destructive">
            Numéro incomplet : 10 chiffres attendus (01 XX XX XX XX).
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="demo-desactive">Champ désactivé</Label>
          <Input id="demo-desactive" disabled defaultValue="BJ-DON-002" />
        </div>
      </div>

      <DemoRow label="Choix" className="items-start gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Checkbox id="demo-c1" defaultChecked />
            <Label htmlFor="demo-c1">Irrigation disponible</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="demo-c2" />
            <Label htmlFor="demo-c2">Membre d&apos;une coopérative</Label>
          </div>
        </div>
        <RadioGroup defaultValue="OWNED" className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <RadioGroupItem id="demo-r1" value="OWNED" />
            <Label htmlFor="demo-r1">Propriétaire</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="demo-r2" value="RENTED" />
            <Label htmlFor="demo-r2">Locataire</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem id="demo-r3" value="FAMILY" />
            <Label htmlFor="demo-r3">Terre familiale</Label>
          </div>
        </RadioGroup>
        <div className="flex items-center gap-2">
          <Switch id="demo-s1" defaultChecked />
          <Label htmlFor="demo-s1">Alertes WhatsApp</Label>
        </div>
      </DemoRow>

      <DemoRow label="Formulaire complet (Form + Zod)" className="block">
        <HarvestDeclarationDemo />
      </DemoRow>
    </DemoSection>
  );
}
