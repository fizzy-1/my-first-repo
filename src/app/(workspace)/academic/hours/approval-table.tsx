"use client";

import * as React from "react";
import { CheckIcon, XIcon } from "lucide-react";
import { decideTimeEntriesAction } from "@/server/actions/academic";
import { useServerAction } from "@/components/forms/action-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TUTOR_ACTIVITY } from "@/lib/labels";

export interface PendingEntry {
  id: string;
  tutor: string;
  date: string;
  hours: number;
  activity: keyof typeof TUTOR_ACTIVITY;
  description: string | null;
  content: string | null;
}

export function ApprovalTable({ entries }: { entries: PendingEntry[] }) {
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const { run, pending } = useServerAction(decideTimeEntriesAction);
  const all = entries.length > 0 && selected.size === entries.length;
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const decide = (status: "APPROVED" | "REJECTED") => run({ ids: [...selected], status }, { onSuccess: () => setSelected(new Set()) });
  const hours = entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.hours, 0);

  if (entries.length === 0) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">No hours awaiting approval.</p>;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3">
        <span className="text-sm text-muted-foreground">{selected.size ? `${selected.size} selected · ${hours}h` : "Select entries to approve or reject"}</span>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" disabled={!selected.size || pending} onClick={() => decide("REJECTED")}>
            <XIcon /> Reject
          </Button>
          <Button size="sm" disabled={!selected.size || pending} onClick={() => decide("APPROVED")}>
            <CheckIcon /> Approve
          </Button>
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-10">
              <Checkbox checked={all} onCheckedChange={(c) => setSelected(c ? new Set(entries.map((e) => e.id)) : new Set())} aria-label="Select all" />
            </TableHead>
            <TableHead>Tutor</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Activity</TableHead>
            <TableHead className="hidden md:table-cell">Details</TableHead>
            <TableHead className="text-right">Hours</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((e) => (
            <TableRow key={e.id} data-state={selected.has(e.id) ? "selected" : undefined} className="data-[state=selected]:bg-primary-soft/40">
              <TableCell>
                <Checkbox checked={selected.has(e.id)} onCheckedChange={() => toggle(e.id)} aria-label={`Select ${e.tutor} ${e.date}`} />
              </TableCell>
              <TableCell className="font-medium">{e.tutor}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">{e.date}</TableCell>
              <TableCell>
                <Badge tone={TUTOR_ACTIVITY[e.activity].tone}>{TUTOR_ACTIVITY[e.activity].label}</Badge>
              </TableCell>
              <TableCell className="hidden max-w-80 truncate text-xs text-muted-foreground md:table-cell">{e.content ?? e.description ?? "—"}</TableCell>
              <TableCell className="tabular text-right font-medium">{e.hours}h</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
