import { AlertTriangleIcon, CalendarIcon } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Due date with an overdue / due-soon indicator (icon + text, not colour alone). */
export function DueDate({ date, done, now = new Date() }: { date: Date | null | undefined; done?: boolean; now?: Date }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const diffDays = (date.getTime() - now.getTime()) / 86_400_000;
  const overdue = !done && diffDays < 0;
  const soon = !done && !overdue && diffDays <= 3;
  return (
    <span
      className={cn(
        "tabular inline-flex items-center gap-1 whitespace-nowrap",
        overdue && "font-medium text-danger",
        soon && "text-warning",
      )}
      title={overdue ? "Overdue" : soon ? "Due soon" : undefined}
    >
      {overdue ? <AlertTriangleIcon className="size-3.5" aria-label="Overdue" /> : <CalendarIcon className="size-3.5 opacity-60" aria-hidden />}
      {formatDate(date)}
    </span>
  );
}
