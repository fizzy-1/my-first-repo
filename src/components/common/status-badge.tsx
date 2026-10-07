import { Badge } from "@/components/ui/badge";
import type { EnumMeta } from "@/lib/labels";
import { cn } from "@/lib/utils";

/** Badge for an enum value; always shows a text label (never colour alone). */
export function StatusBadge<T extends string>({
  meta,
  value,
  dot = true,
  className,
}: {
  meta: Record<T, EnumMeta>;
  value: T;
  dot?: boolean;
  className?: string;
}) {
  const entry = meta[value];
  return (
    <Badge tone={entry?.tone ?? "neutral"} className={className}>
      {dot && <span aria-hidden className={cn("size-1.5 rounded-full bg-current opacity-80")} />}
      {entry?.label ?? value}
    </Badge>
  );
}
