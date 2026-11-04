import type { Device } from "@twilio/voice-sdk";

type DeviceConstructor = typeof Device;

let loading: Promise<DeviceConstructor> | null = null;

function getDevice(): DeviceConstructor | undefined {
  return (
    window as Window & {
      Twilio?: { Device?: DeviceConstructor };
    }
  ).Twilio?.Device;
}

export function loadTwilioVoice(): Promise<DeviceConstructor> {
  if (typeof window === "undefined") {
    return Promise.reject(
      new Error("Phone calling requires Pi Browser."),
    );
  }

  const existing = getDevice();
  if (existing) return Promise.resolve(existing);
  if (loading) return loading;

  loading = new Promise<DeviceConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src =
      "https://one-connect.onrender.com/vendor/twilio-voice-2.18.5.min.js";
    script.async = true;

    const cleanup = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };

    const fail = (message: string) => {
      cleanup();
      script.remove();
      reject(new Error(message));
    };

    const timer = setTimeout(() => {
      fail("Loading the phone calling library timed out.");
    }, 20_000);

    script.onload = () => {
      const Device = getDevice();

      if (!Device) {
        fail("The phone calling library did not initialize.");
        return;
      }

      cleanup();
      resolve(Device);
    };

    script.onerror = () => {
      fail("Unable to load the phone calling library.");
    };

    document.head.appendChild(script);
  }).catch((error) => {
    loading = null;
    throw error;
  });

  return loading;
}