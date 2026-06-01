import { describe, it, expect } from "vitest";
import { assessDefaultRisk } from "../src/monitor.js";
import type { Reputation } from "../src/types.js";

const fresh: Reputation = { roundsParticipated: 0, onTime: 0, late: 0, defaults: 0, circlesCompleted: 0 };
const defaulter: Reputation = { roundsParticipated: 4, onTime: 1, late: 1, defaults: 1, circlesCompleted: 0 };

const base = { contributionAmount: 100_000_000n, collateral: 200_000_000n };

describe("assessDefaultRisk", () => {
  it("does not flag a member who already contributed", () => {
    const r = assessDefaultRisk({ address: "0x1", contributed: true, reputation: defaulter, ...base });
    expect(r.atRisk).toBe(false);
  });

  it("does not flag a fresh wallet (risk below threshold)", () => {
    const r = assessDefaultRisk({ address: "0x2", contributed: false, reputation: fresh, ...base });
    expect(r.riskScore).toBe(50);
    expect(r.atRisk).toBe(false);
  });

  it("flags a member with a prior default who hasn't contributed", () => {
    const r = assessDefaultRisk({ address: "0x3", contributed: false, reputation: defaulter, ...base });
    expect(r.riskScore).toBe(77);
    expect(r.atRisk).toBe(true);
    expect(r.rationale).toMatch(/default/i);
  });

  it("notes under-collateralization in the rationale", () => {
    const r = assessDefaultRisk({
      address: "0x4",
      contributed: false,
      reputation: defaulter,
      contributionAmount: 100_000_000n,
      collateral: 50_000_000n,
    });
    expect(r.atRisk).toBe(true);
    expect(r.rationale).toMatch(/under-collateral/i);
  });
});
