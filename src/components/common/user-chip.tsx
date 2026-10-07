import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

export function UserChip({ name, subtitle, className }: { name: string | null | undefined; subtitle?: string | null; className?: string }) {
  if (!name) return <span className="text-muted-foreground">Unassigned</span>;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <Avatar name={name} size="xs" />
      <span className="min-w-0">
        <span className="block truncate">{name}</span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
    </span>
  );
}
