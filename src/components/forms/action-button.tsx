"use client";

import * as React from "react";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/server/action";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button, type ButtonProps } from "@/components/ui/button";

type ArgServerAction<I> = (input: I) => Promise<ActionState>;

/** Runs an argument-style Server Action and reports the outcome as a toast. */
export function useServerAction<I>(action: ArgServerAction<I>) {
  const [pending, startTransition] = React.useTransition();
  const run = React.useCallback(
    (input: I, opts?: { onSuccess?: (state: NonNullable<ActionState>) => void; silent?: boolean }) => {
      startTransition(async () => {
        const state = await action(input);
        if (state?.ok) {
          if (state.message && !opts?.silent) toast.success(state.message);
          opts?.onSuccess?.(state);
        } else {
          toast.error(state?.message ?? "Something went wrong.");
        }
      });
    },
    [action],
  );
  return { run, pending };
}

export function ActionButton<I>({
  action,
  input,
  children,
  ...buttonProps
}: { action: ArgServerAction<I>; input: I } & Omit<ButtonProps, "onClick">) {
  const { run, pending } = useServerAction(action);
  return (
    <Button {...buttonProps} disabled={pending || buttonProps.disabled} onClick={() => run(input)}>
      {pending && <Loader2Icon className="animate-spin" />}
      {children}
    </Button>
  );
}

/** A button that asks for confirmation before running a (typically destructive) action. */
export function ConfirmActionButton<I>({
  action,
  input,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  children,
  ...buttonProps
}: {
  action: ArgServerAction<I>;
  input: I;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
} & Omit<ButtonProps, "onClick">) {
  const { run, pending } = useServerAction(action);
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps} disabled={pending || buttonProps.disabled}>
          {pending && <Loader2Icon className="animate-spin" />}
          {children}
        </Button>
      </AlertDialogTrigger>
      <ConfirmContent
        title={title}
        description={description}
        confirmLabel={confirmLabel}
        destructive={destructive}
        onConfirm={() => run(input)}
      />
    </AlertDialog>
  );
}

export function ConfirmContent({
  title,
  description,
  confirmLabel = "Confirm",
  destructive = true,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction destructive={destructive} onClick={onConfirm}>
          {confirmLabel}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}
