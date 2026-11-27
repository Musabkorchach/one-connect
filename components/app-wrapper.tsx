"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { PiAuthProvider, usePiAuth } from "@/contexts/pi-auth-context";
import { AuthLoadingScreen } from "./auth-loading-screen";
import { PI_NETWORK_CONFIG } from "@/lib/system-config";

function AppContent({ children }: { children: ReactNode }) {
  const { isAuthenticated } = usePiAuth();
  if (!isAuthenticated) return <AuthLoadingScreen />;
  return <>{children}</>;
}

export function AppWrapper({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/privacy" || pathname === "/terms") return <>{children}</>;
  if (!PI_NETWORK_CONFIG.PRODUCTION_REVIEW && process.env.NEXT_PUBLIC_CALL_TEST_MODE === "1") return <>{children}</>;
  return (
    <PiAuthProvider>
      <AppContent>{children}</AppContent>
    </PiAuthProvider>
  );
}
