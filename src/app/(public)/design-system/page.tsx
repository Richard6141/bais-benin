import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";
import { ButtonsSection } from "@/features/design-system/buttons-section";
import { DashboardSection } from "@/features/design-system/dashboard-section";
import { DataSection } from "@/features/design-system/data-section";
import { FeedbackSection } from "@/features/design-system/feedback-section";
import { FormsSection } from "@/features/design-system/forms-section";
import { GlyphsSection } from "@/features/design-system/glyphs-section";
import { MonitoringSection } from "@/features/design-system/monitoring-section";
import { OverlaysSection } from "@/features/design-system/overlays-section";
import { TokensSection } from "@/features/design-system/tokens-section";

export const metadata: Metadata = {
  title: "Design system",
  description: "Jetons, composants et états visuels de la plateforme.",
};

const sections = [
  { id: "jetons", label: "Jetons" },
  { id: "pictogrammes", label: "Pictogrammes" },
  { id: "boutons", label: "Boutons" },
  { id: "formulaires", label: "Formulaires" },
  { id: "superpositions", label: "Fenêtres et menus" },
  { id: "retours", label: "Alertes et états" },
  { id: "donnees", label: "Données" },
  { id: "monitoring", label: "Monitoring" },
  { id: "tableau-de-bord", label: "Tableau de bord" },
];

export default function DesignSystemPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6">
        <PageHeader
          eyebrow="Fondations visuelles"
          title="Design system"
          description="Jetons, composants de base et composants métier de la plateforme, selon la charte des portails de l'administration."
        />
        <nav
          aria-label="Sections"
          className="sticky top-0 z-30 -mx-4 border-b bg-background px-4 py-2 sm:-mx-6 sm:px-6"
        >
          <ul className="flex gap-1 overflow-x-auto text-sm">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="inline-block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="divide-y">
          <TokensSection />
          <GlyphsSection />
          <ButtonsSection />
          <FormsSection />
          <OverlaysSection />
          <FeedbackSection />
          <DataSection />
          <MonitoringSection />
          <DashboardSection />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
