"use client";

import { useEffect, useRef, useState } from "react";
import { createCallRingtone } from "./call-ringtone";

export function useCallRingtone(incoming: boolean) {
  const ringtoneRef = useRef<
    ReturnType<typeof createCallRingtone> | null
  >(null);

  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const ringtone = createCallRingtone((isReady) => {
      readyRef.current = isReady;
      setReady(isReady);
    });

    ringtoneRef.current = ringtone;
    readyRef.current = false;
    setReady(false);

    const unlock = (): void => {
      if (readyRef.current) return;

      void ringtone.unlock().catch(() => {
        if (ringtoneRef.current !== ringtone) return;

        readyRef.current = false;
        setReady(false);
      });
    };

    document.addEventListener("click", unlock, true);
    document.addEventListener("keydown", unlock, true);

    return () => {
      document.removeEventListener("click", unlock, true);
      document.removeEventListener("keydown", unlock, true);

      ringtoneRef.current = null;
      ringtone.dispose();
    };
  }, []);

  useEffect(() => {
    const ringtone = ringtoneRef.current;
    if (!ringtone) return;

    if (incoming) {
      ringtone.start();
    } else {
      ringtone.stop();
    }

    return () => ringtone.stop();
  }, [incoming]);

  const enableRingtone = async (): Promise<void> => {
    const ringtone = ringtoneRef.current;
    if (!ringtone) return;

    try {
      await ringtone.unlock();
    } catch {
      if (ringtoneRef.current !== ringtone) return;

      readyRef.current = false;
      setReady(false);
    }
  };

  return {
    ringtoneBlocked: incoming && !ready,
    enableRingtone,
  };
}