"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { CommandPalette } from "@/components/shell/command-palette";
import { Header } from "@/components/shell/header";
import { ALL_NAV_ITEMS } from "@/components/shell/nav-config";
import { ShortcutsDialog } from "@/components/shell/shortcuts-dialog";
import { Sidebar } from "@/components/shell/sidebar";
import { PageSpinner } from "@/components/patterns/loading";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuthStore } from "@/state/auth-store";
import { useUiStore } from "@/state/ui-store";

const GO_SEQUENCE_TIMEOUT_MS = 1200;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * Authenticated console frame: auth guard, sidebar + header layout, global
 * keyboard bindings (⌘K palette, `?` shortcuts, `g <key>` navigation), and
 * the overlay surfaces.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const { setCommandPaletteOpen, setShortcutsOpen } = useUiStore();
  const goPrefixArmedAt = React.useRef<number | null>(null);

  // Redirect unauthenticated visitors once the persisted session has loaded.
  React.useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.replace("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  // Global keyboard shortcuts.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      if (event.key === "?") {
        event.preventDefault();
        setShortcutsOpen(true);
        return;
      }

      const now = Date.now();
      if (event.key === "g") {
        goPrefixArmedAt.current = now;
        return;
      }

      if (
        goPrefixArmedAt.current !== null &&
        now - goPrefixArmedAt.current < GO_SEQUENCE_TIMEOUT_MS
      ) {
        const target = ALL_NAV_ITEMS.find((item) => item.shortcut === event.key);
        if (target) {
          event.preventDefault();
          router.push(target.href);
        }
        goPrefixArmedAt.current = null;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [router, setCommandPaletteOpen, setShortcutsOpen]);

  if (!hasHydrated) {
    return <PageSpinner />;
  }

  if (!isAuthenticated) {
    return <PageSpinner />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-6 px-4 py-6 sm:px-6">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
    </TooltipProvider>
  );
}
