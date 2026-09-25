import { Info, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface WelcomeStep {
  title: string;
  description: string;
  icon: LucideIcon;
}

interface SpaceWelcomeProps {
  eyebrow: string;
  title: string;
  description: string;
  steps: readonly WelcomeStep[];
}

// Accueil d'un espace tant que ses fonctions ne sont pas livrées : un avis d'ouverture prochaine
// et la liste des services prévus, sans cartes ni numérotation décorative.
export function SpaceWelcome({ eyebrow, title, description, steps }: SpaceWelcomeProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <Alert variant="info">
        <Info aria-hidden />
        <AlertTitle>Espace en cours d&apos;ouverture</AlertTitle>
        <AlertDescription>
          <p>
            Les services ci-dessous seront disponibles dans une prochaine version de la plateforme.
          </p>
        </AlertDescription>
      </Alert>
      <section aria-labelledby="services-prevus" className="flex flex-col gap-3">
        <h2 id="services-prevus" className="border-b pb-2 text-lg">
          Services prévus
        </h2>
        <ul className="divide-y border-b">
          {steps.map((step) => (
            <li key={step.title} className="flex items-start gap-3 py-3">
              <step.icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <span>
                <span className="block font-semibold text-heading">{step.title}</span>
                <span className="block text-sm text-muted-foreground">{step.description}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
