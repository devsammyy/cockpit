import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  hint?: string;
  trend?: { value: string; direction: "up" | "down" | "flat" };
  isLoading?: boolean;
  className?: string;
}

/** KPI tile used across every dashboard. */
export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  trend,
  isLoading,
  className,
}: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          {Icon ? <Icon aria-hidden className="size-4 text-muted-foreground" /> : null}
        </div>
        {isLoading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <p className="mt-1.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
        )}
        {(hint ?? trend) ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
            {trend ? (
              <span
                className={cn(
                  "font-medium",
                  trend.direction === "up" && "text-success",
                  trend.direction === "down" && "text-destructive",
                )}
              >
                {trend.value}
              </span>
            ) : null}
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
