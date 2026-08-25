import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Table-shaped skeleton for list pages. */
export function TableSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div aria-busy className={cn("space-y-2", className)} role="status" aria-label="Loading">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton className="h-11 w-full" key={index} />
      ))}
    </div>
  );
}

/** Grid of KPI tile skeletons. */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      aria-busy
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading metrics"
    >
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton className="h-[104px] w-full" key={index} />
      ))}
    </div>
  );
}

/** Full-page centered spinner for route-level suspense fallbacks. */
export function PageSpinner() {
  return (
    <div aria-busy className="flex min-h-[40vh] items-center justify-center" role="status">
      <div className="size-6 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary" />
      <span className="sr-only">Loading</span>
    </div>
  );
}
