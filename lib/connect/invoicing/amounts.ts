/**
 * Exact conversions between decimal text and atomic-unit text.
 * These functions never round or use floating-point arithmetic.
 */

function validateDecimals(decimals: number): void {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 18
  ) {
    throw new Error("Decimals must be an integer between 0 and 18");
  }
}

export function decimalToAtomic(
  value: string,
  decimals: number,
): string {
  validateDecimals(decimals);

  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(value)) {
    throw new Error("Amount must be non-negative decimal text");
  }

  const [whole, fraction = ""] = value.split(".");

  if (fraction.length > decimals) {
    throw new Error("Amount exceeds the supported decimal precision");
  }

  const atomic = whole + fraction.padEnd(decimals, "0");

  return atomic.replace(/^0+(?=\d)/, "");
}

export function atomicToDecimal(
  atomicAmount: string,
  decimals: number,
): string {
  validateDecimals(decimals);

  if (!/^(0|[1-9]\d*)$/.test(atomicAmount)) {
    throw new Error("Atomic amount must be non-negative integer text");
  }

  if (decimals === 0) {
    return atomicAmount;
  }

  const padded = atomicAmount.padStart(decimals + 1, "0");
  const separatorIndex = padded.length - decimals;

  return (
    padded.slice(0, separatorIndex) +
    "." +
    padded.slice(separatorIndex)
  );
}