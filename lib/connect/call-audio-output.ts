type OutputMediaElement = HTMLMediaElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

type OutputMediaDevices = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};

export async function getCallAudioOutputs(
  element: HTMLMediaElement,
): Promise<MediaDeviceInfo[]> {
  const outputElement = element as OutputMediaElement;

  if (typeof outputElement.setSinkId !== "function") {
    throw new Error(
      "This browser does not support changing the call audio output.",
    );
  }

  const devices = navigator.mediaDevices as
    | OutputMediaDevices
    | undefined;

  if (!devices) {
    throw new Error("Audio output selection is unavailable.");
  }

  if (typeof devices.selectAudioOutput === "function") {
    const selected = await devices.selectAudioOutput();
    return [selected];
  }

  const available = await devices.enumerateDevices();
  const outputs = available.filter(
    (device) => device.kind === "audiooutput",
  );

  if (outputs.length === 0) {
    throw new Error(
      "This browser does not expose any selectable audio outputs.",
    );
  }

  return outputs;
}

export async function setCallAudioOutput(
  element: HTMLMediaElement,
  deviceId: string,
): Promise<void> {
  const outputElement = element as OutputMediaElement;

  if (typeof outputElement.setSinkId !== "function") {
    throw new Error("Audio output selection is unavailable.");
  }

  await outputElement.setSinkId(deviceId);
}