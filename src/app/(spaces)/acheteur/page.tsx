import { BadgeCheck, Search, ShoppingBasket } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SpaceWelcome } from "@/features/auth/space-welcome";

export const metadata: Metadata = { title: "Espace acheteur" };

export default async function BuyerSpacePage() {
  const user = await requireRole("BUYER");
  return (
    <SpaceWelcome
      eyebrow="Espace acheteur"
      title={`Bienvenue, ${user.name}`}
      description="Trouvez des productions vérifiées et publiez vos demandes d'achat."
      steps={[
        {
          title: "Rechercher",
          description: "Par produit, zone et volume, avec la carte.",
          icon: Search,
        },
        {
          title: "Exploitations vérifiées",
          description: "Le badge de vérification terrain sécurise vos achats.",
          icon: BadgeCheck,
        },
        {
          title: "Demande d'achat",
          description: "Trois champs pour toucher les producteurs et coopératives.",
          icon: ShoppingBasket,
        },
      ]}
    />
  );
}
