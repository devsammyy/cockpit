"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ALL_NAV_ITEMS } from "@/components/shell/nav-config";
import { useUiStore } from "@/state/ui-store";

function Key({ children }: { children: string }) {
  return (
    <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] font-medium">
      {children}
    </kbd>
  );
}

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useUiStore();

  return (
    <Dialog onOpenChange={setShortcutsOpen} open={shortcutsOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Navigate the console without leaving the keyboard.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Global
            </h4>
            <ul className="space-y-1.5 text-sm">
              <li className="flex items-center justify-between">
                <span>Command palette</span>
                <span className="flex gap-1">
                  <Key>⌘</Key>
                  <Key>K</Key>
                </span>
              </li>
              <li className="flex items-center justify-between">
                <span>This dialog</span>
                <Key>?</Key>
              </li>
            </ul>
          </section>
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Go to
            </h4>
            <ul className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {ALL_NAV_ITEMS.filter((item) => item.shortcut).map((item) => (
                <li className="flex items-center justify-between" key={item.href}>
                  <span>{item.title}</span>
                  <span className="flex gap-1">
                    <Key>g</Key>
                    <Key>{item.shortcut ?? ""}</Key>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
