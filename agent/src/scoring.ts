import type { Reputation } from "./types.js";

/** Deterministic base score in [0,100]. Mirrors Underwriter.baseScore exactly. */
export function baseScore(rep: Reputation): number {
  let s = 50;
  s += rep.onTime * 4;
  s += rep.circlesCompleted * 8;
  s -= rep.late * 6;
  s -= rep.defaults * 25;
  if (s < 0) return 0;
  if (s > 100) return 100;
  return s;
}

/** Required collateral in token base units. Mirrors Underwriter.quote exactly. */
export function requiredCollateral(score: number, contributionAmount: bigint): bigint {
  let bps: bigint;
  if (score >= 80) bps = 5000n;
  else if (score >= 60) bps = 10000n;
  else if (score >= 40) bps = 20000n;
  else bps = 30000n;
  return (contributionAmount * bps) / 10000n;
}

export const MAX_DELTA = 15;

/** Clamp an AI-proposed score into the on-chain-enforced band around the base score. */
export function clampToBand(adjusted: number, base: number): number {
  const lo = Math.max(0, base - MAX_DELTA);
  const hi = Math.min(100, base + MAX_DELTA);
  return Math.min(hi, Math.max(lo, adjusted));
}
