import { UserRound } from "lucide-react";
import Link from "next/link";
import { MinistryLockup } from "@/components/brand/ministry-lockup";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { SignOutButton } from "@/features/auth/sign-out-button";
import type { RoleCode } from "@/modules/authorization";

const SPACE_LABELS: Record<RoleCode, string> = {
  ADMIN_STATE: "Centre de pilotage du ministère",
  AGENT_AGRICULTURE: "Espace agent de terrain",
  FARMER: "Espace agriculteur",
  COOPERATIVE: "Espace coopérative",
  BUYER: "Espace acheteur",
};

interface SpaceHeaderProps {
  user: { name: string; primaryRole: RoleCode | null };
}

// En-tête des espaces connectés : identité du ministère sur la bande blanche, puis une barre
// marine qui dit dans quel espace on se trouve et donne accès au compte et à la déconnexion.
export function SpaceHeader({ user }: SpaceHeaderProps) {
  return (
    <header className="print:hidden">
      <div className="border-b bg-background">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6">
          <Link href="/" className="rounded-sm focus-visible:ring-2 focus-visible:ring-ring">
            <MinistryLockup compact />
            <span className="sr-only"> — Accueil de la plateforme</span>
          </Link>
          <ThemeToggle />
        </div>
      </div>
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto flex h-11 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <p className="truncate text-xs font-semibold tracking-wide uppercase">
            {user.primaryRole ? SPACE_LABELS[user.primaryRole] : "Mon compte"}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <Link
              href="/compte"
              className="inline-flex h-9 items-center gap-2 rounded-sm px-2 text-sm font-medium hover:bg-white/10 focus-visible:bg-white/15 focus-visible:outline-none"
            >
              <UserRound className="size-4" aria-hidden />
              <span className="hidden max-w-48 truncate sm:inline">{user.name}</span>
              <span className="sm:hidden">Compte</span>
            </Link>
            <SignOutButton className="hidden text-primary-foreground hover:bg-white/10 hover:text-primary-foreground sm:inline-flex" />
          </div>
        </div>
      </div>
    </header>
  );
}
