import { cn } from "@/lib/utils";

/** Integral Academy mark: the integral sign (∫) in a brand-gradient tile. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#4c51bf] to-[#6b46c1] text-white shadow-sm",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M15.5 4.2c-1.4-.9-3.3-.3-3.8 1.4L9.9 18.4c-.5 1.7-2.4 2.3-3.8 1.4" />
      </svg>
    </span>
  );
}

export function Wordmark({ collapsed }: { collapsed?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <LogoMark />
      {!collapsed && (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-[13px] font-semibold tracking-[0.08em] text-foreground">INTEGRAL ACADEMY</span>
          <span className="truncate text-[11px] text-muted-foreground">Executive Workspace</span>
        </span>
      )}
    </span>
  );
}
