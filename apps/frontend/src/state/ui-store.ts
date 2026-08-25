import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  commandPaletteOpen: boolean;
  shortcutsOpen: boolean;
  toggleSidebar: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
}

/**
 * Ephemeral console UI state. Only layout preferences persist; overlays are
 * intentionally session-local.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      commandPaletteOpen: false,
      shortcutsOpen: false,
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      setCommandPaletteOpen: (open) => {
        set({ commandPaletteOpen: open });
      },
      setShortcutsOpen: (open) => {
        set({ shortcutsOpen: open });
      },
    }),
    {
      name: "qa-ui",
      partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }),
    },
  ),
);
