import type Anthropic from "@anthropic-ai/sdk";
import type { Reputation, WalletMeta, UnderwritingDecision } from "./types.js";
import { baseScore, clampToBand } from "./scoring.js";

const DECISION_TOOL = {
  name: "submit_decision",
  description: "Submit the final underwriting decision for this member.",
  input_schema: {
    type: "object" as const,
    properties: {
      adjustedScore: {
        type: "integer",
        minimum: 0,
        maximum: 100,
        description: "Final reliability score, 0-100. Stay within +/-15 of the provided base score.",
      },
      rationale: {
        type: "string",
        description: "One or two sentences citing the on-chain signals behind the score.",
      },
    },
    required: ["adjustedScore", "rationale"],
  },
};

const MODEL = "claude-opus-4-8";

/**
 * Ask Claude to adjust the deterministic base score within the trust-minimization band.
 * Falls back to the base score (with a canned rationale) if the LLM call fails.
 */
export async function underwrite(
  client: Anthropic,
  rep: Reputation,
  meta: WalletMeta,
): Promise<UnderwritingDecision> {
  const base = baseScore(rep);

  try {
    const msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      tools: [DECISION_TOOL],
      tool_choice: { type: "tool", name: "submit_decision" },
      messages: [
        {
          role: "user",
          content:
            `You are underwriting a member of an on-chain savings circle (tanda).\n` +
            `Deterministic base score (from on-chain reputation): ${base}/100.\n` +
            `On-chain reputation: ${JSON.stringify(rep)}.\n` +
            `Wallet metadata: ageDays=${meta.ageDays}, txCount=${meta.txCount}, mxnbBalance=${meta.mxnbBalance}.\n` +
            `Adjust the score within +/-15 of the base score to reflect cold-start nuance ` +
            `(a brand-new but active wallet is less risky than a dormant one). ` +
            `Cite the signals you used. Submit via submit_decision.`,
        },
      ],
    });

    const block = msg.content.find((b: any) => b.type === "tool_use");
    if (!block) throw new Error("no tool_use block in response");
    const input = (block as any).input as { adjustedScore: unknown; rationale: unknown };

    if (!Number.isFinite(Number(input.adjustedScore))) {
      throw new Error("malformed adjustedScore in tool output");
    }

    return {
      adjustedScore: clampToBand(Math.round(Number(input.adjustedScore)), base),
      rationale: typeof input.rationale === "string" ? input.rationale : `AI score within band of base ${base}.`,
    };
  } catch (err) {
    return {
      adjustedScore: base,
      rationale: `Deterministic fallback (LLM unavailable): base score ${base} from on-chain reputation.`,
    };
  }
}
