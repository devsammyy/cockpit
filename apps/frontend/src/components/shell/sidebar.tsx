"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Sparkles } from "lucide-react";

import { NAV_GROUPS } from "@/components/shell/nav-config";
import { OrgSwitcher } from "@/components/shell/org-switcher";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useApprovals } from "@/hooks/use-api";
import { useUiStore } from "@/state/ui-store";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

/** Nav list shared by the desktop rail and the mobile sheet. */
export function SidebarNav({ collapsed, onNavigate }: SidebarNavProps) {
  const pathname = usePathname();
  const { data: approvals } = useApprovals();
  const pendingCount = approvals?.length ?? 0;

  return (
    <nav
      aria-label="Main navigation"
      className="flex-1 space-y-4 overflow-y-auto px-2 py-3 scrollbar-thin"
    >
      {NAV_GROUPS.map((group, groupIndex) => (
        <div key={group.label ?? groupIndex}>
          {group.label && !collapsed ? (
            <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-sidebar-muted">
              {group.label}
            </p>
          ) : null}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/overview" && pathname.startsWith(`${item.href}/`));
              const badge =
                item.showApprovalsBadge && pendingCount > 0 ? (
                  <span className="ml-auto rounded-full bg-warning/20 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-warning">
                    {pendingCount}
                  </span>
                ) : null;

              const link = (
                <Link
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                    collapsed && "justify-center px-0 py-2",
                  )}
                  href={item.href}
                  onClick={onNavigate}
                >
                  <item.icon
                    aria-hidden
                    className={cn("size-4 shrink-0", isActive && "text-sidebar-primary")}
                  />
                  {!collapsed ? <span className="truncate">{item.title}</span> : null}
                  {!collapsed ? badge : null}
                </Link>
              );

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">
                        {item.title}
                        {item.showApprovalsBadge && pendingCount > 0
                          ? ` (${String(pendingCount)} pending)`
                          : ""}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Desktop sidebar rail. Hidden on mobile — the header offers a sheet instead. */
export function Sidebar() {
  const { sidebarCollapsed, toggleSidebar } = useUiStore();

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 hidden h-screen flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex",
        sidebarCollapsed ? "w-14" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2 border-b border-sidebar-border px-3",
          sidebarCollapsed && "justify-center px-0",
        )}
      >
        <Link aria-label="Qwen Autopilot home" className="flex items-center gap-2" href="/overview">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-primary/15 text-sidebar-primary">
            <Sparkles aria-hidden className="size-4" />
          </span>
          {!sidebarCollapsed ? (
            <span className="truncate text-sm font-semibold text-sidebar-accent-foreground">
              Qwen Autopilot
            </span>
          ) : null}
        </Link>
      </div>

      {!sidebarCollapsed ? (
        <div className="border-b border-sidebar-border p-2">
          <OrgSwitcher />
        </div>
      ) : null}

      <SidebarNav collapsed={sidebarCollapsed} />

      <div className="border-t border-sidebar-border p-2">
        <button
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
            sidebarCollapsed && "justify-center px-0 py-2",
          )}
          onClick={toggleSidebar}
          type="button"
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen aria-hidden className="size-4" />
          ) : (
            <>
              <PanelLeftClose aria-hidden className="size-4" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
