"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArchiveIcon,
  BanknoteIcon,
  CheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  MoreHorizontalIcon,
  PencilIcon,
  PlayIcon,
  SendIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import type { ActionState } from "@/server/action";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmContent, useServerAction } from "./action-button";
import { FormDialog } from "./form-dialog";
import type { FormServerAction } from "./entity-form";
import type { FieldDef, FormValues } from "./types";

const ICONS = {
  check: CheckIcon,
  pencil: PencilIcon,
  trash: Trash2Icon,
  external: ExternalLinkIcon,
  send: SendIcon,
  banknote: BanknoteIcon,
  archive: ArchiveIcon,
  copy: CopyIcon,
  play: PlayIcon,
  x: XIcon,
} satisfies Record<string, LucideIcon>;

export type RowIcon = keyof typeof ICONS;

// Server actions accept a plain object; inputs here are serializable records.
type ArgAction = (input: never) => Promise<ActionState>;

export interface RowMenuItem {
  label: string;
  icon?: RowIcon;
  action: ArgAction;
  input: Record<string, unknown>;
  confirm?: { title: string; description: string; confirmLabel?: string; destructive?: boolean };
}

/**
 * Generic row actions menu. Every prop is serializable, so server components can
 * pass server actions + record data directly: open link, edit dialog, extra
 * actions (optionally confirmed) and a confirmed delete.
 */
export function RowMenu({
  label,
  href,
  edit,
  items = [],
  remove,
}: {
  label: string;
  href?: string;
  edit?: { title: string; action: FormServerAction; fields: FieldDef[]; defaults: FormValues; size?: "sm" | "md" | "lg" | "xl" };
  items?: RowMenuItem[];
  remove?: { action: ArgAction; input: Record<string, unknown>; title: string; description: string };
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState<RowMenuItem | null>(null);
  const runner = useServerAction((input: { action: ArgAction; payload: Record<string, unknown> }) =>
    (input.action as (i: Record<string, unknown>) => Promise<ActionState>)(input.payload),
  );

  const removeItem: RowMenuItem | null = remove
    ? { label: "Delete", icon: "trash", action: remove.action, input: remove.input, confirm: { title: remove.title, description: remove.description, confirmLabel: "Delete", destructive: true } }
    : null;

  const trigger = (item: RowMenuItem) => {
    if (item.confirm) setConfirming(item);
    else runner.run({ action: item.action, payload: item.input });
  };

  if (!href && !edit && items.length === 0 && !removeItem) return null;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`} disabled={runner.pending}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-48">
          {href && (
            <DropdownMenuItem asChild>
              <Link href={href}>
                <ExternalLinkIcon /> Open
              </Link>
            </DropdownMenuItem>
          )}
          {edit && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
          )}
          {items.map((item) => {
            const Icon = item.icon ? ICONS[item.icon] : null;
            return (
              <DropdownMenuItem key={item.label} onSelect={() => trigger(item)}>
                {Icon && <Icon />} {item.label}
              </DropdownMenuItem>
            );
          })}
          {removeItem && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => trigger(removeItem)}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {edit && (
        <FormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title={edit.title}
          size={edit.size}
          action={edit.action}
          fields={edit.fields}
          defaultValues={edit.defaults}
          submitLabel="Save changes"
        />
      )}
      <AlertDialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        {confirming?.confirm && (
          <ConfirmContent
            title={confirming.confirm.title}
            description={confirming.confirm.description}
            confirmLabel={confirming.confirm.confirmLabel}
            destructive={confirming.confirm.destructive ?? false}
            onConfirm={() => runner.run({ action: confirming.action, payload: confirming.input })}
          />
        )}
      </AlertDialog>
    </>
  );
}
