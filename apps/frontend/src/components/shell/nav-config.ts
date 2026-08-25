import {
  Activity,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckSquare,
  HeartPulse,
  LayoutDashboard,
  ListTree,
  Settings,
  Wrench,
  Workflow,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Route } from "next";

export interface NavItem {
  title: string;
  href: Route;
  icon: LucideIcon;
  /** single-key "go to" shortcut pressed after `g` */
  shortcut?: string;
  /** show live pending-approvals count */
  showApprovalsBadge?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

/**
 * Single source of truth for the console's information architecture: the
 * sidebar, command palette, breadcrumbs, and keyboard shortcuts all derive
 * from this map.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: "/overview", icon: LayoutDashboard, shortcut: "o", title: "Overview" }],
  },
  {
    items: [
      { href: "/workflows", icon: Workflow, shortcut: "w", title: "Workflows" },
      { href: "/executions", icon: ListTree, shortcut: "e", title: "Executions" },
      {
        href: "/approvals",
        icon: CheckSquare,
        shortcut: "p",
        showApprovalsBadge: true,
        title: "Approvals",
      },
    ],
    label: "Operations",
  },
  {
    items: [
      { href: "/agents", icon: Bot, shortcut: "a", title: "Agents & Models" },
      { href: "/memory", icon: BrainCircuit, shortcut: "m", title: "Memory" },
      { href: "/tools", icon: Wrench, shortcut: "t", title: "Tools" },
    ],
    label: "Intelligence",
  },
  {
    items: [
      { href: "/analytics", icon: BarChart3, shortcut: "n", title: "Analytics" },
      { href: "/health", icon: HeartPulse, shortcut: "h", title: "System Health" },
      { href: "/settings", icon: Settings, shortcut: "s", title: "Settings" },
    ],
    label: "Platform",
  },
];

export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

/** Breadcrumb labels for path segments that aren't nav items. */
export const SEGMENT_LABELS: Record<string, string> = {
  agents: "Agents & Models",
  analytics: "Analytics",
  approvals: "Approvals",
  builder: "Builder",
  executions: "Executions",
  health: "System Health",
  memory: "Memory",
  organization: "Organization",
  overview: "Overview",
  settings: "Settings",
  tools: "Tools",
  workflows: "Workflows",
};

export { Activity };
