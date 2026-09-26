import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/features/landing/hero-section";
import { QuestionsSection } from "@/features/landing/questions-section";
import { TerritoryFigures } from "@/features/landing/territory-figures";
import { WhoAreYou } from "@/features/landing/who-are-you";

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
