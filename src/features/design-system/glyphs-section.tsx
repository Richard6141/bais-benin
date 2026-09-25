import { CROP_CODES, CROP_GLYPH_LABELS, CropGlyph } from "@/components/data-display/crop-glyph";
import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { MinistryLockup } from "@/components/brand/ministry-lockup";
import { MinistryLogo } from "@/components/brand/ministry-logo";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

export function GlyphsSection() {
  return (
    <DemoSection
      id="pictogrammes"
      title="Identité et pictogrammes"
      description="La seule marque de la plateforme est celle du ministère : logo officiel complet dans les en-têtes et la fiche imprimable ; armoiries et dénomination en texte, sur fond sombre, dans le pied de page ; armoiries seules pour les icônes. Les silhouettes de cultures sont des repères visuels pour les utilisateurs peu lettrés."
    >
      <DemoRow label="Logo officiel du ministère (en-têtes, fiche imprimable)">
        <MinistryLogo />
      </DemoRow>
      <DemoRow label="Armoiries et dénomination sur fond sombre (pied de page)">
        <div className="rounded-sm bg-marine-strong p-4">
          <MinistryLockup inverted />
        </div>
      </DemoRow>
      <DemoRow label="Armoiries seules (icônes de l'application et de l'onglet)">
        <GovernmentEmblem size={36} />
        <GovernmentEmblem size={48} />
        <GovernmentEmblem size={64} />
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
