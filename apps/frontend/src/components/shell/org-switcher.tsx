"use client";

import { Building2, Check, ChevronsUpDown } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProfile } from "@/hooks/use-api";
import { apiErrorMessage } from "@/lib/api/client";
import { useAuthStore } from "@/state/auth-store";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

/** Organization context switcher — swaps the JWT and resets server state. */
export function OrgSwitcher({ className }: { className?: string }) {
  const { user, switchOrg } = useAuthStore();
  const { data: profile } = useProfile();
  const queryClient = useQueryClient();
  const [isSwitching, setIsSwitching] = React.useState(false);

  const memberships = profile?.memberships ?? [];
  const activeOrg = memberships.find((m) => m.organization.id === user?.activeOrgId)?.organization;

  const handleSwitch = async (orgId: string) => {
    if (orgId === user?.activeOrgId) return;
    setIsSwitching(true);
    try {
      await switchOrg(orgId);
      // Every query is org-scoped — drop the whole cache except the profile.
      await queryClient.invalidateQueries();
      toast.success("Switched organization");
    } catch (error) {
      toast.error(apiErrorMessage(error));
    } finally {
      setIsSwitching(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Switch organization"
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-left text-sm text-sidebar-accent-foreground transition-colors hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary disabled:opacity-60",
          className,
        )}
        disabled={isSwitching}
      >
        <Building2 aria-hidden className="size-4 shrink-0 text-sidebar-muted" />
        <span className="min-w-0 flex-1 truncate">
          {activeOrg?.name ?? user?.activeOrgId ?? "Organization"}
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-sidebar-muted" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Organizations</DropdownMenuLabel>
        {memberships.length === 0 ? (
          <DropdownMenuItem disabled>No memberships found</DropdownMenuItem>
        ) : (
          memberships.map((membership) => (
            <DropdownMenuItem
              key={membership.organization.id}
              onClick={() => void handleSwitch(membership.organization.id)}
            >
              <span className="truncate">{membership.organization.name}</span>
              {membership.organization.id === user?.activeOrgId ? (
                <Check className="ml-auto size-4 text-primary" />
              ) : null}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <a href="/settings/organization">Organization settings</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
