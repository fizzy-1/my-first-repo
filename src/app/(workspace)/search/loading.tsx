import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div aria-busy="true" aria-label="Searching">
      <Skeleton className="mb-2 h-7 w-32" />
      <Skeleton className="mb-6 h-4 w-96 max-w-full" />
      <Skeleton className="mb-6 h-10 max-w-2xl rounded-lg" />
      <Skeleton className="mb-4 h-4 w-64" />
      <div className="space-y-5">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
