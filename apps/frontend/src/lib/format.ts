import { formatDistanceToNowStrict, format as formatDateFns, parseISO } from "date-fns";

/** "1,234,567" */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/** "1.2M", "45.3k" — for dense stat tiles */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
}

/**
 * The backend stores cost estimates as integer micro-dollars
 * (cost-tracker convention: USD * 1e6 to avoid float drift).
 */
export function formatCostMicroUsd(micro: number | null | undefined): string {
  if (micro === null || micro === undefined || Number.isNaN(micro)) return "—";
  const usd = micro / 1_000_000;
  if (usd > 0 && usd < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    style: "currency",
  }).format(usd);
}

/** "2.4s", "312ms", "1m 05s" */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms) || ms < 0) return "—";
  if (ms < 1000) return `${String(Math.round(ms))}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${String(minutes)}m ${rest.toString().padStart(2, "0")}s`;
}

/** "3 minutes ago" */
export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
  } catch {
    return "—";
  }
}

/** "Jul 15, 2026 14:03" */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDateFns(parseISO(iso), "MMM d, yyyy HH:mm");
  } catch {
    return "—";
  }
}

/** Truncate an id like "9f0c1e2a-…" for dense tables. */
export function shortId(id: string | null | undefined, length = 8): string {
  if (!id) return "—";
  return id.length > length ? `${id.slice(0, length)}…` : id;
}

/** "42%" with clamping, for quota meters. */
export function formatPercent(used: number, limit: number): string {
  if (!limit) return "0%";
  return `${String(Math.min(100, Math.round((used / limit) * 100)))}%`;
}

export function percentOf(used: number, limit: number): number {
  if (!limit) return 0;
  return Math.min(100, (used / limit) * 100);
}
