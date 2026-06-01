import type { Account, Address, Hex } from "viem";

export const DECISION_TYPES = {
  Decision: [
    { name: "circle", type: "address" },
    { name: "member", type: "address" },
    { name: "adjustedScore", type: "uint256" },
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

export interface DecisionMessage {
  circle: Address;
  member: Address;
  adjustedScore: bigint;
  rationaleHash: Hex;
  deadline: bigint;
}

/** Sign an Underwriter Decision via EIP-712. Returns a 65-byte signature hex. */
export async function signDecision(
  account: Account,
  chainId: number,
  verifyingContract: Address,
  message: DecisionMessage,
): Promise<Hex> {
  if (!account.signTypedData) throw new Error("account cannot signTypedData");
  return account.signTypedData({
    domain: DECISION_DOMAIN(chainId, verifyingContract),
    types: DECISION_TYPES,
    primaryType: "Decision",
    message,
  });
}
