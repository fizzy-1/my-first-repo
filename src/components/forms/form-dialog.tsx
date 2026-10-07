"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EntityForm, type EntityFormProps } from "./entity-form";

interface FormDialogProps extends Omit<EntityFormProps, "layout" | "onCancel"> {
  title: string;
  description?: string;
  trigger?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Opens automatically when the URL contains ?new=<openParam> (used by Quick create). */
  openParam?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function FormDialog({
  title,
  description,
  trigger,
  size = "md",
  openParam,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
  ...formProps
}: FormDialogProps) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const shouldAutoOpen = Boolean(openParam && searchParams.get("new") === openParam);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(shouldAutoOpen);
  const open = controlledOpen ?? uncontrolledOpen;

  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onOpenChange?.(next);
    if (!next && shouldAutoOpen) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("new");
      router.replace(params.size ? `${pathname}?${params}` : pathname, { scroll: false });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent size={size}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && (
          <EntityForm
            {...formProps}
            layout="dialog"
            onCancel={() => setOpen(false)}
            onSuccess={(state) => {
              setOpen(false);
              onSuccess?.(state);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
