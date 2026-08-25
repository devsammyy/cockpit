import { Badge } from "@/components/ui/badge";
import type { BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Maps every backend status string (executions, tool runs, workflows,
 * approvals) to a consistent semantic color. One component so a "FAILED"
 * looks identical on every screen.
 */
const STATUS_VARIANTS: Record<string, BadgeProps["variant"]> = {
  ACTIVE: "success",
  APPROVED: "success",
  CANCELLED: "muted",
  COMPLETED: "success",
  DRAFT: "muted",
  ERROR: "destructive",
  FAILED: "destructive",
  INACTIVE: "muted",
  OK: "success",
  PENDING: "warning",
  PENDING_APPROVAL: "warning",
  REJECTED: "destructive",
  RUNNING: "info",
};

const PULSING_STATUSES = new Set(["RUNNING", "PENDING", "PENDING_APPROVAL"]);

interface StatusBadgeProps {
  status: string | null | undefined;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  if (!status) {
    return (
      <Badge className={className} variant="muted">
        unknown
      </Badge>
    );
  }

  const normalized = status.toUpperCase();
  const variant = STATUS_VARIANTS[normalized] ?? "muted";
  const isLive = PULSING_STATUSES.has(normalized);

  return (
    <Badge className={cn("uppercase tracking-wide", className)} variant={variant}>
      {isLive ? (
        <span aria-hidden className="relative flex size-1.5">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-current" />
        </span>
      ) : null}
      {normalized.replaceAll("_", " ").toLowerCase()}
    </Badge>
  );
}
