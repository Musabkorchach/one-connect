"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Call, Device } from "@twilio/voice-sdk";
import { usePiAuth } from "@/contexts/pi-auth-context";
import { preparePstnCall } from "@/lib/api-client";
import { loadTwilioVoice } from "@/lib/connect/load-twilio-voice";

export interface PstnCallState {
  phone: string;
  phase: "preparing" | "connecting" | "ringing" | "connected";
  muted: boolean;
  connectedAt: number | null;
  inputVolume?: number;
  outputVolume?: number;
}

interface CallRun {
  sessionToken: string;
  device: Device | null;
  call: Call | null;
  abort: AbortController;
  timer: ReturnType<typeof setTimeout> | null;
}

export function usePstnCallController(
  isOtherCallActive: () => boolean,
) {
  const { sessionToken, isAuthenticated } = usePiAuth();
  const [pstnCallState, setCallState] = useState<PstnCallState | null>(null);
  const [pstnError, setError] = useState<string | null>(null);

  const runRef = useRef<CallRun | null>(null);
  const authRef = useRef<string | null>(null);
  authRef.current = isAuthenticated ? sessionToken ?? null : null;

  const busyRef = useRef(isOtherCallActive);
  busyRef.current = isOtherCallActive;

  const closeRun = useCallback((
    run: CallRun,
    message?: string,
    updateState = true,
  ) => {
    if (runRef.current !== run) return;

    runRef.current = null;
    run.abort.abort();
    if (run.timer) clearTimeout(run.timer);

    try { run.call?.disconnect(); } catch {}
    try { run.device?.destroy(); } catch {}

    if (updateState) {
      setCallState(null);
      if (message) setError(message);
    }
  }, []);

  useEffect(() => {
    setCallState(null);
    setError(null);

    return () => {
      const run = runRef.current;
      if (run) closeRun(run, undefined, false);
    };
  }, [sessionToken, isAuthenticated, closeRun]);

  const endPstnCall = useCallback(() => {
    const run = runRef.current;
    if (run) closeRun(run);
  }, [closeRun]);

  const startPstnCall = async (phone: string): Promise<void> => {
    if (runRef.current) return;

    if (busyRef.current()) {
      setError("Please end your current call first.");
      return;
    }

    const token = authRef.current;

    if (!token) {
      setError("Please sign in before making a phone call.");
      return;
    }

    const run: CallRun = {
      sessionToken: token,
      device: null,
      call: null,
      abort: new AbortController(),
      timer: null,
    };

    runRef.current = run;
    setError(null);
    setCallState({
      phone,
      phase: "preparing",
      muted: false,
      connectedAt: null,
    });

    const isCurrent = () =>
      runRef.current === run &&
      authRef.current === run.sessionToken;

    run.timer = setTimeout(() => {
      closeRun(run, "Preparing the phone call timed out.");
    }, 30_000);

    try {
      const Device = await loadTwilioVoice();

      if (!isCurrent()) return;

      if (!Device.isSupported) {
        throw new Error("Phone calling is not supported in this browser.");
      }

      const prepared = await preparePstnCall(
        token,
        phone,
        crypto.randomUUID(),
        run.abort.signal,
      );

      if (!isCurrent()) return;

      // Recheck after waiting for the server.
      if (busyRef.current()) {
        closeRun(run, "Please end your current call first.");
        return;
      }

      const device = new Device(prepared.token);
      run.device = device;

      device.on("error", () => {
        closeRun(run, "Phone call connection failed.");
      });

      setCallState((state) => state && ({
        ...state,
        phone: prepared.phone,
        phase: "connecting",
      }));

      const call = await device.connect({
        params: { To: prepared.phone },
      });

      if (!isCurrent()) {
        try { call.disconnect(); } catch {}
        try { device.destroy(); } catch {}
        return;
      }

      run.call = call;
      let lastVolumeUpdate = 0;

      call.on("volume", (inputVolume: number, outputVolume: number) => {
        if (!isCurrent()) return;

        const now = Date.now();
        if (now - lastVolumeUpdate < 250) return;
        lastVolumeUpdate = now;

        setCallState((state) => state && ({
          ...state,
          inputVolume: Number.isFinite(inputVolume)
            ? Math.max(0, Math.min(1, inputVolume))
            : undefined,
          outputVolume: Number.isFinite(outputVolume)
            ? Math.max(0, Math.min(1, outputVolume))
            : undefined,
        }));
      });
      if (run.timer) clearTimeout(run.timer);

      run.timer = setTimeout(() => {
        closeRun(run, "The phone call was not answered in time.");
      }, 60_000);

      const onConnected = () => {
        if (!isCurrent()) return;
        if (run.timer) clearTimeout(run.timer);

        setCallState((state) => state && ({
          ...state,
          phase: "connected",
          connectedAt: state.connectedAt ?? Date.now(),
        }));

        run.timer = setTimeout(() => {
          closeRun(run);
        }, (prepared.maxDurationSeconds + 5) * 1000);
      };

      call.on("ringing", () => {
        if (!isCurrent()) return;
        setCallState((state) => state && ({
          ...state,
          phase: "ringing",
        }));
      });

      call.on("accept", onConnected);
      call.on("disconnect", () => closeRun(run));
      call.on("cancel", () => closeRun(run));
      call.on("reject", () => closeRun(run));
      call.on("error", () => {
        closeRun(run, "The phone call failed.");
      });

      if (call.status() === "open") {
        onConnected();
      } else if (call.status() === "closed") {
        closeRun(run);
      }
    } catch (error) {
      if (runRef.current !== run) return;

      closeRun(
        run,
        error instanceof Error
          ? error.message
          : "Unable to start the phone call.",
      );
    }
  };

  const setPstnMuted = (muted: boolean) => {
    const run = runRef.current;
    if (!run?.call) return;

    try {
      run.call.mute(muted);
      setCallState((state) => state && ({ ...state, muted }));
    } catch {
      setError("Unable to change the microphone setting.");
    }
  };

  return {
    pstnCallState,
    pstnError,
    startPstnCall,
    endPstnCall,
    setPstnMuted,
    clearPstnError: () => setError(null),
    isPstnBusy: () => runRef.current !== null,
  };
}