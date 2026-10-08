import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarLoading() {
  return (
    <div aria-busy="true" aria-label="Loading calendar">
      <Skeleton className="mb-2 h-7 w-40" />
      <Skeleton className="mb-8 h-4 w-96 max-w-full" />
      <div className="mb-4 flex items-center gap-2">
        <Skeleton className="size-8" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="size-8" />
        <Skeleton className="ml-1 h-6 w-36" />
      </div>
      <div className="mb-4 flex gap-1.5 overflow-hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-28 shrink-0 rounded-full" />
        ))}
      </div>
      <Skeleton className="hidden h-[42rem] rounded-xl md:block" />
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}
