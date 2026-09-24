import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { HeroSection } from "@/features/landing/hero-section";
import { PlatformStatus } from "@/features/landing/platform-status";
import { QuestionsSection } from "@/features/landing/questions-section";
import { SpacesGrid } from "@/features/landing/spaces-grid";
import { TerritoryFigures } from "@/features/landing/territory-figures";

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <HeroSection />
        <TerritoryFigures />
        <QuestionsSection />
        <SpacesGrid />
        <PlatformStatus />
      </main>
      <SiteFooter />
    </>
  );
}
