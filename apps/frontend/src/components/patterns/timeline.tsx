import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface TimelineItem {
  id: string;
  title: string;
  description?: ReactNode;
  timestamp?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "destructive" | "info" | "warning";
}

const TONE_CLASSES: Record<NonNullable<TimelineItem["tone"]>, string> = {
  default: "bg-muted text-muted-foreground",
  destructive: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
};

/** Vertical event timeline used in execution details and activity feeds. */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  return (
    <ol className={cn("relative space-y-0", className)}>
      {items.map((item, index) => {
        const Icon = item.icon;
        const isLast = index === items.length - 1;
        return (
          <li className="relative flex gap-3 pb-6 last:pb-0" key={item.id}>
            {!isLast ? (
              <span
                aria-hidden
                className="absolute left-[13px] top-7 h-[calc(100%-20px)] w-px bg-border"
              />
            ) : null}
            <span
              className={cn(
                "z-10 mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full",
                TONE_CLASSES[item.tone ?? "default"],
              )}
            >
              {Icon ? (
                <Icon aria-hidden className="size-3.5" />
              ) : (
                <span className="size-1.5 rounded-full bg-current" />
              )}
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="text-sm font-medium leading-tight">{item.title}</p>
                {item.timestamp ? (
                  <time className="text-xs tabular-nums text-muted-foreground">
                    {item.timestamp}
                  </time>
                ) : null}
              </div>
              {item.description ? (
                <div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
