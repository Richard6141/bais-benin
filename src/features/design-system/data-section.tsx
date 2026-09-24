import { Bell, Sprout, Users, Wheat } from "lucide-react";
import { ReliabilityBadge } from "@/components/data-display/reliability-badge";
import { StatTile } from "@/components/data-display/stat-tile";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

// Chiffres de démonstration, marqués comme tels : ils illustrent les composants,
// pas la production réelle.
const communes = [
  { commune: "Djougou", departement: "Donga", farms: 4_812, hectares: 9_640, verified: 0.31 },
  { commune: "Banikoara", departement: "Alibori", farms: 6_120, hectares: 21_380, verified: 0.44 },
  { commune: "Savalou", departement: "Collines", farms: 3_905, hectares: 7_210, verified: 0.18 },
  { commune: "Kétou", departement: "Plateau", farms: 2_760, hectares: 5_085, verified: 0.27 },
];

const integer = new Intl.NumberFormat("fr-FR");
const percent = new Intl.NumberFormat("fr-FR", { style: "percent", maximumFractionDigits: 0 });

export function DataSection() {
  return (
    <DemoSection
      id="donnees"
      title="Indicateurs, tableaux et onglets"
      description="Chiffres alignés, provenance visible, densité réglée pour le pilotage."
    >
      <DemoRow label="Tuiles d'indicateurs" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Agriculteurs enregistrés"
          value={48_213}
          trend={{ value: 3.4, label: "sur 30 jours" }}
          source="registre BAIS"
          sourceDate="24 sept. 2026"
          reliability="SYNTHETIC"
          icon={<Users />}
        />
        <StatTile
          label="Superficie déclarée"
          value={96_540}
          unit="ha"
          trend={{ value: 1.2, label: "campagne 2025-2026" }}
          source="registre BAIS"
          reliability="DECLARED"
          icon={<Sprout />}
        />
        <StatTile
          label="Production de maïs"
          value={112_300}
          unit="t"
          trend={{ value: -2.8, label: "vs 2024-2025" }}
          source="déclarations de récolte"
          reliability="ESTIMATED"
          icon={<Wheat />}
        />
        <StatTile
          label="Alertes actives"
          value={7}
          trend={{ value: -12.5, label: "sur 7 jours", positiveIsGood: false }}
          source="moteur de règles"
          icon={<Bell />}
        />
      </DemoRow>

      <DemoRow label="Tableau" className="block">
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableCaption className="px-4 pb-4 text-left">
              Données de démonstration, générées pour illustrer le composant.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Commune</TableHead>
                <TableHead>Département</TableHead>
                <TableHead className="text-right">Exploitations</TableHead>
                <TableHead className="text-right">Hectares</TableHead>
                <TableHead className="text-right">Part vérifiée</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {communes.map((row) => (
                <TableRow key={row.commune}>
                  <TableCell className="font-medium">{row.commune}</TableCell>
                  <TableCell className="text-muted-foreground">{row.departement}</TableCell>
                  <TableCell className="tabular text-right">{integer.format(row.farms)}</TableCell>
                  <TableCell className="tabular text-right">
                    {integer.format(row.hectares)}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {percent.format(row.verified)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </DemoRow>

      <DemoRow label="Onglets" className="block">
        <Tabs defaultValue="parcelles">
          <TabsList>
            <TabsTrigger value="parcelles">Parcelles</TabsTrigger>
            <TabsTrigger value="cultures">Cultures</TabsTrigger>
            <TabsTrigger value="historique">Historique</TabsTrigger>
          </TabsList>
          <TabsContent value="parcelles">
            <Card>
              <CardHeader>
                <CardTitle>Deux parcelles · 3,2 ha</CardTitle>
                <CardDescription>
                  Relevé GPS sur les deux ; écart de 4 % avec la superficie déclarée.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex gap-2">
                <ReliabilityBadge level="FIELD_VERIFIED" />
                <ReliabilityBadge level="DECLARED" />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="cultures">
            <Card>
              <CardHeader>
                <CardTitle>Maïs et niébé</CardTitle>
                <CardDescription>Campagne 2025-2026, grande saison des pluies.</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
          <TabsContent value="historique">
            <Card>
              <CardHeader>
                <CardTitle>Trois campagnes enregistrées</CardTitle>
                <CardDescription>Première déclaration le 14 mai 2024.</CardDescription>
              </CardHeader>
            </Card>
          </TabsContent>
        </Tabs>
      </DemoRow>
    </DemoSection>
  );
}
