"use client";

import { createContext, useContext } from "react";
import type { GroupRecord } from "@/lib/api-client";

type StartGroupCall = (
  group: GroupRecord,
  kind: "voice" | "video",
) => void;

const GroupCallActionsContext = createContext<StartGroupCall | null>(null);

export const GroupCallActionsProvider = GroupCallActionsContext.Provider;

export function useGroupCallActions(): StartGroupCall {
  const startCall = useContext(GroupCallActionsContext);

  if (!startCall) {
    throw new Error(
      "useGroupCallActions must be used within GroupCallActionsProvider",
    );
  }

  return startCall;
}