"use client";

import { ChevronDown, Ellipsis, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LAST_SPACE_KEY } from "@/components/feedback/offline-space-links";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface SpaceNavItem {
  href: Route;
  label: string;
  /** Libellé plus court pour la barre basse, quand le libellé complet n'y tient pas. */
  short?: string;
  icon: LucideIcon;
  /** Actif seulement sur l'adresse exacte (accueil de l'espace). */
  exact?: boolean;
  /** Autres débuts d'adresse qui activent l'entrée (une fiche sous sa liste). */
  match?: readonly string[];
  /** Dans la barre basse du téléphone (quatre au plus : la cinquième case est « Plus »). */
  bar?: boolean;
  /** Dans les onglets du haut sur ordinateur ; sinon dans le menu « Plus ». */
  top?: boolean;
  /** Action principale de l'espace : pastille pleine dans la barre basse. */
  primary?: boolean;
}

export function isActiveItem(pathname: string, item: SpaceNavItem): boolean {
  if (item.exact) return pathname === item.href;
  return [item.href, ...(item.match ?? [])].some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

interface SpaceNavProps {
  /** Nom de l'espace pour les lecteurs d'écran (« Espace agent »). */
  label: string;
  items: readonly SpaceNavItem[];
}

// Navigation d'un espace connecté, la même pour l'agent et le producteur. Sur ordinateur, des
// onglets en tête de page, les rubriques rares dans « Plus ». Sur téléphone, une barre basse de
// cinq cases sous le pouce : quatre rubriques, puis « Plus », qui ouvre toutes les autres dans un
// panneau montant du bas. Aucune rubrique n'est hors d'atteinte, sur aucun écran.
export function SpaceNav({ label, items }: SpaceNavProps) {
  const pathname = usePathname();
  const [sheetOpen, setSheetOpen] = useState(false);
  const top = items.filter((item) => item.top);
  const topMore = items.filter((item) => !item.top);
  const bar = items.filter((item) => item.bar).slice(0, 4);
  const barMore = items.filter((item) => !bar.includes(item));
  const topMoreActive = topMore.some((item) => isActiveItem(pathname, item));
  const barMoreActive = barMore.some((item) => isActiveItem(pathname, item));
  const home = (items.find((item) => item.exact) ?? items[0])?.href;

  // Repère local de l'espace ouvert en dernier : la page hors connexion, servie sans session,
  // s'en sert pour ne proposer que cet espace.
  useEffect(() => {
    if (!home) return;
    try {
      window.localStorage.setItem(LAST_SPACE_KEY, home);
    } catch {
      // Stockage bloqué (navigation privée) : la page hors connexion proposera les deux espaces.
    }
  }, [home]);

  return (
    <>
      <nav aria-label={label} className="hidden md:block print:hidden">
        <ul className="flex border-b">
          {top.map((item) => {
            const active = isActiveItem(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "-mb-px inline-flex h-11 items-center border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
          {topMore.length > 0 ? (
            <li className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger
                  className={cn(
                    "-mb-px inline-flex h-11 items-center gap-1 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    topMoreActive
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground",
                  )}
                >
                  Plus
                  <ChevronDown className="size-4" aria-hidden />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  {topMore.map((item) => (
                    <DropdownMenuItem key={item.href} asChild>
                      <Link
                        href={item.href}
                        aria-current={isActiveItem(pathname, item) ? "page" : undefined}
                        className="flex min-h-10 items-center gap-3 aria-[current=page]:font-semibold aria-[current=page]:text-primary"
                      >
                        <item.icon className="size-4" aria-hidden />
                        {item.label}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ) : null}
        </ul>
      </nav>

      <nav
        aria-label={label}
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden print:hidden"
      >
        <ul className="grid grid-cols-5">
          {bar.map((item) => (
            <li key={item.href}>
              <BarLink item={item} active={isActiveItem(pathname, item)} />
            </li>
          ))}
          <li>
            <button
              type="button"
              aria-haspopup="dialog"
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen(true)}
              className={cn(
                "flex min-h-16 w-full flex-col items-center justify-center gap-1 px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[11px] font-medium",
                barMoreActive ? "text-primary" : "text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-9 items-center justify-center rounded-full",
                  barMoreActive && "bg-accent",
                )}
              >
                <Ellipsis className="size-5" aria-hidden />
              </span>
              Plus
            </button>
          </li>
        </ul>
      </nav>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="max-h-[85svh] rounded-t-lg md:hidden">
          <SheetHeader className="border-b">
            <SheetTitle>Toutes les rubriques</SheetTitle>
            <SheetDescription className="sr-only">{label}</SheetDescription>
          </SheetHeader>
          <ul className="flex flex-col overflow-y-auto px-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            {barMore.map((item) => {
              const active = isActiveItem(pathname, item);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex min-h-12 items-center gap-3 rounded-sm px-3 text-base",
                      active ? "bg-accent font-semibold text-primary" : "hover:bg-muted",
                    )}
                  >
                    <item.icon className="size-5 text-muted-foreground" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}

function BarLink({ item, active }: { item: SpaceNavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1 px-1 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] text-[11px] font-medium",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-9 items-center justify-center rounded-full",
          item.primary ? "bg-primary text-primary-foreground" : active ? "bg-accent" : "",
        )}
      >
        <item.icon className="size-5" aria-hidden />
      </span>
      <span className="text-center leading-tight">{item.short ?? item.label}</span>
    </Link>
  );
}
