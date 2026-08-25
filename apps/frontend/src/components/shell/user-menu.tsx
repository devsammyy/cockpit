"use client";

import { HelpCircle, Keyboard, LogOut, Settings, User } from "lucide-react";
import { useRouter } from "next/navigation";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/state/auth-store";
import { useUiStore } from "@/state/ui-store";

function initials(name: string | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserMenu() {
  const router = useRouter();
  const { user, clearSession } = useAuthStore();
  const { setShortcutsOpen } = useUiStore();

  const handleLogout = () => {
    clearSession();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Account menu"
        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Avatar>
          <AvatarFallback>{initials(user?.displayName)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <span className="block truncate text-sm font-medium text-foreground">
            {user?.displayName}
          </span>
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {user?.email}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            router.push("/settings");
          }}
        >
          <User /> Profile
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            router.push("/settings/organization");
          }}
        >
          <Settings /> Organization
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            setShortcutsOpen(true);
          }}
        >
          <Keyboard /> Keyboard shortcuts
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="http://localhost:4000/docs" rel="noopener noreferrer" target="_blank">
            <HelpCircle /> API reference
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
