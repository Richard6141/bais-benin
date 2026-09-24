import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface DemoSectionProps {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}

// Section de la page de démonstration : ancre, titre, description, contenu.
export function DemoSection({ id, title, description, children }: DemoSectionProps) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-24 py-10">
      <div className="mb-6">
        <h2 id={`${id}-titre`} className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      <div className="flex flex-col gap-8">{children}</div>
    </section>
  );
}

interface DemoRowProps {
  label: string;
  children: ReactNode;
  className?: string;
}

export function DemoRow({ label, children, className }: DemoRowProps) {
  return (
    <div>
      <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </p>
      <div className={cn("flex flex-wrap items-center gap-3", className)}>{children}</div>
    </div>
  );
}
