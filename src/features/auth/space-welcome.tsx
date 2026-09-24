import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

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

// Accueil d'un espace tant que ses fonctions ne sont pas livrées : trois repères,
// pas plus, pour que la première visite explique ce que l'on pourra y faire.
export function SpaceWelcome({ eyebrow, title, description, steps }: SpaceWelcomeProps) {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <ol className="grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.title}>
            <Card className="h-full">
              <CardHeader>
                <div className="mb-2 flex items-center gap-3">
                  <span className="tabular flex size-8 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
                    {index + 1}
                  </span>
                  <step.icon className="size-5 text-primary" aria-hidden />
                </div>
                <CardTitle>{step.title}</CardTitle>
                <CardDescription>{step.description}</CardDescription>
              </CardHeader>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
