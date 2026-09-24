import { Download, MapPin, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

export function ButtonsSection() {
  return (
    <DemoSection
      id="boutons"
      title="Boutons"
      description="Une action principale par écran. Sur l'espace agriculteur, les boutons passent en taille large et pleine largeur."
    >
      <DemoRow label="Variantes">
        <Button>Enregistrer</Button>
        <Button variant="secondary">Annuler</Button>
        <Button variant="outline">Exporter</Button>
        <Button variant="ghost">Voir le détail</Button>
        <Button variant="link">En savoir plus</Button>
        <Button variant="destructive">Archiver</Button>
      </DemoRow>
      <DemoRow label="Tailles">
        <Button size="xs">Très petit</Button>
        <Button size="sm">Petit</Button>
        <Button size="default">Standard</Button>
        <Button size="lg">Grand</Button>
      </DemoRow>
      <DemoRow label="Avec icône">
        <Button>
          <Plus aria-hidden />
          Nouvelle exploitation
        </Button>
        <Button variant="outline">
          <Download aria-hidden />
          Exporter en CSV
        </Button>
        <Button variant="secondary">
          <RefreshCw aria-hidden />
          Synchroniser
        </Button>
        <Button size="icon" variant="outline" aria-label="Localiser">
          <MapPin aria-hidden />
        </Button>
      </DemoRow>
      <DemoRow label="États">
        <Button disabled>Désactivé</Button>
        <Button variant="outline" disabled>
          Désactivé
        </Button>
        <Button aria-busy>
          <RefreshCw className="animate-spin" aria-hidden />
          Synchronisation…
        </Button>
      </DemoRow>
      <DemoRow label="Espace agriculteur (pleine largeur, 56 px)" className="max-w-sm">
        <Button className="h-14 w-full text-base">Déclarer ma récolte</Button>
        <Button variant="outline" className="h-14 w-full text-base">
          Voir mes alertes
        </Button>
      </DemoRow>
    </DemoSection>
  );
}
