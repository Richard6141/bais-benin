import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DemoRow, DemoSection } from "@/features/design-system/demo-section";

export function OverlaysSection() {
  return (
    <DemoSection
      id="superpositions"
      title="Fenêtres et menus"
      description="Modale pour les confirmations, feuille latérale pour le détail sur mobile, menus pour les actions secondaires."
    >
      <DemoRow label="Modale">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="destructive">Archiver l&apos;exploitation</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Archiver cette exploitation ?</DialogTitle>
              <DialogDescription>
                L&apos;exploitation BJ-DON-002-000123 ne sera plus visible dans le registre actif.
                Son historique et ses déclarations restent conservés et consultables.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Annuler</Button>
              </DialogClose>
              <DialogClose asChild>
                <Button variant="destructive">Archiver</Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DemoRow>

      <DemoRow label="Feuille latérale (détail sur mobile)">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline">Voir le détail de la parcelle</Button>
          </SheetTrigger>
          <SheetContent>
            <SheetHeader>
              <SheetTitle>Parcelle P-02 · 1,8 ha</SheetTitle>
              <SheetDescription>
                Maïs, campagne 2025-2026, relevé GPS du 12 septembre 2026 (précision 4 m).
              </SheetDescription>
            </SheetHeader>
          </SheetContent>
        </Sheet>
      </DemoRow>

      <DemoRow label="Menu déroulant">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              Actions
              <ChevronDown aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Exploitation</DropdownMenuLabel>
            <DropdownMenuItem>Modifier</DropdownMenuItem>
            <DropdownMenuItem>Ajouter une parcelle</DropdownMenuItem>
            <DropdownMenuItem>Planifier une visite</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Archiver</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </DemoRow>

      <DemoRow label="Info-bulle et popover">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Précision du relevé GPS">
              <Info aria-hidden />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Précision du relevé GPS : 4 m</TooltipContent>
        </Tooltip>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline">Provenance de la donnée</Button>
          </PopoverTrigger>
          <PopoverContent className="text-sm">
            <p className="font-medium">Source : ATDA terrain</p>
            <p className="mt-1 text-muted-foreground">
              Relevé par l&apos;agent A. Sossou le 12 septembre 2026, vérifié sur place.
            </p>
          </PopoverContent>
        </Popover>
      </DemoRow>
    </DemoSection>
  );
}
