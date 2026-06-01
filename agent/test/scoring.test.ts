import { describe, it, expect } from "vitest";
import { baseScore, requiredCollateral } from "../src/scoring.js";
import type { Reputation } from "../src/types.js";

const fresh: Reputation = {
  roundsParticipated: 0,
  onTime: 0,
  late: 0,
  defaults: 0,
  circlesCompleted: 0,
};

describe("baseScore (mirrors the on-chain Underwriter)", () => {
  it("scores a fresh wallet at 50", () => {
    expect(baseScore(fresh)).toBe(50);
  });

  it("rewards on-time + completions", () => {
    expect(baseScore({ ...fresh, onTime: 6, circlesCompleted: 1 })).toBe(82);
  });

  it("punishes defaults, clamped at 0", () => {
    expect(baseScore({ ...fresh, defaults: 2 })).toBe(0);
  });

  it("clamps at 100", () => {
    expect(baseScore({ ...fresh, onTime: 20 })).toBe(100);
  });
});

describe("requiredCollateral ladder", () => {
  const amount = 100_000_000n;
  it("0.5x for >=80", () => expect(requiredCollateral(85, amount)).toBe(50_000_000n));
  it("1x for >=60", () => expect(requiredCollateral(70, amount)).toBe(100_000_000n));
  it("2x for >=40", () => expect(requiredCollateral(50, amount)).toBe(200_000_000n));
  it("3x for <40", () => expect(requiredCollateral(30, amount)).toBe(300_000_000n));
});
