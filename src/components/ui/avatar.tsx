import { cn, initials } from "@/lib/utils";

const TONES = [
  "bg-[#4c51bf] text-white",
  "bg-[#6b46c1] text-white",
  "bg-[#0e7c66] text-white",
  "bg-[#b4540f] text-white",
  "bg-[#a6336b] text-white",
  "bg-[#2563a8] text-white",
];

function toneFor(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

export function Avatar({ name, className, size = "md" }: { name: string; className?: string; size?: "xs" | "sm" | "md" | "lg" }) {
  const sizes = { xs: "size-5 text-[9px]", sm: "size-7 text-[11px]", md: "size-8 text-xs", lg: "size-11 text-sm" };
  return (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full font-semibold", sizes[size], toneFor(name), className)}
    >
      {initials(name)}
    </span>
  );
}

export function AvatarStack({ names, max = 4 }: { names: string[]; max?: number }) {
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  return (
    <span className="flex -space-x-1.5" title={names.join(", ")}>
      {shown.map((n) => (
        <Avatar key={n} name={n} size="sm" className="ring-2 ring-card" />
      ))}
      {rest > 0 && (
        <span className="inline-flex size-7 items-center justify-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground ring-2 ring-card">
          +{rest}
        </span>
      )}
    </span>
  );
}
