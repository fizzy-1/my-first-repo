"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import type { ActionState } from "@/server/action";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Field } from "./fields";
import type { FieldDef, FormValues } from "./types";

export type FormServerAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

export interface EntityFormProps {
  action: FormServerAction;
  fields: FieldDef[];
  defaultValues?: FormValues;
  submitLabel?: string;
  /** "dialog" renders a scrolling body + sticky footer; "inline" a plain form. */
  layout?: "dialog" | "inline";
  onSuccess?: (state: NonNullable<ActionState>) => void;
  onCancel?: () => void;
  /** Navigate after success; "{id}" is replaced with the created record id. */
  successHref?: string;
  className?: string;
  /** Reset fields after a successful inline submission (e.g. comment boxes). */
  resetOnSuccess?: boolean;
}

export function EntityForm({
  action,
  fields,
  defaultValues = {},
  submitLabel = "Save",
  layout = "inline",
  onSuccess,
  onCancel,
  successHref,
  className,
  resetOnSuccess,
}: EntityFormProps) {
  const router = useRouter();
  const formId = React.useId();
  const [state, formAction, pending] = React.useActionState(action, null);
  const [version, setVersion] = React.useState(0);
  const [seenState, setSeenState] = React.useState<ActionState>(null);
  const lastHandled = React.useRef<ActionState>(null);

  // Remount fields after a failed submit so they pick up the echoed values
  // (React resets uncontrolled forms after an action), or after success when asked.
  if (state !== seenState) {
    setSeenState(state);
    if (state && (!state.ok || resetOnSuccess)) setVersion((v) => v + 1);
  }

  React.useEffect(() => {
    if (!state || state === lastHandled.current) return;
    lastHandled.current = state;
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess?.(state);
      if (successHref) router.push(successHref.replace("{id}", state.id ?? ""));
    } else {
      toast.error(state.message ?? "Please check the form.");
    }
  }, [state, onSuccess, successHref, router]);

  const values: FormValues = state && !state.ok && state.values ? { ...defaultValues, ...state.values } : defaultValues;
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const grid = (
    <div key={version} className="grid gap-4 sm:grid-cols-2">
      {fields.map((field) => (
        <Field
          key={field.name}
          field={field}
          formId={formId}
          value={field.type === "hidden" || field.type === "heading" ? undefined : values[field.name]}
          errors={fieldErrors?.[field.name]}
        />
      ))}
    </div>
  );

  const submit = (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2Icon className="animate-spin" />}
      {submitLabel}
    </Button>
  );

  if (layout === "dialog") {
    return (
      <form action={formAction} className={cn("flex min-h-0 flex-1 flex-col", className)} noValidate>
        <DialogBody>{grid}</DialogBody>
        <DialogFooter>
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
              Cancel
            </Button>
          )}
          {submit}
        </DialogFooter>
      </form>
    );
  }

  return (
    <form action={formAction} className={cn("flex flex-col gap-4", className)} noValidate>
      {grid}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={pending}>
            Cancel
          </Button>
        )}
        {submit}
      </div>
    </form>
  );
}
