import { CROP_CODES, CROP_GLYPH_LABELS, CropGlyph } from "@/components/data-display/crop-glyph";
import { Monogram } from "@/components/brand/monogram";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

export function GlyphsSection() {
  return (
    <DemoSection
      id="pictogrammes"
      title="Marque et pictogrammes"
      description="Le monogramme et les silhouettes de cultures, repères visuels pour les utilisateurs peu lettrés."
    >
      <DemoRow label="Monogramme">
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
