"use client";

import {
  BarChart3,
  BellRing,
  Bug,
  ClipboardCheck,
  Home,
  LandPlot,
  LifeBuoy,
  MapPinned,
  MessageCircleQuestion,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SyncStatusChip } from "@/components/forms/sync-status-chip";
import { SpaceNav, type SpaceNavItem } from "@/components/layout/space-nav";
import { useFeedbackAction } from "@/features/feedback/feedback-button";
import { GuidedTour } from "@/features/onboarding/guided-tour";
import { useSync } from "@/lib/offline/use-sync";

interface AgentShellProps {
  userId: string;
  /** Compte de démonstration : bandeau du scénario suivant. */
  demo?: boolean;
  children: ReactNode;
}

// Rubriques de l'agent, dans l'ordre de sa journée : l'accueil dit quoi faire, puis la tournée
// (exploitations, enregistrement, vérifications), puis ce qui arrive des producteurs et du
// ministère. Sur téléphone, la barre basse garde la tournée ; le reste est sous « Plus ».
const NAV: readonly SpaceNavItem[] = [
  { href: "/agent", label: "Accueil", icon: Home, exact: true, bar: true, top: true },
  { href: "/agent/exploitations", label: "Exploitations", icon: LandPlot, bar: true, top: true },
  {
    href: "/agent/enregistrer",
    label: "Enregistrer",
    icon: PlusCircle,
    primary: true,
    bar: true,
    top: true,
  },
  { href: "/agent/verification", label: "À vérifier", icon: ClipboardCheck, bar: true, top: true },
  { href: "/agent/alertes", label: "Alertes", icon: BellRing, top: true },
  { href: "/agent/signalements", label: "Signalements", icon: Bug, top: true },
  { href: "/agent/demandes", label: "Demandes", icon: LifeBuoy, top: true },
  { href: "/agent/sondage", label: "Points d'enquête", icon: MapPinned },
  { href: "/agent/tableau-de-bord", label: "Tableau de bord", icon: BarChart3 },
  { href: "/agent/assistant", label: "Assistant", icon: MessageCircleQuestion },
  { href: "/agent/synchronisation", label: "Synchronisation", icon: RefreshCw },
];

// Coque de l'espace agent : navigation de l'espace (onglets sur ordinateur, barre basse sous le
// pouce sur téléphone, docs/modules/registre-parcours-ux.md §0) et puce de synchronisation
// toujours visible.
export function AgentShell({ userId, demo = false, children }: AgentShellProps) {
  const sync = useSync(userId);
  const feedback = useFeedbackAction();

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-3">
        <SpaceNav label="Espace agent" items={NAV} actions={[feedback.action]} />
        {feedback.dialog}
        <div className="flex items-center gap-2 self-start">
          <SyncStatusChip
            pending={sync.pending}
            failed={sync.failed}
            lastSyncedAt={sync.lastSyncedAt}
            online={sync.online}
            syncing={sync.syncing}
            onSync={() => void sync.sync()}
          />
          <Link
            href="/agent/synchronisation"
            className="inline-flex min-h-11 items-center text-sm text-primary underline-offset-4 hover:underline md:hidden"
          >
            Voir la file
          </Link>
        </div>
      </div>

      <Suspense fallback={null}>
        <GuidedTour role="agent" userId={userId} demo={demo} />
      </Suspense>

      {children}
    </div>
  );
}
