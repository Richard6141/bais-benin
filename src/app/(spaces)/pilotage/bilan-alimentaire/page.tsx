import type { Metadata } from "next";
import { TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requireRole } from "@/features/auth/session";
import { FoodBalanceSection } from "@/features/food-balance/food-balance-section";
import { getFoodBalance } from "@/modules/food-balance";

export const metadata: Metadata = { title: "Bilan alimentaire" };

// Bilan alimentaire prévisionnel par commune (ADR-0035) : repérer, avant la récolte, les communes
// où la production vivrière attendue ne couvrira pas les besoins de la population. Des communes et
// des calories, aucun producteur.
export default async function FoodBalancePage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/bilan-alimentaire" });
  const view = await getFoodBalance(user.actor);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Bilan alimentaire"
        description={
          view
            ? `Campagne ${view.campaignCode} : la production vivrière attendue de chaque commune face aux besoins de sa population.`
            : "Aucune campagne ouverte."
        }
      />
      <Alert variant="warning">
        <TriangleAlert aria-hidden />
        <AlertTitle className="line-clamp-none">
          Couverture des besoins par la production locale, pas la faim
        </AlertTitle>
        <AlertDescription>
          Marchés, stocks, achats et importations n&apos;y sont pas. Une commune couverte peut
          connaître la faim ; une commune en déficit peut être bien ravitaillée. Le chiffre dit où
          regarder d&apos;abord.
        </AlertDescription>
      </Alert>
      {view ? <FoodBalanceSection view={view} /> : null}
    </div>
  );
}
