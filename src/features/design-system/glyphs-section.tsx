import { CROP_CODES, CROP_GLYPH_LABELS, CropGlyph } from "@/components/data-display/crop-glyph";
import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { Monogram } from "@/components/brand/monogram";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

export function GlyphsSection() {
  return (
    <DemoSection
      id="pictogrammes"
      title="Marque et pictogrammes"
      description="Les armoiries de l'État dans les en-têtes, le pied de page et la fiche imprimable ; le monogramme seulement comme icône de l'application installée ; les silhouettes de cultures, repères visuels pour les utilisateurs peu lettrés."
    >
      <DemoRow label="Armoiries (en-têtes, pied de page, fiche imprimable)">
        <GovernmentEmblem size={36} />
        <GovernmentEmblem size={44} />
        <GovernmentEmblem size={64} />
      </DemoRow>
      <DemoRow label="Monogramme (icône de l'application installée)">
        <Monogram className="size-9" />
        <Monogram className="size-14" />
        <Monogram className="size-20" />
      </DemoRow>
      <DemoRow
        label="Cultures (24 px et 48 px)"
        className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-7"
      >
        {CROP_CODES.map((code) => (
          <div
            key={code}
            className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3 text-center"
          >
            <CropGlyph code={code} size={48} className="text-primary" />
            <CropGlyph code={code} size={24} className="text-muted-foreground" />
            <span className="text-xs">{CROP_GLYPH_LABELS[code]}</span>
          </div>
        ))}
      </DemoRow>
    </DemoSection>
  );
}
