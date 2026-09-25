import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/features/landing/hero-section";
import { QuestionsSection } from "@/features/landing/questions-section";
import { SpacesGrid } from "@/features/landing/spaces-grid";
import { TerritoryFigures } from "@/features/landing/territory-figures";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <SpacesGrid />
        <TerritoryFigures />
        <QuestionsSection />
      </main>
      <SiteFooter />
    </>
  );
}
