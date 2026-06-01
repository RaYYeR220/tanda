/**
 * POST /api/underwrite
 *
 * Server-side Route Handler for signed underwriting decisions and risk flags.
 * Reads AI_SIGNER_KEY from server-side env (never exposed to the browser).
 *
 * Body shapes:
 *
 *   { kind: "decision", circle, member, reputation, deadline }
 *   → { adjustedScore, rationale, rationaleHash, deadline, signature }
 *
 *   { kind: "riskflag", circle, member, round, reputation,
 *     contributionAmount, collateral, contributed, deadline }
 *   → { atRisk, riskScore, rationale, rationaleHash, deadline, signature }
 *
 * Environment:
 *   AI_SIGNER_KEY  — server-only private key (no NEXT_PUBLIC_ prefix).
 *                    For the local anvil demo this is anvil account #0's key.
 *                    See web/.env.local.example.
 */

import { NextResponse } from "next/server";
import type { Hex, Address } from "viem";
import { buildSignedDecision, buildSignedRiskFlag } from "../../../lib/underwriter";
import { activeChain } from "../../../lib/chain";
import { addresses } from "../../../lib/contracts";
import type { Reputation } from "../../../lib/underwriter";

// Bigint-aware JSON reviver: strings that look like "123n" or plain numeric strings
// for bigint fields are converted. We handle deadline/round/amounts explicitly below.
function toBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "string") return BigInt(v);
  if (typeof v === "number") return BigInt(v);
  throw new TypeError(`Cannot convert ${JSON.stringify(v)} to bigint`);
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

  const { kind } = body;

  if (kind === "decision") {
    const { circle, member, reputation, deadline } = body as {
      circle: Address;
      member: Address;
      reputation: Reputation;
      deadline: string | number;
    };

    if (!circle || !member || !reputation || deadline === undefined) {
      return NextResponse.json(
        { error: "Missing required fields: circle, member, reputation, deadline." },
        { status: 400 },
      );
    }

    try {
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
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to build signed decision: ${String(err)}` },
        { status: 500 },
      );
    }
  }

  if (kind === "riskflag") {
    const { circle, member, round, reputation, contributionAmount, collateral, contributed, deadline } =
      body as {
        circle: Address;
        member: Address;
        round: string | number;
        reputation: Reputation;
        contributionAmount: string | number;
        collateral: string | number;
        contributed: boolean;
        deadline: string | number;
      };

    if (
      !circle ||
      !member ||
      round === undefined ||
      !reputation ||
      contributionAmount === undefined ||
      collateral === undefined ||
      contributed === undefined ||
      deadline === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: circle, member, round, reputation, contributionAmount, collateral, contributed, deadline.",
        },
        { status: 400 },
      );
    }

    try {
      const result = await buildSignedRiskFlag({
        privateKey: signerKey,
        chainId: activeChain.id,
        underwriterContract: addresses.underwriter,
        circle,
        member,
        round: toBigInt(round),
        reputation,
        contributionAmount: toBigInt(contributionAmount),
        collateral: toBigInt(collateral),
        contributed: Boolean(contributed),
        deadline: toBigInt(deadline),
      });

      return NextResponse.json({
        atRisk: result.atRisk,
        riskScore: result.riskScore,
        rationale: result.rationale,
        rationaleHash: result.rationaleHash,
        deadline: result.deadline.toString(),
        signature: result.signature,
      });
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to build signed risk flag: ${String(err)}` },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: `Unknown kind: "${kind}". Expected "decision" or "riskflag".` },
    { status: 400 },
  );
}
