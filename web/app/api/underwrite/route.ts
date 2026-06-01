/**
 * POST /api/underwrite
 *
 * Server-side Route Handler for signed underwriting decisions and risk flags.
 * Reads AI_SIGNER_KEY from server-side env (never exposed to the browser).
 *
 * SECURITY: the reputation / collateral / contribution status that drive the AI score are
 * read DIRECTLY FROM THE CHAIN here (the trusted source), keyed by circle + member — they are
 * NOT taken from the request body. The client only supplies identifiers (circle, member, round)
 * and a deadline. This makes "the AI scores from on-chain reputation" literally true, and means
 * a malicious caller cannot inflate a score by lying about reputation.
 *
 * Defense in depth: even if this route signed a wrong score, the Underwriter contract independently
 * recomputes baseScore from the SBT and rejects any adjustedScore outside [base ± MAX_DELTA].
 *
 * Body shapes:
 *   { kind: "decision", circle, member, deadline }
 *     → { adjustedScore, rationale, rationaleHash, deadline, signature }
 *   { kind: "riskflag", circle, member, deadline }
 *     → { atRisk, riskScore, rationale, rationaleHash, deadline, signature }
 *
 * Environment:
 *   AI_SIGNER_KEY  — server-only private key (no NEXT_PUBLIC_ prefix). See web/.env.local.example.
 */

import { NextResponse } from "next/server";
import type { Hex, Address } from "viem";
import { isAddress } from "viem";
import { buildSignedDecision, buildSignedRiskFlag, type Reputation } from "../../../lib/underwriter";
import { activeChain } from "../../../lib/chain";
import { addresses, abis } from "../../../lib/contracts";
import { serverClient } from "../../../lib/serverChain";

function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(v);
  throw new TypeError(`Cannot convert ${JSON.stringify(v)} to bigint`);
}

/** Read the member's reputation tuple from the on-chain ReputationSBT (the trusted source). */
async function readReputation(member: Address): Promise<Reputation> {
  const client = serverClient();
  const r = (await client.readContract({
    address: addresses.reputation,
    abi: abis.ReputationSBT,
    functionName: "reputation",
    args: [member],
  })) as readonly [bigint | number, bigint | number, bigint | number, bigint | number, bigint | number];
  return {
    roundsParticipated: Number(r[0]),
    onTime: Number(r[1]),
    late: Number(r[2]),
    defaults: Number(r[3]),
    circlesCompleted: Number(r[4]),
  };
}

/** Read circle-scoped facts (current round, the member's collateral + whether they contributed).
 *  Uses sequential reads (anvil does not deploy multicall3 by default). */
async function readCircleFacts(circle: Address, member: Address) {
  const client = serverClient();
  const tc = { address: circle, abi: abis.TandaCircle } as const;

  const currentRound = (await client.readContract({ ...tc, functionName: "currentRound" })) as bigint;
  const contributionAmount = (await client.readContract({ ...tc, functionName: "contributionAmount" })) as bigint;
  const collateral = (await client.readContract({ ...tc, functionName: "collateral", args: [member] })) as bigint;
  const contributed = (await client.readContract({
    ...tc,
    functionName: "contributedInRound",
    args: [currentRound, member],
  })) as boolean;
  return { currentRound, contributionAmount, collateral, contributed };
}

export async function POST(req: Request) {
  const signerKey = process.env.AI_SIGNER_KEY as Hex | undefined;
  if (!signerKey) {
    return NextResponse.json(
      { error: "AI_SIGNER_KEY is not set. Add it to web/.env.local (server-side only)." },
      { status: 500 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const kind = body.kind;
  const circle = body.circle as Address;
  const member = body.member as Address;
  const deadline = body.deadline;

  if (!circle || !isAddress(circle) || !member || !isAddress(member) || deadline === undefined) {
    return NextResponse.json(
      { error: "Missing/invalid fields: circle (address), member (address), deadline." },
      { status: 400 },
    );
  }

  try {
    if (kind === "decision") {
      // Reputation read from chain — NOT from the request body.
      const reputation = await readReputation(member);
      const result = await buildSignedDecision({
        privateKey: signerKey,
        chainId: activeChain.id,
        underwriterContract: addresses.underwriter,
        circle,
        member,
        reputation,
        deadline: toBigInt(deadline),
      });
      return NextResponse.json({
        adjustedScore: result.adjustedScore,
        rationale: result.rationale,
        rationaleHash: result.rationaleHash,
        deadline: result.deadline.toString(),
        signature: result.signature,
      });
    }

    if (kind === "riskflag") {
      // Reputation + circle facts read from chain — NOT from the request body.
      const reputation = await readReputation(member);
      const { currentRound, contributionAmount, collateral, contributed } = await readCircleFacts(circle, member);
      const result = await buildSignedRiskFlag({
        privateKey: signerKey,
        chainId: activeChain.id,
        underwriterContract: addresses.underwriter,
        circle,
        member,
        round: currentRound,
        reputation,
        contributionAmount,
        collateral,
        contributed,
        deadline: toBigInt(deadline),
      });
      return NextResponse.json({
        atRisk: result.atRisk,
        riskScore: result.riskScore,
        rationale: result.rationale,
        rationaleHash: result.rationaleHash,
        round: currentRound.toString(),
        deadline: result.deadline.toString(),
        signature: result.signature,
      });
    }

    return NextResponse.json(
      { error: `Unknown kind: "${String(kind)}". Expected "decision" or "riskflag".` },
      { status: 400 },
    );
  } catch (err) {
    return NextResponse.json({ error: `Underwrite failed: ${String(err)}` }, { status: 500 });
  }
}
