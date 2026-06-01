/**
 * web/lib/underwriter.ts
 *
 * Self-contained signing utilities for Tanda underwriting decisions and risk flags.
 * Mirrors agent/src/{scoring,monitor,sign}.ts — those modules are the source of truth;
 * this file exists solely to keep the web app free of cross-package build dependencies.
 *
 * IMPORTANT: This file is server-side only (used in app/api/underwrite/route.ts).
 * Never import it from client components.
 */

import { keccak256, toBytes, type Hex, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";

// ─── Types (mirrors agent/src/types.ts) ──────────────────────────────────────

export interface Reputation {
  roundsParticipated: number;
  onTime: number;
  late: number;
  defaults: number;
  circlesCompleted: number;
}

export interface WalletMeta {
  ageDays: number;
  txCount: number;
  mxnbBalance: bigint;
}

// ─── Scoring (mirrors agent/src/scoring.ts + Underwriter.sol) ────────────────

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

export function requiredCollateral(score: number, contributionAmount: bigint): bigint {
  let bps: bigint;
  if (score >= 80) bps = 5000n;
  else if (score >= 60) bps = 10000n;
  else if (score >= 40) bps = 20000n;
  else bps = 30000n;
  return (contributionAmount * bps) / 10000n;
}

export const MAX_DELTA = 15;

export function clampToBand(adjusted: number, base: number): number {
  const lo = Math.max(0, base - MAX_DELTA);
  const hi = Math.min(100, base + MAX_DELTA);
  return Math.min(hi, Math.max(lo, adjusted));
}

// ─── Risk assessment (mirrors agent/src/monitor.ts) ──────────────────────────

export const RISK_THRESHOLD = 60;

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
  riskScore: number;
  rationale: string;
}

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
  if (underCollateralized)
    parts.push(`under-collateralized (${state.collateral} < ${state.contributionAmount})`);

  return {
    address: state.address,
    atRisk,
    riskScore,
    rationale: `${atRisk ? "AT RISK" : "OK"}: has not contributed; ${parts.join("; ")}.`,
  };
}

// ─── EIP-712 domain + types (mirrors agent/src/sign.ts) ──────────────────────

export const DECISION_TYPES = {
  Decision: [
    { name: "circle", type: "address" },
    { name: "member", type: "address" },
    { name: "adjustedScore", type: "uint256" },
    { name: "rationaleHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export const RISK_FLAG_TYPES = {
  RiskFlag: [
    { name: "circle", type: "address" },
    { name: "member", type: "address" },
    { name: "round", type: "uint256" },
    { name: "rationaleHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export function DECISION_DOMAIN(chainId: number, verifyingContract: Address) {
  return {
    name: "TandaUnderwriter",
    version: "1",
    chainId,
    verifyingContract,
  } as const;
}

// ─── High-level builders ──────────────────────────────────────────────────────

export interface SignedDecisionResult {
  adjustedScore: number;
  rationale: string;
  rationaleHash: Hex;
  deadline: bigint;
  signature: Hex;
}

/**
 * Deterministic (no AI) signed underwriting decision.
 * Used by the /api/underwrite route; the Claude path lives in the agent package.
 */
export async function buildSignedDecision(params: {
  privateKey: Hex;
  chainId: number;
  underwriterContract: Address;
  circle: Address;
  member: Address;
  reputation: Reputation;
  deadline: bigint;
}): Promise<SignedDecisionResult> {
  const { privateKey, chainId, underwriterContract, circle, member, reputation, deadline } = params;

  const account = privateKeyToAccount(privateKey);
  const adjustedScore = baseScore(reputation);
  const rationale = "Deterministic score from on-chain reputation.";
  const rationaleHash = keccak256(toBytes(rationale));

  const signature = await account.signTypedData({
    domain: DECISION_DOMAIN(chainId, underwriterContract),
    types: DECISION_TYPES,
    primaryType: "Decision",
    message: {
      circle,
      member,
      adjustedScore: BigInt(adjustedScore),
      rationaleHash,
      deadline,
    },
  });

  return { adjustedScore, rationale, rationaleHash, deadline, signature };
}

export interface SignedRiskFlagResult {
  rationaleHash: Hex;
  deadline: bigint;
  signature: Hex;
  atRisk: boolean;
  riskScore: number;
  rationale: string;
}

export async function buildSignedRiskFlag(params: {
  privateKey: Hex;
  chainId: number;
  underwriterContract: Address;
  circle: Address;
  member: Address;
  round: bigint;
  reputation: Reputation;
  contributionAmount: bigint;
  collateral: bigint;
  contributed: boolean;
  deadline: bigint;
}): Promise<SignedRiskFlagResult> {
  const {
    privateKey,
    chainId,
    underwriterContract,
    circle,
    member,
    round,
    reputation,
    contributionAmount,
    collateral,
    contributed,
    deadline,
  } = params;

  const account = privateKeyToAccount(privateKey);

  const assessment = assessDefaultRisk({
    address: member,
    contributed,
    reputation,
    contributionAmount,
    collateral,
  });

  const { atRisk, riskScore, rationale } = assessment;
  const rationaleHash = keccak256(toBytes(rationale));

  const signature = await account.signTypedData({
    domain: DECISION_DOMAIN(chainId, underwriterContract),
    types: RISK_FLAG_TYPES,
    primaryType: "RiskFlag",
    message: { circle, member, round, rationaleHash, deadline },
  });

  return { rationaleHash, deadline, signature, atRisk, riskScore, rationale };
}
