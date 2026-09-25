import { UserRound } from "lucide-react";
import Link from "next/link";
import { GovernmentEmblem } from "@/components/brand/government-emblem";
import { Monogram } from "@/components/brand/monogram";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SignOutButton } from "@/features/auth/sign-out-button";
import type { RoleCode } from "@/modules/authorization";

const ROLE_LABELS: Record<RoleCode, string> = {
  ADMIN_STATE: "Ministère",
  AGENT_AGRICULTURE: "Agent de terrain",
  FARMER: "Agriculteur",
  COOPERATIVE: "Coopérative",
  BUYER: "Acheteur",
};

interface SpaceHeaderProps {
  user: { name: string; primaryRole: RoleCode | null };
}

export function SpaceHeader({ user }: SpaceHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <GovernmentEmblem className="hidden sm:inline-flex" />
          <Monogram />
          <span className="text-sm font-semibold tracking-tight">BAIS</span>
        </Link>
        <div className="flex items-center gap-2">
          {user.primaryRole ? (
            <Badge variant="secondary">{ROLE_LABELS[user.primaryRole]}</Badge>
          ) : null}
          <Button asChild variant="ghost" size="sm">
            <Link href="/compte">
              <UserRound aria-hidden />
              <span className="hidden sm:inline">{user.name}</span>
              <span className="sm:hidden">Compte</span>
            </Link>
          </Button>
          <SignOutButton className="hidden sm:inline-flex" />
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
