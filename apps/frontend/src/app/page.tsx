"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { PageSpinner } from "@/components/patterns/loading";
import { useAuthStore } from "@/state/auth-store";

/** Root route: forward to the console when signed in, otherwise to login. */
export default function HomePage() {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();

  React.useEffect(() => {
    if (!hasHydrated) return;
    router.replace(isAuthenticated ? "/overview" : "/login");
  }, [hasHydrated, isAuthenticated, router]);

  return <PageSpinner />;
}
