type OutputMediaElement = HTMLMediaElement & {
  setSinkId?: (deviceId: string) => Promise<void>;
};

type OutputMediaDevices = MediaDevices & {
  selectAudioOutput?: () => Promise<MediaDeviceInfo>;
};

export async function listCallAudioOutputs(
  element: HTMLMediaElement,
  devices: MediaDevices | undefined = navigator.mediaDevices,
): Promise<MediaDeviceInfo[]> {
  if (typeof (element as OutputMediaElement).setSinkId !== "function" || !devices?.enumerateDevices) return [];
  const outputs = new Map<string, MediaDeviceInfo>();
  for (const device of await devices.enumerateDevices()) {
    // These aliases can point to the same physical device.
    if (device.kind === "audiooutput" && device.deviceId && device.deviceId !== "default" &&
        device.deviceId !== "communications") outputs.set(device.deviceId, device);
  }
  return outputs.size > 1 ? [...outputs.values()] : [];
}

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

  const outputs = await listCallAudioOutputs(element, devices);
  if (!outputs.length) throw new Error("This browser is not exposing a choice of audio outputs.");
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