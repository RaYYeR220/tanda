import { createPublicClient, http, type Address, type PublicClient } from "viem";
import type { Reputation, WalletMeta } from "./types.js";

const SBT_ABI = [
  {
    type: "function",
    name: "reputation",
    stateMutability: "view",
    inputs: [{ name: "member", type: "address" }],
    outputs: [
      { name: "roundsParticipated", type: "uint32" },
      { name: "onTime", type: "uint32" },
      { name: "late", type: "uint32" },
      { name: "defaults", type: "uint32" },
      { name: "circlesCompleted", type: "uint32" },
    ],
  },
] as const;

export function makeClient(rpcUrl: string): PublicClient {
  return createPublicClient({ transport: http(rpcUrl) });
}

export async function readReputation(
  client: PublicClient,
  sbt: Address,
  member: Address,
): Promise<Reputation> {
  const r = (await client.readContract({
    address: sbt,
    abi: SBT_ABI,
    functionName: "reputation",
    args: [member],
  })) as readonly [number, number, number, number, number];
  return {
    roundsParticipated: Number(r[0]),
    onTime: Number(r[1]),
    late: Number(r[2]),
    defaults: Number(r[3]),
    circlesCompleted: Number(r[4]),
  };
}

export async function readWalletMeta(
  client: PublicClient,
  member: Address,
): Promise<WalletMeta> {
  const txCount = await client.getTransactionCount({ address: member });
  const balance = await client.getBalance({ address: member });
  return { ageDays: 0, txCount, mxnbBalance: balance };
}
