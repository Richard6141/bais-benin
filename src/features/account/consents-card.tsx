import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Actor } from "@/modules/authorization";
import { WHATSAPP_CONSENT_TEXT, whatsappConsentOf } from "@/modules/notifications";
import { RANKING_CONSENT_TEXT, rankingConsentOf } from "@/modules/public-ranking";
import { ConsentRow } from "./consent-row";

const longDate = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Africa/Porto-Novo",
});

// « Mes accords » sur la page du compte : ce que le producteur autorise la plateforme à faire en
// son nom. Rien n'est affiché pour un compte qu'aucune fiche producteur ne relie. Les textes
// viennent du domaine, qui enregistre leur version avec chaque accord (preuve APDP).
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
          title={WHATSAPP_CONSENT_TEXT.title}
          description={WHATSAPP_CONSENT_TEXT.text}
          grantedOn={whatsapp.grantedAt ? longDate.format(whatsapp.grantedAt) : null}
        />
        <ConsentRow
          consent="RANKING"
          title={RANKING_CONSENT_TEXT.title}
          description={RANKING_CONSENT_TEXT.text}
          grantedOn={ranking.grantedAt ? longDate.format(ranking.grantedAt) : null}
        />
      </CardContent>
    </Card>
  );
}
