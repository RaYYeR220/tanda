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

// ─── AI scoring (Gemini via OpenRouter) ──────────────────────────────────────
// When OPENROUTER_API_KEY is set, an LLM adjusts the deterministic base score WITHIN the
// trust-minimization band and writes a rationale citing the on-chain signals. The on-chain
// Underwriter independently re-derives the base and rejects anything outside [base ± MAX_DELTA],
// so the LLM can nuance but never fabricate. Falls back to the deterministic base on any failure.

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-3-flash-preview";

export interface AiDecision {
  adjustedScore: number;
  rationale: string;
  usedAI: boolean;
}

/** Best-effort JSON extraction (handles models that wrap output in prose / markdown fences). */
function parseJsonLoose(s: string): { adjustedScore?: unknown; rationale?: unknown } | null {
  try {
    return JSON.parse(s);
  } catch {
    /* fall through */
  }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* ignore */
    }
  }
  return null;
}

/** Ask the LLM (OpenRouter) to adjust within the band; deterministic fallback on no key / error. */
export async function assessScore(rep: Reputation, meta?: WalletMeta): Promise<AiDecision> {
  const base = baseScore(rep);
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return { adjustedScore: base, rationale: "Deterministic score from on-chain reputation.", usedAI: false };
  }

  try {
    const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
    const res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://github.com/RaYYeR220/tanda",
        "X-Title": "Tanda",
      },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              `You are the AI underwriter for an on-chain Mexican savings circle (tanda). ` +
              `Reply with ONLY a JSON object: {"adjustedScore": <integer 0-100>, "rationale": "<1-2 sentences>"}. ` +
              `adjustedScore MUST stay within +/-15 of the provided base score.`,
          },
          {
            role: "user",
            content:
              `Deterministic base score (from on-chain reputation): ${base}/100.\n` +
              `On-chain reputation: ${JSON.stringify(rep)}.\n` +
              (meta
                ? `Wallet metadata: ageDays=${meta.ageDays}, txCount=${meta.txCount}, ethBalanceWei=${meta.mxnbBalance}.\n`
                : ``) +
              `Adjust within +/-15 of the base for cold-start nuance ` +
              `(a brand-new but active wallet is less risky than a dormant one), and cite the signals you used.`,
          },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = typeof content === "string" ? parseJsonLoose(content) : null;
    if (!parsed || !Number.isFinite(Number(parsed.adjustedScore))) throw new Error("malformed LLM output");

    return {
      adjustedScore: clampToBand(Math.round(Number(parsed.adjustedScore)), base),
      rationale:
        typeof parsed.rationale === "string" ? parsed.rationale : `AI score within band of base ${base}.`,
      usedAI: true,
    };
  } catch {
    return {
      adjustedScore: base,
      rationale: `Deterministic fallback (LLM unavailable): base score ${base} from on-chain reputation.`,
      usedAI: false,
    };
  }
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
 * Signed underwriting decision. Uses Claude to nuance the score within the band when
 * ANTHROPIC_API_KEY is set (see assessScore); deterministic base otherwise. Either way the
 * on-chain Underwriter clamps the signed score to [base ± MAX_DELTA].
 */
export async function buildSignedDecision(params: {
  privateKey: Hex;
  chainId: number;
  underwriterContract: Address;
  circle: Address;
  member: Address;
  reputation: Reputation;
  walletMeta?: WalletMeta;
  deadline: bigint;
}): Promise<SignedDecisionResult> {
  const { privateKey, chainId, underwriterContract, circle, member, reputation, walletMeta, deadline } =
    params;

  const account = privateKeyToAccount(privateKey);
  const decision = await assessScore(reputation, walletMeta);
  const adjustedScore = decision.adjustedScore;
  const rationale = decision.rationale;
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
