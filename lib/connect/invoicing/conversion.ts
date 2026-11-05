function parseUnsignedInteger(
  value: string,
  field: string,
): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`${field} must be non-negative integer text`);
  }

  return BigInt(value);
}

/**
 * Converts invoice atomic units into Pi atomic units.
 * Rate = numerator / denominator.
 * Rounds to the nearest Pi atomic unit; exact halves round up.
 */
export function convertInvoiceAtomicToPi(
  invoiceAtomicAmount: string,
  rateNumerator: string,
  rateDenominator: string,
): string {
  const amount = parseUnsignedInteger(
    invoiceAtomicAmount,
    "Invoice amount",
  );
  const numerator = parseUnsignedInteger(
    rateNumerator,
    "Rate numerator",
  );
  const denominator = parseUnsignedInteger(
    rateDenominator,
    "Rate denominator",
  );

  const zero = BigInt(0);

  if (numerator === zero || denominator === zero) {
    throw new Error("Conversion rate must be positive");
  }

  const scaled = amount * numerator;
  const quotient = scaled / denominator;
  const remainder = scaled % denominator;

  const rounded =
    remainder * BigInt(2) >= denominator
      ? quotient + BigInt(1)
      : quotient;

  return rounded.toString();
}