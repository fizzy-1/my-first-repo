"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronRightIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatDateTime, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { moduleLabel } from "../sections";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

export interface AuditRow {
  id: string;
  createdAt: Date;
  action: string;
  module: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  before: unknown;
  after: unknown;
  ipAddress: string | null;
  actor: { id: string; name: string; email: string } | null;
}

function isRecord(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "mustChangePassword" → "Must change password". */
function fieldLabel(key: string): string {
  const words = key.replace(/_/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

function DiffValue({ value }: { value: Json | undefined }) {
  if (value === undefined || value === null || value === "") return <span className="text-muted-foreground italic">empty</span>;
  if (typeof value === "boolean") return <>{value ? "Yes" : "No"}</>;
  if (typeof value === "number") return <span className="tabular">{value.toLocaleString("en-US")}</span>;
  if (typeof value === "string") {
    if (ISO_INSTANT.test(value)) {
      // Calendar dates (@db.Date) are stored as UTC midnight; show them without a time.
      return <span title={value}>{value.endsWith("T00:00:00.000Z") ? formatDate(value) : formatDateTime(value)}</span>;
    }
    return <span className="break-words whitespace-pre-wrap">{value}</span>;
  }
  if (Array.isArray(value) && value.every((v) => typeof v !== "object" || v === null)) {
    return value.length ? <>{value.map((v) => String(v)).join(", ")}</> : <span className="text-muted-foreground italic">none</span>;
  }
  return <code className="font-mono text-xs break-all whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</code>;
}

/** Field-by-field view of an entry's before/after snapshots. */
function AuditDiff({ before, after }: { before: unknown; after: unknown }) {
  const b = isRecord(before) ? before : null;
  const a = isRecord(after) ? after : null;
  if (!b && !a) return <p className="self-start text-[13px] text-muted-foreground">No field values were recorded for this entry.</p>;
  const keys = [...new Set([...Object.keys(b ?? {}), ...Object.keys(a ?? {})])];
  const twoSided = Boolean(b && a);
  return (
    <div className="self-start overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-1/4 px-3 py-2 text-left font-medium">Field</th>
            {(twoSided || b) && <th className="px-3 py-2 text-left font-medium">{twoSided ? "Previous value" : "Value before"}</th>}
            {(twoSided || a) && <th className="px-3 py-2 text-left font-medium">{twoSided ? "New value" : "Recorded value"}</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {keys.map((key) => (
            <tr key={key} className="align-top">
              <td className="px-3 py-2 text-muted-foreground">{fieldLabel(key)}</td>
              {b && (
                <td className={cn("px-3 py-2", twoSided && "text-muted-foreground line-through decoration-muted-foreground/50")}>
                  <DiffValue value={b[key]} />
                </td>
              )}
              {a && (
                <td className={cn("px-3 py-2", twoSided && "font-medium")}>
                  <DiffValue value={a[key]} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AuditEntry({ row }: { row: AuditRow }) {
  const [open, setOpen] = React.useState(false);
  const detailsId = `audit-${row.id}`;
  return (
    <>
      <TableRow className={cn("cursor-pointer", open && "bg-subtle")} onClick={() => setOpen((o) => !o)}>
        <TableCell className="w-10 pr-0">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            aria-label={open ? "Hide details" : "Show details"}
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronRightIcon className={cn("size-4 transition-transform", open && "rotate-90")} />
          </button>
        </TableCell>
        <TableCell className="whitespace-nowrap">
          <p className="tabular text-[13px]">{formatDate(row.createdAt)}</p>
          <p className="tabular text-xs text-muted-foreground">{formatTime(row.createdAt)}</p>
        </TableCell>
        <TableCell className="hidden md:table-cell">
          {row.actor ? <span className="whitespace-nowrap">{row.actor.name}</span> : <span className="text-muted-foreground">System</span>}
        </TableCell>
        <TableCell className="hidden lg:table-cell">
          <Badge tone="neutral">{moduleLabel(row.module)}</Badge>
        </TableCell>
        <TableCell className="hidden xl:table-cell">
          <code className="font-mono text-xs text-muted-foreground">{row.action}</code>
        </TableCell>
        <TableCell>
          <p className="min-w-48 text-[13px]">{row.summary}</p>
          <p className="mt-0.5 text-xs text-muted-foreground md:hidden">
            {row.actor?.name ?? "System"} · {moduleLabel(row.module)}
          </p>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={detailsId} className="bg-subtle hover:bg-subtle">
          <TableCell colSpan={6} className="pt-1 pb-4">
            <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-xs">
                <dt className="text-muted-foreground">When</dt>
                <dd className="tabular" title={new Date(row.createdAt).toISOString()}>
                  {formatDateTime(row.createdAt)} SAST
                </dd>
                <dt className="text-muted-foreground">By</dt>
                <dd className="break-all">{row.actor ? `${row.actor.name} (${row.actor.email})` : "System"}</dd>
                <dt className="text-muted-foreground">Action</dt>
                <dd className="font-mono break-all">{row.action}</dd>
                <dt className="text-muted-foreground">Record</dt>
                <dd className="break-all">
                  {row.entityType}
                  {row.entityId && (
                    <>
                      {" · "}
                      <Link
                        href={`/admin/audit?entityType=${encodeURIComponent(row.entityType)}&entityId=${encodeURIComponent(row.entityId)}`}
                        className="font-mono text-primary-soft-foreground hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {row.entityId}
                      </Link>
                    </>
                  )}
                </dd>
                <dt className="text-muted-foreground">IP address</dt>
                <dd className="font-mono">{row.ipAddress ?? "—"}</dd>
              </dl>
              <AuditDiff before={row.before} after={row.after} />
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/** Audit entries with click-to-expand rows showing the recorded before/after values. */
export function AuditTable({ rows, sortHref, dir, empty }: { rows: AuditRow[]; sortHref: string; dir: "asc" | "desc"; empty: React.ReactNode }) {
  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="w-10 pr-0">
            <span className="sr-only">Details</span>
          </TableHead>
          <TableHead aria-sort={dir === "asc" ? "ascending" : "descending"}>
            <Link href={sortHref} scroll={false} className="inline-flex items-center gap-1 text-foreground hover:text-foreground">
              When {dir === "asc" ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
            </Link>
          </TableHead>
          <TableHead className="hidden md:table-cell">User</TableHead>
          <TableHead className="hidden lg:table-cell">Module</TableHead>
          <TableHead className="hidden xl:table-cell">Action</TableHead>
          <TableHead>Summary</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={6} className="p-0">
              {empty}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => <AuditEntry key={row.id} row={row} />)
        )}
      </TableBody>
    </Table>
  );
}
