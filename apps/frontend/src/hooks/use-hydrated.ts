import * as React from "react";

const emptySubscribe = () => () => {
  // no external store to subscribe to — hydration status never changes back
};

/**
 * True after client hydration, false during SSR. The useSyncExternalStore
 * idiom avoids setState-in-effect while staying hydration-mismatch safe.
 */
export function useHydrated(): boolean {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
}
