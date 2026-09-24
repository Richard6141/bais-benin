import Link from "next/link";
import { Monogram } from "@/components/brand/monogram";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Monogram />
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">BAIS</span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Bénin Agricultural Intelligence System
            </span>
          </span>
        </Link>
        <nav aria-label="Navigation principale" className="flex items-center gap-1 text-sm">
          <span className="rounded-full border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
            Prototype · étape 0
          </span>
        </nav>
      </div>
    </header>
  );
}
