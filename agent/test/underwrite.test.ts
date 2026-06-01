import { describe, it, expect, vi } from "vitest";
import { underwrite } from "../src/underwrite.js";
import type { Reputation, WalletMeta } from "../src/types.js";

const fresh: Reputation = { roundsParticipated: 0, onTime: 0, late: 0, defaults: 0, circlesCompleted: 0 };
const meta: WalletMeta = { ageDays: 5, txCount: 3, mxnbBalance: 0n };

function fakeClient(adjustedScore: number, rationale: string) {
  return {
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [
          { type: "tool_use", name: "submit_decision", input: { adjustedScore, rationale } },
        ],
      }),
    },
  } as any;
}

describe("underwrite", () => {
  it("returns the AI score when within band", async () => {
    const client = fakeClient(60, "slightly better than baseline");
    const d = await underwrite(client, fresh, meta);
    expect(d.adjustedScore).toBe(60);
    expect(d.rationale).toContain("baseline");
  });

  it("clamps an over-eager AI score into the band", async () => {
    const client = fakeClient(95, "too generous");
    const d = await underwrite(client, fresh, meta);
    expect(d.adjustedScore).toBe(65);
  });

  it("falls back to the base score if the client throws", async () => {
    const client = { messages: { create: vi.fn().mockRejectedValue(new Error("no api")) } } as any;
    const d = await underwrite(client, fresh, meta);
    expect(d.adjustedScore).toBe(50);
    expect(d.rationale).toMatch(/fallback/i);
  });
});
