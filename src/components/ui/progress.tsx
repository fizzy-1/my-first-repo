import { cn } from "@/lib/utils";

/** Accessible progress bar. `tone` carries severity; the track is a lighter step of the same hue. */
export function Progress({
  value,
  tone = "primary",
  className,
  label,
}: {
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const fill = { primary: "bg-primary", success: "bg-success", warning: "bg-warning", danger: "bg-danger" }[tone];
  const track = { primary: "bg-primary-soft", success: "bg-success-soft", warning: "bg-warning-soft", danger: "bg-danger-soft" }[tone];
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full", track, className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}
