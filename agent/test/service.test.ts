import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, keccak256, toBytes } from "viem";
import {
  DECISION_DOMAIN,
  DECISION_TYPES,
  RISK_FLAG_TYPES,
} from "../src/sign.js";
import { buildSignedDecision, buildSignedRiskFlag } from "../src/runtime/service.js";
import type { Reputation } from "../src/types.js";

// Anvil account #1 private key
const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const account = privateKeyToAccount(PK);

const CHAIN_ID = 31337;
const UNDERWRITER = "0x1111111111111111111111111111111111111111" as const;
const CIRCLE = "0x2222222222222222222222222222222222222222" as const;
const MEMBER = "0x3333333333333333333333333333333333333333" as const;
const DEADLINE = 9999999999n;

const freshRep: Reputation = {
  roundsParticipated: 0,
  onTime: 0,
  late: 0,
  defaults: 0,
  circlesCompleted: 0,
};

const defaultedRep: Reputation = {
  roundsParticipated: 3,
  onTime: 1,
  late: 1,
  defaults: 1,
  circlesCompleted: 0,
};

describe("buildSignedDecision (deterministic, no client)", () => {
  it("returns adjustedScore 50 for a fresh reputation and a valid signature", async () => {
    const result = await buildSignedDecision({
      account,
      chainId: CHAIN_ID,
      underwriter: UNDERWRITER,
      circle: CIRCLE,
      member: MEMBER,
      reputation: freshRep,
      walletMeta: { ageDays: 0, txCount: 0, mxnbBalance: 0n },
      deadline: DEADLINE,
      // no client → deterministic path
    });

    expect(result.adjustedScore).toBe(50);
    expect(typeof result.rationale).toBe("string");
    expect(result.rationaleHash).toMatch(/^0x[0-9a-f]{64}$/i);
    expect(result.deadline).toBe(DEADLINE);

    // Reconstruct the message and verify the signature recovers to the signer
    const message = {
      circle: CIRCLE,
      member: MEMBER,
      adjustedScore: 50n,
      rationaleHash: result.rationaleHash,
      deadline: DEADLINE,
    } as const;

    const recovered = await recoverTypedDataAddress({
      domain: DECISION_DOMAIN(CHAIN_ID, UNDERWRITER),
      types: DECISION_TYPES,
      primaryType: "Decision",
      message,
      signature: result.signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});

describe("buildSignedRiskFlag", () => {
  it("returns atRisk === true for a member with a prior default who has not contributed", async () => {
    // defaultedRep: base = 50 + 1*4 - 1*6 - 1*25 = 23 → riskScore = 77 → atRisk (>= 60)
    const result = await buildSignedRiskFlag({
      account,
      chainId: CHAIN_ID,
      underwriter: UNDERWRITER,
      circle: CIRCLE,
      member: MEMBER,
      round: 1n,
      reputation: defaultedRep,
      contributionAmount: 100_000_000n,
      collateral: 50_000_000n,
      contributed: false,
      deadline: DEADLINE,
    });

    expect(result.atRisk).toBe(true);
    expect(result.riskScore).toBeGreaterThanOrEqual(60);
    expect(typeof result.rationale).toBe("string");

    // Verify signature recovers to the signer
    const message = {
      circle: CIRCLE,
      member: MEMBER,
      round: 1n,
      rationaleHash: result.rationaleHash,
      deadline: DEADLINE,
    } as const;

    const recovered = await recoverTypedDataAddress({
      domain: DECISION_DOMAIN(CHAIN_ID, UNDERWRITER),
      types: RISK_FLAG_TYPES,
      primaryType: "RiskFlag",
      message,
      signature: result.signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });

  it("returns atRisk === false for a fresh member who has already contributed", async () => {
    const result = await buildSignedRiskFlag({
      account,
      chainId: CHAIN_ID,
      underwriter: UNDERWRITER,
      circle: CIRCLE,
      member: MEMBER,
      round: 2n,
      reputation: freshRep,
      contributionAmount: 100_000_000n,
      collateral: 200_000_000n,
      contributed: true,
      deadline: DEADLINE,
    });

    expect(result.atRisk).toBe(false);

    // Verify signature recovers to the signer
    const message = {
      circle: CIRCLE,
      member: MEMBER,
      round: 2n,
      rationaleHash: result.rationaleHash,
      deadline: DEADLINE,
    } as const;

    const recovered = await recoverTypedDataAddress({
      domain: DECISION_DOMAIN(CHAIN_ID, UNDERWRITER),
      types: RISK_FLAG_TYPES,
      primaryType: "RiskFlag",
      message,
      signature: result.signature,
    });

    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
