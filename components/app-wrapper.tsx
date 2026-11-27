"use client";

import type { ReactNode } from "react";
import { PiAuthProvider, usePiAuth } from "@/contexts/pi-auth-context";
import { AuthLoadingScreen } from "./auth-loading-screen";

function AppContent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = usePiAuth();
  if (!isAuthenticated) return <AuthLoadingScreen />;
  return <>{children}</>;
}

export function AppWrapper({ children }: { children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1") return <>{children}</>;
  return (
    <PiAuthProvider>
      <AppContent>{children}</AppContent>
    </PiAuthProvider>
  );
}
