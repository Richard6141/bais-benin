import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Les variantes suivent les niveaux d'alerte du produit (INFO, WATCH, WARNING,
// CRITICAL) et l'état de succès. Le fond reste clair : la couleur porte sur la
// bordure gauche, l'icône et le titre, pour rester lisible en plein soleil.
const alertVariants = cva(
  "relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border border-l-4 px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current",
  {
    variants: {
      variant: {
        default: "bg-card text-card-foreground border-l-border",
        info: "bg-card text-card-foreground border-l-info [&>svg]:text-info *:data-[slot=alert-title]:text-info",
        success:
          "bg-card text-card-foreground border-l-success [&>svg]:text-success *:data-[slot=alert-title]:text-success",
        watch:
          "bg-card text-card-foreground border-l-watch [&>svg]:text-watch *:data-[slot=alert-title]:text-watch",
        warning:
          "bg-card text-card-foreground border-l-warning [&>svg]:text-warning *:data-[slot=alert-title]:text-warning",
        critical:
          "bg-critical/6 text-card-foreground border-l-critical [&>svg]:text-critical *:data-[slot=alert-title]:text-critical",
        destructive:
          "bg-card text-destructive border-l-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Alert({
  className,
  variant,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return (
    <div
      data-slot="alert"
      data-variant={variant ?? "default"}
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  );
}

function AlertTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-title"
      className={cn("col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight", className)}
      {...props}
    />
  );
}

function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-description"
      className={cn(
        "col-start-2 grid justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed",
        className,
      )}
      {...props}
    />
  );
}

export { Alert, AlertTitle, AlertDescription, alertVariants };
