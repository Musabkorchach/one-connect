"use client";

import { useState } from "react";
import { IconSpeaker } from "./icons";
import { getCallAudioOutputs, setCallAudioOutput, supportsCallAudioOutput } from "@/lib/connect/call-audio-output";
import type { RemoteCallAudio } from "@/lib/connect/remote-call-audio";

export function CallAudioControls({ audio, blocked, lang }: {
  audio: RemoteCallAudio;
  blocked: boolean;
  lang: string;
}) {
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const label = lang === "ar" ? "مخرج الصوت" : lang === "fr" ? "Sortie audio" : "Audio output";
  const recover = lang === "ar" ? "تشغيل صوت المكالمة" : lang === "fr" ? "Activer le son de l’appel" : "Play call audio";
  const errorLabel = lang === "ar" ? "تعذّر تغيير مخرج الصوت" : lang === "fr" ? "Impossible de changer la sortie audio" : "Could not change audio output";
  const canSelect = supportsCallAudioOutput(audio.element);

  const changeOutput = async (device?: MediaDeviceInfo) => {
    setBusy(true);
    setFailed(false);
    try {
      const available = device ? [device] : await getCallAudioOutputs(audio.element);
      if (available.length === 1) {
        await setCallAudioOutput(audio.element, available[0].deviceId);
        setOutputs([]);
      } else {
        setOutputs(available);
      }
    } catch (error) {
      if ((error as Error)?.name !== "AbortError") setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {blocked && (
        <button type="button" className="rounded-full bg-white px-4 py-2 font-semibold text-black" onClick={() => void audio.resume()}>
          {recover}
        </button>
      )}
      {canSelect && (
        <button type="button" aria-label={label} title={label} aria-expanded={outputs.length > 0}
          disabled={busy} className="rounded-full border border-current/30 p-3 disabled:opacity-50"
          onClick={() => outputs.length ? setOutputs([]) : void changeOutput()}>
          <IconSpeaker className="h-6 w-6" />
        </button>
      )}
      {outputs.map((device, index) => (
        <button key={device.deviceId} type="button" disabled={busy}
          className="rounded-lg border border-current/30 px-3 py-2" onClick={() => void changeOutput(device)}>
          {device.label || `${label} ${index + 1}`}
        </button>
      ))}
      {failed && <p role="status" className="text-sm">{errorLabel}</p>}
    </div>
  );
}
