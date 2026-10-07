import Link from "next/link";
import type { CampaignStatus } from "@prisma/client";
import { addMonths, startOfMonth } from "@/lib/dates";
import { CAMPAIGN_CHANNEL, CAMPAIGN_STATUS } from "@/lib/labels";
import { formatDate, formatMonthShort } from "@/lib/format";
import { cn } from "@/lib/utils";

const BAR: Record<CampaignStatus, string> = {
  DRAFT: "bg-muted-foreground/30",
  PLANNING: "bg-info/70",
  ACTIVE: "bg-chart-1",
  PAUSED: "bg-warning/70",
  COMPLETED: "bg-muted-foreground/50",
};

/** Gantt-style campaign calendar over a window of months. */
export function CampaignCalendar({
  campaigns,
  from,
  months,
  now,
}: {
  campaigns: { id: string; name: string; status: CampaignStatus; channel: keyof typeof CAMPAIGN_CHANNEL; startDate: Date; endDate: Date | null }[];
  from: Date;
  months: number;
  /** Request time (passed in so rendering stays pure). */
  now: Date;
}) {
  const start = startOfMonth(from).getTime();
  const end = startOfMonth(addMonths(from, months)).getTime();
  const span = end - start;
  const pct = (t: number) => Math.min(100, Math.max(0, ((t - start) / span) * 100));
  const monthStarts = Array.from({ length: months }, (_, i) => startOfMonth(addMonths(from, i)));
  const today = pct(now.getTime());

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[220px_1fr] border-b border-border text-xs text-muted-foreground">
          <div className="px-4 py-2">Campaign</div>
          <div className="relative grid" style={{ gridTemplateColumns: `repeat(${months}, 1fr)` }}>
            {monthStarts.map((m) => (
              <div key={m.toISOString()} className="border-l border-border px-2 py-2">
                {formatMonthShort(m)} {m.getUTCFullYear() !== now.getUTCFullYear() ? String(m.getUTCFullYear()).slice(2) : ""}
              </div>
            ))}
          </div>
        </div>
        {campaigns.map((c) => {
          const s = pct(c.startDate.getTime());
          const e = pct((c.endDate ?? new Date(end)).getTime() + 86_400_000);
          return (
            <div key={c.id} className="grid grid-cols-[220px_1fr] border-b border-border last:border-0">
              <div className="min-w-0 px-4 py-2.5">
                <Link href={`/marketing/${c.id}`} className="block truncate text-sm font-medium hover:underline">
                  {c.name}
                </Link>
                <p className="truncate text-[11px] text-muted-foreground">
                  {CAMPAIGN_CHANNEL[c.channel].label} · {CAMPAIGN_STATUS[c.status].label}
                </p>
              </div>
              <div className="relative">
                <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${months}, 1fr)` }} aria-hidden>
                  {monthStarts.map((m) => (
                    <div key={m.toISOString()} className="border-l border-border/60" />
                  ))}
                </div>
                {today > 0 && today < 100 && <div className="absolute inset-y-0 w-px bg-danger/70" style={{ left: `${today}%` }} aria-hidden />}
                <Link
                  href={`/marketing/${c.id}`}
                  title={`${c.name}: ${formatDate(c.startDate)} – ${c.endDate ? formatDate(c.endDate) : "ongoing"}`}
                  className={cn("absolute top-1/2 h-5 -translate-y-1/2 rounded-md", BAR[c.status], !c.endDate && "rounded-r-none")}
                  style={{ left: `${s}%`, width: `${Math.max(1.5, e - s)}%` }}
                >
                  <span className="sr-only">
                    {formatDate(c.startDate)} to {c.endDate ? formatDate(c.endDate) : "ongoing"}
                  </span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        {(Object.keys(BAR) as CampaignStatus[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cn("size-2.5 rounded-sm", BAR[s])} aria-hidden /> {CAMPAIGN_STATUS[s].label}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-px bg-danger/70" aria-hidden /> Today
        </span>
      </div>
    </div>
  );
}
