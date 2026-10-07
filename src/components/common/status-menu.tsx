"use client";

import * as React from "react";
import { ChevronDownIcon, Loader2Icon } from "lucide-react";
import type { ActionState } from "@/server/action";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useServerAction } from "@/components/forms/action-button";
import type { EnumMeta } from "@/lib/labels";

/**
 * Inline status badge that doubles as a menu to change the status.
 * Falls back to a plain badge when the user may not change it.
 */
export function StatusMenu<T extends string>({
  id,
  value,
  meta,
  options,
  action,
  disabled,
}: {
  id: string;
  value: T;
  meta: Record<T, EnumMeta>;
  options: readonly T[];
  action: (input: { id: string; status: T }) => Promise<ActionState>;
  disabled?: boolean;
}) {
  const { run, pending } = useServerAction(action);
  const entry = meta[value];
  const badge = (
    <Badge tone={entry.tone} className="cursor-pointer">
      <span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />
      {entry.label}
      {!disabled && (pending ? <Loader2Icon className="animate-spin" /> : <ChevronDownIcon className="opacity-60" />)}
    </Badge>
  );
  if (disabled) return <Badge tone={entry.tone}><span aria-hidden className="size-1.5 rounded-full bg-current opacity-80" />{entry.label}</Badge>;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/60" aria-label={`Status: ${entry.label}. Change status`}>
        {badge}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuRadioGroup value={value} onValueChange={(next) => next !== value && run({ id, status: next as T })}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option} value={option}>
              {meta[option].label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
