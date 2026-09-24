import { CloudRain, Inbox, ShieldCheck, Sun, TriangleAlert } from "lucide-react";
import { ReliabilityBadge, type Reliability } from "@/components/data-display/reliability-badge";
import { ConfidenceMeter, type ConfidenceLevel } from "@/components/feedback/confidence-meter";
import { EmptyState } from "@/components/feedback/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

const reliabilityLevels: Reliability[] = [
  "DECLARED",
  "AGENT_VERIFIED",
  "FIELD_VERIFIED",
  "OFFICIAL",
  "ESTIMATED",
  "SYNTHETIC",
];
const confidenceLevels: ConfidenceLevel[] = ["HIGH", "MEDIUM", "LOW", "INSUFFICIENT"];

export function FeedbackSection() {
  return (
    <DemoSection
      id="retours"
      title="Alertes, badges et états"
      description="Les niveaux d'alerte, la fiabilité des données et la confiance de l'assistant ont chacun leur vocabulaire visuel."
    >
      <DemoRow label="Alertes" className="flex-col items-stretch">
        <Alert variant="info">
          <Sun aria-hidden />
          <AlertTitle>Prévision : semaine sèche à Kandi</AlertTitle>
          <AlertDescription>
            <p>Aucune pluie attendue avant le 2 octobre. Surveiller les semis récents.</p>
          </AlertDescription>
        </Alert>
        <Alert variant="watch">
          <TriangleAlert aria-hidden />
          <AlertTitle>Vigilance : cumul de pluie faible sur 10 jours</AlertTitle>
          <AlertDescription>
            <p>3 mm relevés à Djougou, contre 28 mm en moyenne à cette période.</p>
          </AlertDescription>
        </Alert>
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertTitle>Alerte hydrique : 41 exploitations concernées</AlertTitle>
          <AlertDescription>
            <p>Température maximale supérieure à 36 °C pendant 3 jours et absence de pluie.</p>
          </AlertDescription>
        </Alert>
        <Alert variant="critical">
          <CloudRain aria-hidden />
          <AlertTitle>Risque d&apos;inondation : vallée de l&apos;Ouémé</AlertTitle>
          <AlertDescription>
            <p>Crue annoncée sous 48 h. Diffusion en cours aux producteurs de Bonou et Adjohoun.</p>
          </AlertDescription>
        </Alert>
        <Alert variant="success">
          <ShieldCheck aria-hidden />
          <AlertTitle>Exploitation vérifiée sur le terrain</AlertTitle>
          <AlertDescription>
            <p>Relevé GPS et superficie confirmés par l&apos;agent le 12 septembre 2026.</p>
          </AlertDescription>
        </Alert>
      </DemoRow>

      <DemoRow label="Badges">
        <Badge>Par défaut</Badge>
        <Badge variant="secondary">Secondaire</Badge>
        <Badge variant="outline">Contour</Badge>
        <Badge variant="info">Information</Badge>
        <Badge variant="success">Vérifié</Badge>
        <Badge variant="watch">Vigilance</Badge>
        <Badge variant="warning">Alerte</Badge>
        <Badge variant="critical">Critique</Badge>
        <Badge variant="offline">Hors ligne</Badge>
      </DemoRow>

      <DemoRow label="Fiabilité de la donnée">
        {reliabilityLevels.map((level) => (
          <ReliabilityBadge key={level} level={level} />
        ))}
      </DemoRow>

      <DemoRow label="Confiance de l'assistant" className="grid gap-4 sm:grid-cols-2">
        {confidenceLevels.map((level, index) => (
          <ConfidenceMeter key={level} level={level} score={[0.92, 0.71, 0.44, 0.12][index]} />
        ))}
      </DemoRow>

      <DemoRow label="État vide et chargement" className="grid items-stretch gap-4 lg:grid-cols-2">
        <EmptyState
          icon={<Inbox />}
          title="Aucune exploitation enregistrée"
          description="Commencez par enregistrer une exploitation lors de votre prochaine visite de terrain."
          action={<Button>Enregistrer une exploitation</Button>}
        />
        <div className="flex flex-col gap-3 rounded-xl border p-5">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        </div>
      </DemoRow>
    </DemoSection>
  );
}
