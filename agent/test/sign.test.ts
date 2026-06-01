import { describe, it, expect } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { recoverTypedDataAddress, keccak256, toBytes } from "viem";
import { signDecision, DECISION_DOMAIN, DECISION_TYPES, signRiskFlag, RISK_FLAG_TYPES } from "../src/sign.js";

const PK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

describe("signDecision EIP-712", () => {
  it("produces a signature that recovers to the signer", async () => {
    const account = privateKeyToAccount(PK);
    const chainId = 421614;
    const verifyingContract = "0x1111111111111111111111111111111111111111";

    const message = {
      circle: "0x2222222222222222222222222222222222222222",
      member: "0x3333333333333333333333333333333333333333",
      adjustedScore: 62n,
      rationaleHash: keccak256(toBytes("reason")),
      deadline: 9999999999n,
    } as const;

    const sig = await signDecision(account, chainId, verifyingContract, message);

    const recovered = await recoverTypedDataAddress({
      domain: DECISION_DOMAIN(chainId, verifyingContract),
      types: DECISION_TYPES,
      primaryType: "Decision",
      message,
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});

describe("signRiskFlag EIP-712", () => {
  it("produces a signature that recovers to the signer", async () => {
    const account = privateKeyToAccount(
      "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    );
    const chainId = 421614;
    const verifyingContract = "0x1111111111111111111111111111111111111111" as const;
    const message = {
      circle: "0x2222222222222222222222222222222222222222",
      member: "0x3333333333333333333333333333333333333333",
      round: 2n,
      rationaleHash: keccak256(toBytes("risk")),
      deadline: 9999999999n,
    } as const;

    const sig = await signRiskFlag(account, chainId, verifyingContract, message);
    const recovered = await recoverTypedDataAddress({
      domain: DECISION_DOMAIN(chainId, verifyingContract),
      types: RISK_FLAG_TYPES,
      primaryType: "RiskFlag",
      message,
      signature: sig,
    });
    expect(recovered.toLowerCase()).toBe(account.address.toLowerCase());
  });
});
