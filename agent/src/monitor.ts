import type { Reputation } from "./types.js";
import { baseScore } from "./scoring.js";

export interface MemberRoundState {
  address: string;
  contributed: boolean;
  reputation: Reputation;
  contributionAmount: bigint;
  collateral: bigint;
}

export interface RiskAssessment {
  address: string;
  atRisk: boolean;
  riskScore: number; // 0..100, higher = more likely to default
  rationale: string;
}

export const RISK_THRESHOLD = 60;

/**
 * Deterministic per-round default-risk prediction. Mirrors the on-chain reliability signal:
 * riskScore = 100 - baseScore(reputation). A member who already contributed this round is not at
 * risk. Under-collateralization (collateral < one contribution) is surfaced as an aggravating note.
 */
export function assessDefaultRisk(state: MemberRoundState): RiskAssessment {
  const reliability = baseScore(state.reputation);
  const riskScore = 100 - reliability;

  if (state.contributed) {
    return {
      address: state.address,
      atRisk: false,
      riskScore,
      rationale: `Already contributed this round; no default risk.`,
    };
  }

  const underCollateralized = state.collateral < state.contributionAmount;
  const atRisk = riskScore >= RISK_THRESHOLD;

  const parts: string[] = [`reliability ${reliability}/100 (risk ${riskScore})`];
  if (state.reputation.defaults > 0) parts.push(`${state.reputation.defaults} prior default(s)`);
  if (underCollateralized) parts.push(`under-collateralized (${state.collateral} < ${state.contributionAmount})`);

  return {
    address: state.address,
    atRisk,
    riskScore,
    rationale: `${atRisk ? "AT RISK" : "OK"}: has not contributed; ${parts.join("; ")}.`,
  };
}
