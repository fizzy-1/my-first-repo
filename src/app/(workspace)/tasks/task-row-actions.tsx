"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLinkIcon, MoreHorizontalIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { deleteTaskAction, updateTaskAction } from "@/server/actions/tasks";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmContent, useServerAction } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";
import type { FieldDef, FormValues } from "@/components/forms/types";

export function TaskRowActions({
  task,
  canManage,
  canDelete,
  fields,
  defaults,
}: {
  task: { id: string; number: number; title: string };
  canManage: boolean;
  canDelete: boolean;
  fields: FieldDef[];
  defaults: FormValues;
}) {
  const [editOpen, setEditOpen] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { run } = useServerAction(deleteTaskAction);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={`Actions for task #${task.number}`}>
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={`/tasks/${task.id}`}>
              <ExternalLinkIcon /> Open
            </Link>
          </DropdownMenuItem>
          {canManage && (
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <PencilIcon /> Edit
            </DropdownMenuItem>
          )}
          {canDelete && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem destructive onSelect={() => setConfirmOpen(true)}>
                <Trash2Icon /> Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {canManage && (
        <FormDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          title={`Edit task #${task.number}`}
          action={updateTaskAction}
          fields={[{ type: "hidden", name: "id", value: task.id }, ...fields]}
          defaultValues={defaults}
          submitLabel="Save changes"
        />
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <ConfirmContent
          title={`Delete task #${task.number}?`}
          description={`“${task.title}” will be permanently deleted. This is recorded in the audit log and cannot be undone.`}
          confirmLabel="Delete task"
          onConfirm={() => run({ id: task.id })}
        />
      </AlertDialog>
    </>
  );
}
