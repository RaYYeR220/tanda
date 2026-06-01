import type { Account, Address, Hex } from "viem";
import { keccak256, toBytes } from "viem";
import type Anthropic from "@anthropic-ai/sdk";
import type { Reputation, WalletMeta } from "../types.js";
import { baseScore } from "../scoring.js";
import { underwrite } from "../underwrite.js";
import { signDecision, signRiskFlag } from "../sign.js";
import { assessDefaultRisk } from "../monitor.js";

// ─── buildSignedDecision ─────────────────────────────────────────────────────

export interface BuildSignedDecisionParams {
  account: Account;
  chainId: number;
  underwriter: Address;
  circle: Address;
  member: Address;
  reputation: Reputation;
  walletMeta: WalletMeta;
  deadline: bigint;
  client?: Anthropic;
}

export interface SignedDecisionResult {
  adjustedScore: number;
  rationale: string;
  rationaleHash: Hex;
  deadline: bigint;
  signature: Hex;
}

export async function buildSignedDecision(
  params: BuildSignedDecisionParams,
): Promise<SignedDecisionResult> {
  const { account, chainId, underwriter, circle, member, reputation, walletMeta, deadline, client } =
    params;

  let adjustedScore: number;
  let rationale: string;

  if (client) {
    const decision = await underwrite(client, reputation, walletMeta);
    adjustedScore = decision.adjustedScore;
    rationale = decision.rationale;
  } else {
    adjustedScore = baseScore(reputation);
    rationale = "Deterministic score from on-chain reputation.";
  }

  const rationaleHash = keccak256(toBytes(rationale));

  const signature = await signDecision(account, chainId, underwriter, {
    circle,
    member,
    adjustedScore: BigInt(adjustedScore),
    rationaleHash,
    deadline,
  });

  return { adjustedScore, rationale, rationaleHash, deadline, signature };
}

// ─── buildSignedRiskFlag ──────────────────────────────────────────────────────

export interface BuildSignedRiskFlagParams {
  account: Account;
  chainId: number;
  underwriter: Address;
  circle: Address;
  member: Address;
  round: bigint;
  reputation: Reputation;
  contributionAmount: bigint;
  collateral: bigint;
  contributed: boolean;
  deadline: bigint;
}

export interface SignedRiskFlagResult {
  rationaleHash: Hex;
  deadline: bigint;
  signature: Hex;
  atRisk: boolean;
  riskScore: number;
  rationale: string;
}

export async function buildSignedRiskFlag(
  params: BuildSignedRiskFlagParams,
): Promise<SignedRiskFlagResult> {
  const {
    account,
    chainId,
    underwriter,
    circle,
    member,
    round,
    reputation,
    contributionAmount,
    collateral,
    contributed,
    deadline,
  } = params;

  const assessment = assessDefaultRisk({
    address: member,
    contributed,
    reputation,
    contributionAmount,
    collateral,
  });

  const { atRisk, riskScore, rationale } = assessment;
  const rationaleHash = keccak256(toBytes(rationale));

  const signature = await signRiskFlag(account, chainId, underwriter, {
    circle,
    member,
    round,
    rationaleHash,
    deadline,
  });

  return { rationaleHash, deadline, signature, atRisk, riskScore, rationale };
}
