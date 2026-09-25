"use client";

import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { sortRows, type SortDirection, type SortValue } from "@/lib/sort";
import { cn } from "@/lib/utils";

export interface SortableColumn {
  key: string;
  label: string;
  align?: "left" | "right";
  /** Faux pour une colonne descriptive (ZAE) : pas de bouton de tri. */
  sortable?: boolean;
}

export interface SortableCell {
  display: ReactNode;
  /** Valeur de tri ; null (masquée ou absente) reste en bas dans les deux sens. */
  sort: SortValue;
}

export interface SortableRow {
  key: string;
  /** Lien porté par la première colonne (descente département, commune). */
  href?: string;
  /** Ligne grisée : commune sans exploitation. */
  muted?: boolean;
  cells: Record<string, SortableCell>;
}

interface SortableTableProps {
  caption: string;
  columns: readonly SortableColumn[];
  rows: readonly SortableRow[];
  /** Ligne de total (« Bénin »), jamais triée ni classée. */
  footer?: SortableRow;
  initialSort?: { key: string; direction: SortDirection };
  /** Ajoute une colonne « Rang » recalculée selon le tri courant. */
  ranked?: boolean;
  className?: string;
}

const ARIA_LABELS: Record<SortDirection, string> = {
  ascending: "croissant",
  descending: "décroissant",
};

// Tableau triable accessible : chaque en-tête triable est un bouton, l'en-tête actif porte
// aria-sort, et le sens courant est dit en toutes lettres aux lecteurs d'écran. Les valeurs
// masquées par le secret statistique ne se classent pas : elles restent en bas.
export function SortableTable({
  caption,
  columns,
  rows,
  footer,
  initialSort,
  ranked = false,
  className,
}: SortableTableProps) {
  const [sort, setSort] = useState(initialSort ?? null);
  const sorted = useMemo(
    () =>
      sort ? sortRows(rows, (row) => row.cells[sort.key]?.sort ?? null, sort.direction) : [...rows],
    [rows, sort],
  );

  function toggle(key: string) {
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === "descending" ? "ascending" : "descending" }
        : // Premier clic : les plus grands d'abord, la lecture la plus fréquente d'un classement.
          { key, direction: "descending" },
    );
  }

  const alignClass = (column: SortableColumn) => (column.align === "right" ? "text-right" : "");

  const renderRow = (row: SortableRow, rank: number | null) => (
    <TableRow key={row.key} className={cn(row.muted && "text-muted-foreground")}>
      {ranked ? (
        <TableCell className="tabular w-12 text-muted-foreground">{rank ?? ""}</TableCell>
      ) : null}
      {columns.map((column, index) => {
        const cell = row.cells[column.key];
        const content =
          index === 0 && row.href ? (
            <Link
              href={row.href as Route}
              className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline"
            >
              {cell?.display}
            </Link>
          ) : (
            cell?.display
          );
        return (
          <TableCell key={column.key} className={cn("tabular", alignClass(column))}>
            {content}
          </TableCell>
        );
      })}
    </TableRow>
  );

  return (
    <Table className={className}>
      <TableCaption className="sr-only">
        {caption}
        {sort
          ? `, trié par ${columns.find((c) => c.key === sort.key)?.label ?? sort.key}, ordre ${ARIA_LABELS[sort.direction]}`
          : ""}
      </TableCaption>
      <TableHeader>
        <TableRow>
          {ranked ? <TableHead className="w-12">Rang</TableHead> : null}
          {columns.map((column) => {
            const active = sort?.key === column.key;
            const Icon = !active
              ? ArrowUpDown
              : sort.direction === "ascending"
                ? ArrowUp
                : ArrowDown;
            return (
              <TableHead
                key={column.key}
                aria-sort={active ? sort.direction : column.sortable === false ? undefined : "none"}
                className={alignClass(column)}
              >
                {column.sortable === false ? (
                  column.label
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={cn(
                      "inline-flex min-h-11 items-center gap-1 rounded-sm font-medium hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      column.align === "right" && "flex-row-reverse",
                    )}
                  >
                    {column.label}
                    <Icon
                      className={cn("size-3.5", !active && "text-muted-foreground")}
                      aria-hidden
                    />
                  </button>
                )}
              </TableHead>
            );
          })}
        </TableRow>
      </TableHeader>
      <TableBody>
        {sorted.map((row, index) => {
          // Rang : seulement pour une ligne classable sur la colonne triée.
          const classable = sort ? row.cells[sort.key]?.sort !== null : true;
          return renderRow(row, ranked && sort && classable ? index + 1 : null);
        })}
      </TableBody>
      {footer ? <TableFooter>{renderRow(footer, null)}</TableFooter> : null}
    </Table>
  );
}
