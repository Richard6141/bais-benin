import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Actor } from "@/modules/authorization";
import { whatsappConsentOf } from "@/modules/notifications";
import { rankingConsentOf } from "@/modules/public-ranking";
import { ConsentRow } from "./consent-row";

const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});

// « Mes accords » sur la page du compte : ce que le producteur autorise la plateforme à faire en
// son nom. Rien n'est affiché pour un compte qu'aucune fiche producteur ne relie.
export async function ConsentsCard({ actor }: { actor: Actor }) {
  const [whatsapp, ranking] = await Promise.all([
    whatsappConsentOf(actor),
    rankingConsentOf(actor),
  ]);
  if (!whatsapp.available) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Mes accords</CardTitle>
        <CardDescription>
          Vous pouvez donner ou retirer chaque accord à tout moment. Le retrait prend effet tout de
          suite.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-y text-sm">
        <ConsentRow
          consent="WHATSAPP"
          title="Messages WhatsApp"
          description="Recevoir sur votre numéro les alertes de votre commune et le suivi de vos demandes et signalements (prise en charge, réponse, décision de l'agent)."
          grantedOn={whatsapp.grantedAt ? longDate.format(whatsapp.grantedAt) : null}
        />
        <ConsentRow
          consent="RANKING"
          title="Palmarès public"
          description="Figurer, si vous êtes parmi les meilleurs, dans les palmarès que le ministère publie sur la plateforme : votre nom, votre commune, votre rang et votre production. Votre numéro de téléphone n'est jamais publié."
          grantedOn={ranking.grantedAt ? longDate.format(ranking.grantedAt) : null}
        />
      </CardContent>
    </Card>
  );
}
