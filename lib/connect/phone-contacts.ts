import { getAppState, saveAppState } from "@/lib/api-client";
import { normalizePstnPhone } from "@/lib/connect/pstn-phone.js";

const STATE_KEY = "phone-contacts";

export type PhoneContact = {
  name: string;
  phone: string;
};

export async function loadPhoneContacts(
  sessionToken: string,
): Promise<PhoneContact[]> {
  const state = await getAppState(STATE_KEY, sessionToken);
  const items = state?.blob.items;
  if (!Array.isArray(items)) return [];

  const contacts = new Map<string, PhoneContact>();
  for (const item of items) {
    if (
      item &&
      typeof item.name === "string" &&
      typeof item.phone === "string" &&
      normalizePstnPhone(item.phone) === item.phone &&
      item.name.trim() &&
      !contacts.has(item.phone)
    ) {
      contacts.set(item.phone, {
        name: item.name.trim().slice(0, 80),
        phone: item.phone,
      });
    }
  }
  return [...contacts.values()];
}

export async function savePhoneContacts(
  contacts: PhoneContact[],
  sessionToken: string,
): Promise<void> {
  await saveAppState(STATE_KEY, { items: contacts }, sessionToken);
}