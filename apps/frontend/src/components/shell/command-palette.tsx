"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Keyboard, LogOut, Moon, Plus, RotateCw, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";

import { ALL_NAV_ITEMS } from "@/components/shell/nav-config";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { useAuthStore } from "@/state/auth-store";
import { useUiStore } from "@/state/ui-store";

/**
 * Global command palette (⌘K / Ctrl+K): navigation, quick actions, theme,
 * and session controls. Backed by the same nav config as the sidebar.
 */
export function CommandPalette() {
  const router = useRouter();
  const { setTheme } = useTheme();
  const queryClient = useQueryClient();
  const { commandPaletteOpen, setCommandPaletteOpen, setShortcutsOpen } = useUiStore();
  const clearSession = useAuthStore((state) => state.clearSession);

  const run = React.useCallback(
    (action: () => void) => {
      setCommandPaletteOpen(false);
      action();
    },
    [setCommandPaletteOpen],
  );

  return (
    <CommandDialog onOpenChange={setCommandPaletteOpen} open={commandPaletteOpen}>
      <CommandInput placeholder="Search pages and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {ALL_NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.href}
              onSelect={() => {
                run(() => {
                  router.push(item.href);
                });
              }}
              value={`go ${item.title}`}
            >
              <item.icon />
              {item.title}
              {item.shortcut ? <CommandShortcut>g {item.shortcut}</CommandShortcut> : null}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() => {
              run(() => {
                router.push("/workflows?run=1");
              });
            }}
          >
            <Plus /> Run a new autonomous goal
          </CommandItem>
          <CommandItem
            onSelect={() => {
              run(() => {
                router.push("/workflows/builder");
              });
            }}
          >
            <Plus /> Open workflow builder
          </CommandItem>
          <CommandItem
            onSelect={() => {
              run(() => {
                void queryClient.invalidateQueries();
              });
            }}
          >
            <RotateCw /> Refresh all data
          </CommandItem>
          <CommandItem
            onSelect={() => {
              run(() => {
                setShortcutsOpen(true);
              });
            }}
          >
            <Keyboard /> Keyboard shortcuts
            <CommandShortcut>?</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Preferences">
          <CommandItem
            onSelect={() => {
              run(() => {
                setTheme("light");
              });
            }}
          >
            <Sun /> Light theme
          </CommandItem>
          <CommandItem
            onSelect={() => {
              run(() => {
                setTheme("dark");
              });
            }}
          >
            <Moon /> Dark theme
          </CommandItem>
          <CommandItem
            onSelect={() => {
              run(() => {
                clearSession();
                router.push("/login");
              });
            }}
          >
            <LogOut /> Sign out
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
