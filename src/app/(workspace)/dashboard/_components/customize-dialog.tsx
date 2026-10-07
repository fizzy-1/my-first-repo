"use client";

import * as React from "react";
import { ArrowDownIcon, ArrowUpIcon, LayoutGridIcon, Loader2Icon } from "lucide-react";
import { toast } from "sonner";
import { saveDashboardPreferencesAction } from "@/server/actions/dashboard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export function CustomizeDialog({
  widgets,
  order,
  hidden,
}: {
  widgets: { id: string; label: string; available: boolean }[];
  order: string[];
  hidden: string[];
}) {
  const [open, setOpen] = React.useState(false);
  const [items, setItems] = React.useState(order);
  const [hiddenSet, setHiddenSet] = React.useState(new Set(hidden));
  const [pending, startTransition] = React.useTransition();
  const labels = new Map(widgets.map((w) => [w.id, w]));

  const onOpenChange = (next: boolean) => {
    if (next) {
      setItems(order);
      setHiddenSet(new Set(hidden));
    }
    setOpen(next);
  };

  const move = (index: number, delta: number) =>
    setItems((list) => {
      const next = [...list];
      const target = index + delta;
      if (target < 0 || target >= next.length) return list;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const result = await saveDashboardPreferencesAction({ order: items, hidden: [...hiddenSet] });
      if (result?.ok) {
        toast.success("Dashboard layout saved");
        setOpen(false);
      } else toast.error(result?.message ?? "Could not save layout");
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <LayoutGridIcon /> Customise
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Customise dashboard</DialogTitle>
          <DialogDescription>Reorder or hide widgets. Your layout is saved to your account.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <ul className="space-y-1.5">
            {items.map((id, index) => {
              const w = labels.get(id);
              if (!w) return null;
              return (
                <li key={id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                  <Switch
                    checked={!hiddenSet.has(id)}
                    onCheckedChange={(checked) =>
                      setHiddenSet((s) => {
                        const next = new Set(s);
                        if (checked) next.delete(id);
                        else next.add(id);
                        return next;
                      })
                    }
                    aria-label={`Show ${w.label}`}
                  />
                  <span className="flex-1 text-sm">
                    {w.label}
                    {!w.available && <span className="ml-1 text-xs text-muted-foreground">(not available for your role)</span>}
                  </span>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${w.label} up`}>
                    <ArrowUpIcon />
                  </Button>
                  <Button variant="ghost" size="icon-sm" onClick={() => move(index, 1)} disabled={index === items.length - 1} aria-label={`Move ${w.label} down`}>
                    <ArrowDownIcon />
                  </Button>
                </li>
              );
            })}
          </ul>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2Icon className="animate-spin" />} Save layout
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
