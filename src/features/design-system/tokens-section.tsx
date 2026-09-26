import { DemoRow, DemoSection } from "@/features/design-system/demo-section";
import {
  brandColors,
  choroplethNoData,
  choroplethScale,
  cropColors,
  divergingScale,
  semanticColors,
  sequentialScale,
} from "@/styles/tokens";

const spacingScale = [1, 2, 3, 4, 6, 8, 12, 16] as const;
const radii = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "xl", className: "rounded-xl" },
] as const;
const shadows = [
  { name: "card", className: "shadow-card" },
  { name: "raised", className: "shadow-raised" },
  { name: "overlay", className: "shadow-overlay" },
] as const;
const typeScale = [
  { name: "Titre 1", className: "text-4xl font-semibold tracking-tight" },
  { name: "Titre 2", className: "text-2xl font-semibold tracking-tight" },
  { name: "Titre 3", className: "text-xl font-semibold" },
  { name: "Corps", className: "text-base" },
  { name: "Secondaire", className: "text-sm text-muted-foreground" },
  { name: "Légende", className: "text-xs text-muted-foreground" },
  { name: "Code", className: "font-mono text-sm" },
] as const;

export function TokensSection() {
  return (
    <DemoSection
      id="jetons"
      title="Jetons"
      description="Couleurs du territoire, échelles de données, typographie, espacements, rayons et ombres."
    >
      <DemoRow label="Marque">
        {Object.entries(brandColors).map(([name, hex]) => (
          <Swatch key={name} name={name} hex={hex} />
        ))}
      </DemoRow>
      <DemoRow label="Sémantique">
        {Object.entries(semanticColors).map(([name, hex]) => (
          <Swatch key={name} name={name} hex={hex} />
        ))}
      </DemoRow>
      <DemoRow label="Carte agricole (classes par quantiles, puis sans donnée)" className="gap-0">
        {choroplethScale.map((hex) => (
          <span key={hex} className="h-8 w-10 first:rounded-l-md" style={{ background: hex }} />
        ))}
        <span className="ml-2 h-8 w-10 rounded-md" style={{ background: choroplethNoData }} />
      </DemoRow>
      <DemoRow label="Échelle séquentielle (densité, hectares)" className="gap-0">
        {sequentialScale.map((hex) => (
          <span
            key={hex}
            className="h-8 w-10 first:rounded-l-md last:rounded-r-md"
            style={{ background: hex }}
          />
        ))}
      </DemoRow>
      <DemoRow label="Échelle divergente (écart à la normale)" className="gap-0">
        {divergingScale.map((hex) => (
          <span
            key={hex}
            className="h-8 w-10 first:rounded-l-md last:rounded-r-md"
            style={{ background: hex }}
          />
        ))}
      </DemoRow>
      <DemoRow label="Cultures majeures (couleurs fixes)">
        {Object.entries(cropColors).map(([name, hex]) => (
          <Swatch key={name} name={name} hex={hex} />
        ))}
      </DemoRow>
      <DemoRow label="Typographie" className="flex-col items-start gap-2">
        {typeScale.map((entry) => (
          <p key={entry.name} className={entry.className}>
            {entry.name} : Le maïs de la commune de Djougou
          </p>
        ))}
      </DemoRow>
      <DemoRow label="Espacements (grille de 4 px)" className="items-end">
        {spacingScale.map((step) => (
          <div key={step} className="flex flex-col items-center gap-1">
            <span
              className="bg-primary/70"
              style={{ width: `${step * 4}px`, height: `${step * 4}px` }}
            />
            <span className="tabular text-xs text-muted-foreground">{step * 4}</span>
          </div>
        ))}
      </DemoRow>
      <DemoRow label="Rayons">
        {radii.map((radius) => (
          <div key={radius.name} className="flex flex-col items-center gap-1">
            <span className={`size-12 border-2 border-primary bg-primary/10 ${radius.className}`} />
            <span className="text-xs text-muted-foreground">{radius.name}</span>
          </div>
        ))}
      </DemoRow>
      <DemoRow label="Ombres">
        {shadows.map((shadow) => (
          <div key={shadow.name} className="flex flex-col items-center gap-2">
            <span className={`size-16 rounded-lg border bg-card ${shadow.className}`} />
            <span className="text-xs text-muted-foreground">{shadow.name}</span>
          </div>
        ))}
      </DemoRow>
    </DemoSection>
  );
}

function Swatch({ name, hex }: { name: string; hex: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border bg-card py-1.5 pr-3 pl-1.5">
      <span className="size-7 rounded-sm border border-black/10" style={{ background: hex }} />
      <span className="flex flex-col leading-tight">
        <span className="text-xs font-medium">{name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{hex}</span>
      </span>
    </div>
  );
}
