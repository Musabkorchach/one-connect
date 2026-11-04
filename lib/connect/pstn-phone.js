import { parsePhoneNumberWithError } from "libphonenumber-js/max";

const allowedCountries = new Set([
  "FR", // France
  "SD", // Sudan
  "ER", // Eritrea
  "EG", // Egypt
  "ET", // Ethiopia
  "UG", // Uganda
]);

const allowedTypes = new Set([
  "FIXED_LINE",
  "MOBILE",
  "FIXED_LINE_OR_MOBILE",
  "VOIP",
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizePstnPhone(value) {
  if (typeof value !== "string" || value.length > 40) return null;

  let phone = value.trim().replace(/[\s().-]/g, "");

  if (phone.startsWith("00")) {
    phone = `+${phone.slice(2)}`;
  } else if (/^0[1-79]\d{8}$/.test(phone)) {
    // Preserve support for French national numbers.
    phone = `+33${phone.slice(1)}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(phone)) return null;

  try {
    const parsed = parsePhoneNumberWithError(phone, { extract: false });

    if (
      !parsed.country ||
      !allowedCountries.has(parsed.country) ||
      !parsed.isValid() ||
      !allowedTypes.has(parsed.getType()) ||
      parsed.number !== phone
    ) {
      return null;
    }

    if (parsed.country === "FR" && !/^\+33[1-79]\d{8}$/.test(phone)) {
      return null;
    }

    return parsed.number;
  } catch {
    return null;
  }
}