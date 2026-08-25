import { create } from "zustand";
import { persist } from "zustand/middleware";

import { bindAuth } from "@/lib/api/client";
import { organizationsApi } from "@/lib/api/endpoints";
import type { SessionUser } from "@/lib/api/types";

interface AuthState {
  accessToken: string | null;
  user: SessionUser | null;
  isAuthenticated: boolean;
  hasHydrated: boolean;
  setSession: (token: string, user: SessionUser) => void;
  clearSession: () => void;
  switchOrg: (orgId: string) => Promise<void>;
  setHasHydrated: (value: boolean) => void;
}

/**
 * Authentication state, persisted to localStorage so a page refresh keeps the
 * session. The API client reads the token through bindAuth() below instead of
 * mutating global axios headers.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      user: null,
      isAuthenticated: false,
      hasHydrated: false,

      setSession: (accessToken, user) => {
        set({ accessToken, user, isAuthenticated: true });
      },

      clearSession: () => {
        set({ accessToken: null, user: null, isAuthenticated: false });
      },

      switchOrg: async (orgId) => {
        const { accessToken: newToken } = await organizationsApi.switch(orgId);
        const currentUser = get().user;
        if (currentUser) {
          set({
            accessToken: newToken,
            user: { ...currentUser, activeOrgId: orgId },
            isAuthenticated: true,
          });
        }
      },

      setHasHydrated: (value) => {
        set({ hasHydrated: value });
      },
    }),
    {
      name: "qa-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);

// Wire the API client to the store: token reader + 401 handler.
bindAuth(
  () => useAuthStore.getState().accessToken,
  () => {
    useAuthStore.getState().clearSession();
  },
);
