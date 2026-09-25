"use client";

import {
  BarChart3,
  BellRing,
  ClipboardCheck,
  Home,
  LandPlot,
  MessageCircleQuestion,
  PlusCircle,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import { SyncStatusChip } from "@/components/forms/sync-status-chip";
import { useSync } from "@/lib/offline/use-sync";
import { cn } from "@/lib/utils";

interface AgentShellProps {
  userId: string;
  children: ReactNode;
}

const NAV = [
  { href: "/agent", label: "Accueil", icon: Home, exact: true },
  { href: "/agent/exploitations", label: "Exploitations", icon: LandPlot },
  { href: "/agent/enregistrer", label: "Enregistrer", icon: PlusCircle, primary: true },
  { href: "/agent/verification", label: "À vérifier", icon: ClipboardCheck },
  { href: "/agent/alertes", label: "Alertes", icon: BellRing },
  // Barre basse pleine (cinq entrées) : sur téléphone, le tableau de bord et l'assistant
  // s'ouvrent depuis l'accueil.
  { href: "/agent/tableau-de-bord", label: "Tableau de bord", icon: BarChart3, desktopOnly: true },
  { href: "/agent/assistant", label: "Assistant", icon: MessageCircleQuestion, desktopOnly: true },
  // Absent de la barre basse mobile : la puce de synchronisation, toujours visible en haut, y mène.
  { href: "/agent/synchronisation", label: "Synchro", icon: RefreshCw, desktopOnly: true },
] as const;

// Barre basse mobile : cinq entrées au plus. À 360 px, six cases de 60 px tronqueraient
// « Exploitations » et « À vérifier » ; la synchronisation reste à un tap via la puce.
const MOBILE_NAV = NAV.filter((item) => !("desktopOnly" in item && item.desktopOnly));

// Coque de l'espace agent : navigation en haut sur grand écran, en bas sur téléphone
// (le pouce reste en bas, docs/modules/registre-parcours-ux.md §0), et la puce de
// synchronisation toujours visible.
export function AgentShell({ userId, children }: AgentShellProps) {
  const pathname = usePathname();
  const sync = useSync(userId);

  function isActive(item: (typeof NAV)[number]) {
    return "exact" in item && item.exact ? pathname === item.href : pathname.startsWith(item.href);
  }

  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <div className="flex flex-col gap-3">
        {/* Navigation en onglets, en capitales, comme les barres des portails de l'administration :
            une ligne à elle seule, la puce de synchronisation en dessous, pour tenir les huit
            entrées sur une ligne dès 1024 px sans pictogrammes (ils restent dans la barre basse). */}
        <nav aria-label="Espace agent" className="hidden md:block">
          <ul className="flex flex-wrap border-b">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href as Route}
                  aria-current={isActive(item) ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase transition-colors",
                    isActive(item)
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
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

      {children}

      <nav
        aria-label="Espace agent"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {MOBILE_NAV.map((item) => {
            const active = isActive(item);
            const primary = "primary" in item && item.primary;
            return (
              <li key={item.href}>
                <Link
                  href={item.href as Route}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[11px] font-medium",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full",
                      primary ? "bg-primary text-primary-foreground" : active ? "bg-accent" : "",
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                  </span>
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
