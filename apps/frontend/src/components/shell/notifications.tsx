"use client";

import { Bell, CheckSquare, ListTree, XCircle } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useApprovals, useExecutions } from "@/hooks/use-api";
import { formatRelative, shortId } from "@/lib/format";

interface NotificationEntry {
  id: string;
  href: Route;
  icon: typeof Bell;
  tone: "warning" | "destructive" | "info";
  title: string;
  detail: string;
  timestamp?: string | null;
}

/**
 * Live notification center: pending approvals demand action, and the most
 * recent failed/running executions surface for awareness. Fed by the same
 * polled queries as the pages, so counts always agree.
 */
export function Notifications() {
  const { data: approvals } = useApprovals();
  const { data: executions } = useExecutions();

  const entries = React.useMemo<NotificationEntry[]>(() => {
    const approvalEntries: NotificationEntry[] = (approvals ?? []).map((approval) => ({
      detail: `Tool "${approval.toolName}" is waiting for a decision`,
      href: "/approvals",
      icon: CheckSquare,
      id: `approval-${approval.id}`,
      timestamp: approval.createdAt,
      title: "Approval required",
      tone: "warning",
    }));

    const executionEntries: NotificationEntry[] = (executions ?? [])
      .filter((e) => e.status === "FAILED" || e.status === "RUNNING")
      .slice(0, 6)
      .map((execution) => ({
        detail:
          execution.status === "FAILED"
            ? (execution.errorMessage ?? "Execution failed")
            : `Step ${execution.currentStepId ?? "…"} in progress`,
        href: `/executions/${execution.id}` as Route,
        icon: execution.status === "FAILED" ? XCircle : ListTree,
        id: `execution-${execution.id}`,
        timestamp: execution.startedAt ?? execution.createdAt,
        title:
          execution.status === "FAILED"
            ? `Execution ${shortId(execution.id)} failed`
            : `Execution ${shortId(execution.id)} running`,
        tone: execution.status === "FAILED" ? "destructive" : "info",
      }));

    return [...approvalEntries, ...executionEntries].slice(0, 10);
  }, [approvals, executions]);

  const actionableCount = approvals?.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={`Notifications${actionableCount > 0 ? ` (${String(actionableCount)} requiring action)` : ""}`}
          className="relative"
          size="icon-sm"
          variant="ghost"
        >
          <Bell />
          {actionableCount > 0 ? (
            <span className="absolute right-1 top-1 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-warning opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-warning" />
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <h3 className="text-sm font-semibold">Notifications</h3>
          {actionableCount > 0 ? (
            <span className="text-xs text-muted-foreground">
              {actionableCount} requiring action
            </span>
          ) : null}
        </div>
        <Separator />
        {entries.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            All clear — nothing needs your attention.
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1 scrollbar-thin">
            {entries.map((entry) => (
              <li key={entry.id}>
                <Link
                  className="flex gap-3 px-4 py-2.5 transition-colors hover:bg-accent"
                  href={entry.href}
                >
                  <entry.icon
                    aria-hidden
                    className={
                      entry.tone === "warning"
                        ? "mt-0.5 size-4 shrink-0 text-warning"
                        : entry.tone === "destructive"
                          ? "mt-0.5 size-4 shrink-0 text-destructive"
                          : "mt-0.5 size-4 shrink-0 text-info"
                    }
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{entry.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.detail}
                    </span>
                  </span>
                  <time className="shrink-0 text-[10px] text-muted-foreground">
                    {formatRelative(entry.timestamp)}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
