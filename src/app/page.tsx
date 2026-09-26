import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/features/landing/hero-section";
import { QuestionsSection } from "@/features/landing/questions-section";
import { TerritoryFigures } from "@/features/landing/territory-figures";
import { WhoAreYou } from "@/features/landing/who-are-you";

// Les chiffres du territoire sont lus dans la base à chaque visite : la page n'est jamais figée
// au moment du build, qui tourne sans base (image Docker, intégration continue).
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <WhoAreYou />
        <TerritoryFigures />
        <QuestionsSection />
      </main>
      <SiteFooter />
    </>
  );
}
