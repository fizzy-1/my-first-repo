"use client";

import { useRouter } from "next/navigation";
import { Loader2Icon, Trash2Icon } from "lucide-react";
import { deleteObjectiveAction } from "@/server/actions/strategy";
import { ConfirmContent, useServerAction } from "@/components/forms/action-button";
import { AlertDialog, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

/** Confirmed delete that returns to the strategy page (the objective page no longer exists afterwards). */
export function DeleteObjectiveButton({ id, title, description, returnTo }: { id: string; title: string; description: string; returnTo: string }) {
  const router = useRouter();
  const { run, pending } = useServerAction(deleteObjectiveAction);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Delete objective" disabled={pending}>
          {pending ? <Loader2Icon className="animate-spin" /> : <Trash2Icon />}
        </Button>
      </AlertDialogTrigger>
      <ConfirmContent
        title={title}
        description={description}
        confirmLabel="Delete"
        onConfirm={() => run({ id }, { onSuccess: () => router.replace(returnTo) })}
      />
    </AlertDialog>
  );
}
