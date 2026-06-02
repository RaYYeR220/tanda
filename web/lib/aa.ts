/**
 * Account-abstraction (ERC-4337) gasless onboarding — "Únete con passkey (sin gas)".
 *
 * Progressive enhancement over the normal EOA flow: a member can join a circle using only a
 * device passkey (WebAuthn) — no browser wallet, no ETH for gas, no pre-funded MXNB. The whole
 * onboarding is a single Pimlico-sponsored UserOperation that batches:
 *     mint(self, collateralBuffer) → approve(circle, max) → join(score, …, signature)
 *
 * Stack: pure viem (`viem/account-abstraction`) + a Coinbase Smart Account owned by the passkey,
 * with Pimlico as both bundler and paymaster. No permissionless.js needed (viem ≥2.5 ships the
 * AA primitives natively). The EOA flow in useWriteTanda.ts is untouched — this is additive.
 *
 * Env (web/.env.local):
 *   NEXT_PUBLIC_BUNDLER_URL              Pimlico v2 URL, e.g.
 *                                        https://api.pimlico.io/v2/arbitrum-sepolia/rpc?apikey=KEY
 *   NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY  (optional) sponsorship policy id "sp_..." if your
 *                                        Pimlico account requires one to sponsor.
 */

import {
  createClient,
  createPublicClient,
  http,
  maxUint256,
  type Address,
  type Hex,
} from "viem";
import {
  createBundlerClient,
  toCoinbaseSmartAccount,
  createWebAuthnCredential,
  toWebAuthnAccount,
  type WebAuthnAccount,
} from "viem/account-abstraction";
import { activeChain, rpcUrl } from "./chain";
import { addresses, abis } from "./contracts";

const CREDENTIAL_STORAGE_KEY = "tanda.passkey.credential.v1";

/** Pimlico v2 endpoint (bundler + paymaster in one URL). */
function bundlerUrl(): string {
  const url = process.env.NEXT_PUBLIC_BUNDLER_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_BUNDLER_URL is not set. Add your Pimlico Arbitrum-Sepolia URL to web/.env.local.",
    );
  }
  return url;
}

type StoredCredential = { id: string; publicKey: Hex };

/** Persist the passkey so the same smart account is reused across reloads in a browser. */
function loadCredential(): StoredCredential | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(CREDENTIAL_STORAGE_KEY);
  return raw ? (JSON.parse(raw) as StoredCredential) : null;
}

function saveCredential(c: StoredCredential) {
  window.localStorage.setItem(CREDENTIAL_STORAGE_KEY, JSON.stringify(c));
}

/**
 * Get (or create) the device passkey and wrap it as a WebAuthn signer.
 * Creating a credential triggers the OS passkey prompt (Face ID / Touch ID / security key).
 */
export async function getPasskeyOwner(opts?: { displayName?: string; forceNew?: boolean }): Promise<WebAuthnAccount> {
  const existing = opts?.forceNew ? null : loadCredential();
  if (existing) {
    return toWebAuthnAccount({ credential: existing });
  }
  const credential = await createWebAuthnCredential({
    name: opts?.displayName ?? "Tanda — passkey",
  });
  saveCredential({ id: credential.id, publicKey: credential.publicKey });
  return toWebAuthnAccount({ credential });
}

/** A read-only client on the active chain. */
function publicClient() {
  return createPublicClient({ chain: activeChain, transport: http(rpcUrl) });
}

/** Build the passkey-owned Coinbase Smart Account (counterfactual until the first userop). */
export async function getSmartAccount(owner: WebAuthnAccount) {
  return toCoinbaseSmartAccount({
    client: publicClient(),
    owners: [owner],
    version: "1.1",
  });
}

type PimlicoGasTier = { maxFeePerGas: Hex; maxPriorityFeePerGas: Hex };
type PimlicoGasPrice = { slow: PimlicoGasTier; standard: PimlicoGasTier; fast: PimlicoGasTier };

/** A bundler client wired to Pimlico for both submission and paymaster sponsorship. */
function bundlerClient(account: Awaited<ReturnType<typeof getSmartAccount>>) {
  const url = bundlerUrl();
  const policyId = process.env.NEXT_PUBLIC_PIMLICO_SPONSORSHIP_POLICY;
  // Pimlico rejects a userop whose priority fee is below the network minimum, so the fees
  // must come from Pimlico's own `pimlico_getUserOperationGasPrice` (viem defaults to 0 on L2s).
  const pimlico = createClient({ transport: http(url) });
  return createBundlerClient({
    account,
    client: publicClient(),
    transport: http(url),
    paymaster: true,
    paymasterContext: policyId ? { sponsorshipPolicyId: policyId } : undefined,
    userOperation: {
      estimateFeesPerGas: async () => {
        const request = pimlico.request as (args: { method: string; params?: unknown[] }) => Promise<unknown>;
        const gp = (await request({ method: "pimlico_getUserOperationGasPrice" })) as PimlicoGasPrice;
        return {
          maxFeePerGas: BigInt(gp.standard.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(gp.standard.maxPriorityFeePerGas),
        };
      },
    },
  });
}

/** Signed underwriting decision shape returned by /api/underwrite (kind: "decision"). */
export type SignedDecision = {
  adjustedScore: number;
  rationale: string;
  rationaleHash: Hex;
  deadline: string;
  signature: Hex;
};

/** Fetch an AI-signed join decision for the (counterfactual) smart-account address. */
async function fetchDecision(circle: Address, member: Address): Promise<SignedDecision> {
  const deadline = Math.floor(Date.now() / 1000) + 3600;
  const res = await fetch("/api/underwrite", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "decision", circle, member, deadline }),
  });
  if (!res.ok) {
    const { error } = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(`Underwriter API failed: ${error}`);
  }
  return (await res.json()) as SignedDecision;
}

export type GaslessJoinResult = {
  smartAccount: Address;
  userOpHash: Hex;
  txHash: Hex;
  adjustedScore: number;
  rationale: string;
};

/**
 * Join a circle gaslessly with a passkey. One sponsored UserOperation does everything:
 * mint demo MXNB to the new smart account, approve the circle, and join with the AI signature.
 */
export async function joinCircleGasless(opts: {
  circle: Address;
  displayName?: string;
  /** MXNB (6dp) to mint as collateral buffer; covers up to 3× of a 100-MXNB circle by default. */
  mintAmount?: bigint;
}): Promise<GaslessJoinResult> {
  const { circle } = opts;
  const owner = await getPasskeyOwner({ displayName: opts.displayName });
  const account = await getSmartAccount(owner);
  const member = account.address;

  // AI scores the brand-new account (cold-start → base 50, signed within band).
  const decision = await fetchDecision(circle, member);

  const mintAmount = opts.mintAmount ?? 10_000_000_000n; // 10 000 MXNB buffer
  const client = bundlerClient(account);

  const userOpHash = await client.sendUserOperation({
    calls: [
      {
        to: addresses.mxnb,
        abi: abis.MockMXNB,
        functionName: "mint",
        args: [member, mintAmount],
      },
      {
        to: addresses.mxnb,
        abi: abis.MockMXNB,
        functionName: "approve",
        args: [circle, maxUint256],
      },
      {
        to: circle,
        abi: abis.TandaCircle,
        functionName: "join",
        args: [
          BigInt(decision.adjustedScore),
          decision.rationaleHash,
          BigInt(decision.deadline),
          decision.signature,
        ],
      },
    ],
  });

  const receipt = await client.waitForUserOperationReceipt({ hash: userOpHash });

  return {
    smartAccount: member,
    userOpHash,
    txHash: receipt.receipt.transactionHash,
    adjustedScore: decision.adjustedScore,
    rationale: decision.rationale,
  };
}
