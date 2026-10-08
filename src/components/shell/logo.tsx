import Image from "next/image";
import crest from "@/assets/brand/crest.png";
import { cn } from "@/lib/utils";

/**
 * The Integral Academy crest (∫ torch over an open book) on a paper tile, so its
 * navy strokes stay legible on the navy sidebar and on dark surfaces.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-paper shadow-sm ring-1 ring-sidebar-accent/40", className)}
    >
      <Image src={crest} alt="" className="size-[88%] object-contain" sizes="80px" priority />
    </span>
  );
}

export function Wordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <LogoMark />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate font-display text-[14px] font-bold tracking-[0.06em] text-sidebar-heading">INTEGRAL ACADEMY</span>
          <span className="truncate text-[11px] tracking-wide text-sidebar-muted">Executive Workspace</span>
        </span>
      )}
    </span>
  );
}
