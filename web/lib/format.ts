/**
 * Format a raw MXNB uint256 (6 decimals) to a human-readable string.
 * 400_000_000 → "400", 1_240_000_000 → "1,240", 50_500_000 → "50.5"
 */
export function formatMXNB(v: bigint): string {
  const whole = v / 1_000_000n;
  const frac = v % 1_000_000n;

  const wholeStr = whole.toLocaleString("en-US");

  if (frac === 0n) {
    return wholeStr;
  }

  // Pad to 6 digits, trim trailing zeros
  const fracStr = frac.toString().padStart(6, "0").replace(/0+$/, "");
  return `${wholeStr}.${fracStr}`;
}

/**
 * Compute the collateral multiplier as a display string.
 * Ratio is collateral / contribution expressed as a fraction with denominator 1.
 * Uses *10 math to get one decimal place without floats.
 * 50_000_000 / 100_000_000 → 0.5× ; 100/100 → 1× ; 200/100 → 2×
 */
export function collateralMultiplier(
  collateral: bigint,
  contribution: bigint
): string {
  if (contribution === 0n) return "—";
  const tenths = (collateral * 10n) / contribution; // e.g. 5 for 0.5x, 10 for 1x, 20 for 2x
  if (tenths % 10n === 0n) {
    return `${tenths / 10n}×`;
  }
  return `${tenths / 10n}.${tenths % 10n}×`;
}

/**
 * Map an AI score to a trust tier label.
 * >=80 → high, >=60 → mid, >=40 → low, <40 → flag
 */
export function trustTier(score: number): "high" | "mid" | "low" | "flag" {
  if (score >= 80) return "high";
  if (score >= 60) return "mid";
  if (score >= 40) return "low";
  return "flag";
}

/**
 * Shorten an Ethereum address: 0x1234…ABCD
 */
export function shortAddr(a: string): string {
  if (!a || a.length < 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
