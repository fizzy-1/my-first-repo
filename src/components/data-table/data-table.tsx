import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { buildHref, type ListParams, type SearchParams } from "@/lib/list-params";
import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Enables header sorting using this sort key. */
  sortKey?: string;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide below the md breakpoint to keep tables readable on phones. */
  hideOnMobile?: boolean;
}

/**
 * Server-rendered data table. Sorting and pagination are links that update the
 * query string; the page re-queries the database with the new parameters.
 */
export function DataTable<T extends { id: string }>({
  columns,
  rows,
  total,
  params,
  pathname,
  searchParams,
  empty,
  rowClassName,
}: {
  columns: Column<T>[];
  rows: T[];
  total: number;
  params: ListParams;
  pathname: string;
  searchParams: SearchParams;
  empty: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  const alignClass = (align?: Column<T>["align"]) =>
    align === "right" ? "text-right" : align === "center" ? "text-center" : undefined;

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {columns.map((col) => {
              const active = col.sortKey && params.sort === col.sortKey;
              const nextDir = active && params.dir === "desc" ? "asc" : "desc";
              return (
                <TableHead
                  key={col.key}
                  className={cn(alignClass(col.align), col.hideOnMobile && "hidden md:table-cell", col.className)}
                  aria-sort={active ? (params.dir === "asc" ? "ascending" : "descending") : undefined}
                >
                  {col.sortKey ? (
                    <Link
                      href={buildHref(pathname, searchParams, { sort: col.sortKey, dir: nextDir, page: undefined })}
                      className={cn(
                        "inline-flex items-center gap-1 hover:text-foreground",
                        col.align === "right" && "flex-row-reverse",
                        active && "text-foreground",
                      )}
                      scroll={false}
                    >
                      {col.header}
                      {active ? (
                        params.dir === "asc" ? (
                          <ArrowUpIcon className="size-3" />
                        ) : (
                          <ArrowDownIcon className="size-3" />
                        )
                      ) : (
                        <ArrowUpDownIcon className="size-3 opacity-40" />
                      )}
                    </Link>
                  ) : (
                    col.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={columns.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => (
              <TableRow key={row.id} className={rowClassName?.(row)}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(alignClass(col.align), col.hideOnMobile && "hidden md:table-cell", col.className)}
                  >
                    {col.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      <Pagination total={total} params={params} pathname={pathname} searchParams={searchParams} />
    </div>
  );
}

export function Pagination({
  total,
  params,
  pathname,
  searchParams,
}: {
  total: number;
  params: ListParams;
  pathname: string;
  searchParams: SearchParams;
}) {
  if (total === 0) return null;
  const pages = Math.max(1, Math.ceil(total / params.pageSize));
  const from = (params.page - 1) * params.pageSize + 1;
  const to = Math.min(total, params.page * params.pageSize);
  const link = (page: number) => buildHref(pathname, searchParams, { page: page === 1 ? undefined : page });
  const btn =
    "inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border px-2 text-xs font-medium transition-colors hover:bg-accent";

  const pageNumbers: (number | "…")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || Math.abs(p - params.page) <= 1) pageNumbers.push(p);
    else if (pageNumbers[pageNumbers.length - 1] !== "…") pageNumbers.push("…");
  }

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:flex-row">
      <p className="tabular">
        Showing {from}–{to} of {total.toLocaleString("en-US")}
      </p>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pagination">
          {params.page > 1 ? (
            <Link href={link(params.page - 1)} className={btn} aria-label="Previous page" scroll={false}>
              <ChevronLeftIcon className="size-3.5" />
            </Link>
          ) : (
            <span className={cn(btn, "pointer-events-none opacity-40")}>
              <ChevronLeftIcon className="size-3.5" />
            </span>
          )}
          {pageNumbers.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1">
                …
              </span>
            ) : (
              <Link
                key={p}
                href={link(p)}
                scroll={false}
                aria-current={p === params.page ? "page" : undefined}
                className={cn(btn, "tabular", p === params.page && "border-primary bg-primary text-primary-foreground hover:bg-primary")}
              >
                {p}
              </Link>
            ),
          )}
          {params.page < pages ? (
            <Link href={link(params.page + 1)} className={btn} aria-label="Next page" scroll={false}>
              <ChevronRightIcon className="size-3.5" />
            </Link>
          ) : (
            <span className={cn(btn, "pointer-events-none opacity-40")}>
              <ChevronRightIcon className="size-3.5" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
