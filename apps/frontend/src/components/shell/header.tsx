"use client";

import { Menu, Search, Sparkles } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { Notifications } from "@/components/shell/notifications";
import { OrgSwitcher } from "@/components/shell/org-switcher";
import { SidebarNav } from "@/components/shell/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { UserMenu } from "@/components/shell/user-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useUiStore } from "@/state/ui-store";

/** Sticky console header: mobile nav, breadcrumbs, search, and utilities. */
export function Header() {
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      {/* Mobile navigation */}
      <Sheet onOpenChange={setMobileNavOpen} open={mobileNavOpen}>
        <SheetTrigger asChild>
          <Button aria-label="Open navigation" className="lg:hidden" size="icon-sm" variant="ghost">
            <Menu />
          </Button>
        </SheetTrigger>
        <SheetContent
          className="flex w-72 flex-col gap-0 bg-sidebar p-0 text-sidebar-foreground"
          side="left"
        >
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
            <span className="flex size-7 items-center justify-center rounded-md bg-sidebar-primary/15 text-sidebar-primary">
              <Sparkles aria-hidden className="size-4" />
            </span>
            <span className="text-sm font-semibold text-sidebar-accent-foreground">
              Qwen Autopilot
            </span>
          </div>
          <div className="border-b border-sidebar-border p-2">
            <OrgSwitcher />
          </div>
          <SidebarNav
            onNavigate={() => {
              setMobileNavOpen(false);
            }}
          />
        </SheetContent>
      </Sheet>

      <Breadcrumbs className="hidden min-w-0 flex-1 sm:block" />
      <span className="flex-1 sm:hidden" />

      {/* Global search / command palette trigger */}
      <button
        aria-label="Search (Command+K)"
        className="hidden h-8 w-56 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:flex"
        onClick={() => {
          setCommandPaletteOpen(true);
        }}
        type="button"
      >
        <Search aria-hidden className="size-3.5" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="rounded border bg-background px-1.5 font-mono text-[10px]">⌘K</kbd>
      </button>
      <Button
        aria-label="Search"
        className="md:hidden"
        onClick={() => {
          setCommandPaletteOpen(true);
        }}
        size="icon-sm"
        variant="ghost"
      >
        <Search />
      </Button>

      <div className="flex items-center gap-1">
        <Notifications />
        <ThemeToggle />
        <Link className="ml-1" href="/settings">
          <span className="sr-only">Settings</span>
        </Link>
        <UserMenu />
      </div>
    </header>
  );
}
