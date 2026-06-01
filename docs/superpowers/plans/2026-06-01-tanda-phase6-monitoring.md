# Tanda Phase 6 — Agentic Monitoring / Early-Warning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI load-bearing *continuously*, not just at join. Each round the agent re-scores members against fresh on-chain state, predicts who is likely to default, and posts a verifiable EIP-712-signed risk flag on-chain *before* the deadline. The flagged member can `topUpCollateral()` to de-risk — which directly shrinks the insurance draw if they still default. Demo money-shot: AI flags a risky member early → they top up → on default the slash comes from their own (now larger) collateral and the insurance pool is untouched.

**Architecture:** `Underwriter` gains `verifyRiskFlag(...)` — the same EIP-712 verification pattern as `verifyAndQuote`, but for a `RiskFlag` struct (no band, just signer + deadline). `TandaCircle` gains `topUpCollateral(amount)` (member adds collateral during `Active`; conservation-preserving) and `flagAtRisk(member, ...)` (anyone can post the AI's signed flag → sets `atRisk[round][member]`, emits `RiskFlagged`). The TS agent gains `monitor.ts` (deterministic per-round default-risk prediction mirroring the on-chain reliability signal) and `signRiskFlag` in `sign.ts`. A cross-layer test pins the new EIP-712 struct between TS and Solidity.

**Tech Stack:** Solidity ^0.8.24 + Foundry + OpenZeppelin v5 (EIP712, ECDSA); TypeScript + viem + vitest. No new dependencies.

---

## Design decisions locked (read before implementing)

**1. `RiskFlag` EIP-712 struct** (same domain `"TandaUnderwriter"`/`"1"` as the Decision):
```
RiskFlag(address circle,address member,uint256 round,bytes32 rationaleHash,uint256 deadline)
```
`Underwriter.verifyRiskFlag(circle, member, round, rationaleHash, deadline, signature) view → bool`: reverts `SignatureExpired` if past deadline, `InvalidSigner` if recovered signer != `aiSigner`; otherwise returns true. No band/score logic — a risk flag is a boolean AI assertion, made verifiable by the signature (reuses the existing `SignatureExpired`/`InvalidSigner` errors).

**2. `topUpCollateral(uint256 amount)`** — member-only, `Active`-only, `amount > 0` (`ZeroAmount`). Pulls `amount` MXNB and adds it to `collateral[msg.sender]`. Conservation: `collateral[m]` and the contract balance both increase by `amount`, so the Phase-3 proof (contract holds exactly Σ collateral at completion; recipient never over-paid) is preserved. The top-up is load-bearing because the default path slashes `min(collateral[m], owed)` — a larger collateral means a larger self-slash and a smaller insurance draw.

**3. `flagAtRisk(member, rationaleHash, deadline, signature)`** — `Active`-only, `member` must be a member. Calls `underwriter.verifyRiskFlag(address(this), member, currentRound, rationaleHash, deadline, signature)` (reverts on bad signature/expiry), then sets `atRisk[currentRound][member] = true` and emits `RiskFlagged(member, currentRound, rationaleHash)`. Permissionless to *post* (anyone can relay the AI's signed flag), but only a real AI signature is accepted — so it is a verifiable AI action, not a free-for-all. No token movement → no `nonReentrant` needed (only a view call + state write).

**4. TS default-risk prediction — deterministic, mirrors the on-chain reliability signal.** `assessDefaultRisk(state) → { atRisk, riskScore, rationale }`:
- `riskScore = 100 - baseScore(reputation)` (a member with prior defaults scores low → high risk).
- If the member has already contributed this round → `atRisk = false` (no risk this round).
- `atRisk = (!contributed) && (riskScore >= 60)`. Threshold 60 means a brand-new wallet (base 50 → risk 50) is NOT flagged, but a member with a prior default (base 25 → risk 75) IS. Under-collateralization (`collateral < contributionAmount`) is surfaced in the rationale as an aggravating signal.
This deterministic core is unit-testable and matches what the contract enforces; an LLM rationale enrichment (like `underwrite.ts`) is out of scope here to keep the prediction verifiable.

**5. Conservation & prior phases untouched.** No change to `_settle`, `payout`, `resolveRound`, `bid`, or `join` accounting. `topUpCollateral` only grows a member's own collateral; `flagAtRisk` moves no funds. All 67 existing tests stay green.

**6. Scope.** The risk flag is informational-but-verifiable; it does not auto-penalize. Enforcement teeth (e.g. auto-slash a flagged non-responder) is intentionally out of scope — the honest design lets the member react. AA → folded into the frontend phase. The LLM-enriched monitoring narrative → frontend/agent-runtime phase.

---

## File Structure

```
contracts/
  src/
    Underwriter.sol          # MODIFY: RiskFlag typehash + verifyRiskFlag view
    TandaCircle.sol          # MODIFY: topUpCollateral, flagAtRisk, atRisk mapping, events, ZeroAmount error
  test/
    util/SignDecision.sol    # MODIFY: add signRiskFlag library function (same domain)
    Underwriter.t.sol        # MODIFY: verifyRiskFlag tests
    Monitor.t.sol            # NEW: topUpCollateral, flagAtRisk, at-risk→topup→reduced-insurance scenario
    CrossLayer.t.sol         # MODIFY: add a risk-flag cross-layer acceptance test

agent/
  src/
    monitor.ts               # NEW: assessDefaultRisk deterministic prediction
    sign.ts                  # MODIFY: RISK_FLAG_TYPES + signRiskFlag
  test/
    monitor.test.ts          # NEW
    sign.test.ts             # MODIFY: add a signRiskFlag round-trip test
```

---

## Task 1: Underwriter — verifyRiskFlag (EIP-712)

**Files:**
- Modify: `contracts/src/Underwriter.sol`
- Modify: `contracts/test/util/SignDecision.sol`
- Modify: `contracts/test/Underwriter.t.sol`

- [ ] **Step 1: Add the signing helper for risk flags**

In `contracts/test/util/SignDecision.sol`, add a second typehash constant and a `signRiskFlag` function to the `SignDecision` library (after the existing `sign` function, inside the library):

```solidity
    bytes32 internal constant RISK_FLAG_TYPEHASH = keccak256(
        "RiskFlag(address circle,address member,uint256 round,bytes32 rationaleHash,uint256 deadline)"
    );

    function signRiskFlag(
        Vm vm,
        uint256 signerKey,
        address verifyingContract,
        address circle,
        address member,
        uint256 round,
        bytes32 rationaleHash,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(RISK_FLAG_TYPEHASH, circle, member, round, rationaleHash, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(verifyingContract), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
```

(The existing `domainSeparator` helper is reused — the domain is identical.)

- [ ] **Step 2: Write the failing test**

Append a new test contract to `contracts/test/Underwriter.t.sol`:

```solidity
contract UnderwriterRiskFlagTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address internal circle = address(0xC1);
    address internal member = address(0x111);

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
    }

    function _sign(uint256 key, uint256 round, uint256 deadline) internal view returns (bytes memory) {
        return SignDecision.signRiskFlag(vm, key, address(uw), circle, member, round, keccak256("risk"), deadline);
    }

    function test_validRiskFlagAccepted() public view {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 2, deadline);
        assertTrue(uw.verifyRiskFlag(circle, member, 2, keccak256("risk"), deadline, sig));
    }

    function test_rejectsWrongSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(0xBEEF, 2, deadline);
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        uw.verifyRiskFlag(circle, member, 2, keccak256("risk"), deadline, sig);
    }

    function test_rejectsExpired() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 2, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(Underwriter.SignatureExpired.selector);
        uw.verifyRiskFlag(circle, member, 2, keccak256("risk"), deadline, sig);
    }

    function test_rejectsTamperedRound() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 2, deadline);
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        uw.verifyRiskFlag(circle, member, 3, keccak256("risk"), deadline, sig); // round mismatch
    }
}
```

- [ ] **Step 3: Run to verify it fails**

```bash
cd contracts && forge test --match-contract UnderwriterRiskFlagTest -vv
```

Expected: FAIL — `verifyRiskFlag` undefined.

- [ ] **Step 4: Add to `contracts/src/Underwriter.sol`**

Add the typehash constant next to `DECISION_TYPEHASH`:

```solidity
    bytes32 private constant RISK_FLAG_TYPEHASH = keccak256(
        "RiskFlag(address circle,address member,uint256 round,bytes32 rationaleHash,uint256 deadline)"
    );
```

Add this function after `verifyAndQuote`:

```solidity
    /// @notice Verify an AI-signed early-warning risk flag for a member in a given round.
    /// @dev Same signer/deadline checks as verifyAndQuote, no band (a flag is a boolean assertion).
    function verifyRiskFlag(
        address circle,
        address member,
        uint256 round,
        bytes32 rationaleHash,
        uint256 deadline,
        bytes calldata signature
    ) external view returns (bool) {
        if (block.timestamp > deadline) revert SignatureExpired();
        bytes32 structHash =
            keccak256(abi.encode(RISK_FLAG_TYPEHASH, circle, member, round, rationaleHash, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != aiSigner) revert InvalidSigner();
        return true;
    }
```

- [ ] **Step 5: Run to verify it passes**

```bash
cd contracts && forge test --match-path contracts/test/Underwriter.t.sol -vv
```

Expected: PASS (18 prior + 4 new = 22).

- [ ] **Step 6: Commit**

```bash
git add contracts/src/Underwriter.sol contracts/test/util/SignDecision.sol contracts/test/Underwriter.t.sol
git commit -m "feat(contracts): Underwriter verifyRiskFlag (EIP-712 early-warning)"
```

---

## Task 2: TandaCircle — topUpCollateral + flagAtRisk

**Files:**
- Modify: `contracts/src/TandaCircle.sol`
- Create: `contracts/test/Monitor.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/Monitor.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract MonitorTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    TandaCircle internal circle;

    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address internal bob = address(0xB0B); // fresh recipient
    address internal risky = address(0x515C); // high score -> low collateral, will be flagged

    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 2;
    uint256 internal constant ROUND = 1 days;
    uint256 internal constant BIDDUR = 1 hours;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        circle = new TandaCircle(
            address(this), address(mxnb), address(sbt), address(uw), address(pool), AMOUNT, MAX, ROUND, BIDDUR
        );
        sbt.setCircleAuthorized(address(circle), true);
        pool.setCircleAuthorized(address(circle), true);
        sbt.setCircleAuthorized(address(this), true);

        // risky: 4 on-time -> base 66, so an adjustedScore of 80 is in band -> 0.5x collateral
        for (uint256 i = 0; i < 4; i++) sbt.recordOnTime(risky);

        mxnb.mint(bob, AMOUNT * 20);
        mxnb.mint(risky, AMOUNT * 20);
        vm.prank(bob);
        mxnb.approve(address(circle), type(uint256).max);
        vm.prank(risky);
        mxnb.approve(address(circle), type(uint256).max);
    }

    function _join(address who, uint256 score) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, score, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(score, keccak256("ok"), deadline, sig);
    }

    function _flag(address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.signRiskFlag(
            vm, aiKey, address(uw), address(circle), who, circle.currentRound(), keccak256("risk"), deadline
        );
        circle.flagAtRisk(who, keccak256("risk"), deadline, sig);
    }

    function test_topUpCollateral_increasesCollateral() public {
        _join(bob, 50);
        _join(risky, 80); // 0.5x -> 50 collateral
        circle.start();

        uint256 before = mxnb.balanceOf(risky);
        vm.prank(risky);
        circle.topUpCollateral(50_000_000);
        assertEq(circle.collateral(risky), 100_000_000);
        assertEq(mxnb.balanceOf(risky), before - 50_000_000);
        assertEq(mxnb.balanceOf(address(circle)), 50_000_000 + 50_000_000 + 50_000_000); // bob col 200? no
    }

    function test_topUpCollateral_rejectsZeroAndNonMember() public {
        _join(bob, 50);
        _join(risky, 80);
        circle.start();

        vm.prank(risky);
        vm.expectRevert(TandaCircle.ZeroAmount.selector);
        circle.topUpCollateral(0);

        vm.prank(address(0xDEAD));
        vm.expectRevert(TandaCircle.NotMember.selector);
        circle.topUpCollateral(1);
    }

    function test_flagAtRisk_setsFlagAndEmits() public {
        _join(bob, 50);
        _join(risky, 80);
        circle.start();

        _flag(risky);
        assertTrue(circle.atRisk(0, risky));
    }

    function test_flagAtRisk_rejectsBadSignature() public {
        _join(bob, 50);
        _join(risky, 80);
        circle.start();

        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.signRiskFlag(
            vm, 0xBEEF, address(uw), address(circle), risky, 0, keccak256("risk"), deadline
        );
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        circle.flagAtRisk(risky, keccak256("risk"), deadline, sig);
    }

    /// @notice Money-shot: AI flags the risky member early, they top up, and on default the
    ///         slash comes from their own collateral — the insurance pool is untouched.
    function test_earlyWarning_topUp_avoidsInsuranceDraw() public {
        _join(bob, 50); // recipient round 0
        _join(risky, 80); // 0.5x collateral = 50
        // seed pool so we can detect whether it gets drawn
        mxnb.mint(address(pool), 1_000_000_000);
        circle.start();

        // AI flags risky at round 0 (before deadline)
        _flag(risky);
        assertTrue(circle.atRisk(0, risky));

        // risky responds by topping up to full coverage (50 -> 100)
        vm.prank(risky);
        circle.topUpCollateral(50_000_000);
        assertEq(circle.collateral(risky), 100_000_000);

        // bob contributes; risky still defaults
        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        // bob made whole; risky's own (topped-up) collateral covered the full miss
        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);
        assertEq(circle.collateral(risky), 0); // 100 - 100 slashed
        assertEq(mxnb.balanceOf(address(pool)), poolBefore); // INSURANCE UNTOUCHED
        assertEq(pool.totalClaims(), 0);
    }
}
```

> NOTE on `test_topUpCollateral_increasesCollateral`: bob joined at score 50 → 2× collateral = 200; risky at score 80 → 0.5× = 50. Before top-up the circle holds 200 + 50 = 250. After risky tops up 50, it holds 300. Fix the final assertion to `assertEq(mxnb.balanceOf(address(circle)), 300_000_000);` (the inline arithmetic in the draft is wrong — bob's collateral is 200, not 50). Use `300_000_000`.

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract MonitorTest -vv
```

Expected: FAIL — `topUpCollateral`/`flagAtRisk`/`atRisk`/`ZeroAmount` undefined.

- [ ] **Step 3: Modify `contracts/src/TandaCircle.sol`**

1. Add an error:
```solidity
    error ZeroAmount();
```

2. Add storage (after `uint256[] public payoutOrder;`):
```solidity
    mapping(uint256 => mapping(address => bool)) public atRisk; // round => member => AI-flagged
```

3. Add events (with the others):
```solidity
    event CollateralToppedUp(address indexed member, uint256 amount, uint256 newCollateral);
    event RiskFlagged(address indexed member, uint256 indexed round, bytes32 rationaleHash);
```

4. Add `topUpCollateral` after `withdrawCollateral` (or anywhere among the external functions):
```solidity
    /// @notice A member adds collateral mid-circle (e.g. in response to an AI risk flag). This
    ///         shrinks the insurance draw if they later default, since the slash takes more from
    ///         their own stake. Conservation-preserving: collateral and contract balance rise together.
    function topUpCollateral(uint256 amount) external inState(State.Active) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (amount == 0) revert ZeroAmount();
        collateral[msg.sender] += amount;
        emit CollateralToppedUp(msg.sender, amount, collateral[msg.sender]);
        token.safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Post an AI-signed early-warning flag for `member` in the current round. Anyone may
    ///         relay it, but only a valid aiSigner signature is accepted (verifiable AI action).
    function flagAtRisk(address member, bytes32 rationaleHash, uint256 deadline, bytes calldata signature)
        external
        inState(State.Active)
    {
        if (!isMember[member]) revert NotMember();
        underwriter.verifyRiskFlag(address(this), member, currentRound, rationaleHash, deadline, signature);
        atRisk[currentRound][member] = true;
        emit RiskFlagged(member, currentRound, rationaleHash);
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-contract MonitorTest -vv
```

Expected: PASS (5 tests).

- [ ] **Step 5: Run the full suite (nothing regressed)**

```bash
cd contracts && forge test -vv
```

Expected: ALL green — 67 prior + 4 (verifyRiskFlag) + 5 (Monitor) = **76**.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/TandaCircle.sol contracts/test/Monitor.t.sol
git commit -m "feat(contracts): topUpCollateral + AI-signed flagAtRisk early-warning"
```

---

## Task 3: TS agent — monitor.ts + signRiskFlag

**Files:**
- Create: `agent/src/monitor.ts`
- Create: `agent/test/monitor.test.ts`
- Modify: `agent/src/sign.ts`
- Modify: `agent/test/sign.test.ts`

- [ ] **Step 1: Write the failing monitor test**

`agent/test/monitor.test.ts`:

```typescript
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
    // base score: 50 + 1*4 - 1*6 - 1*25 = 23 -> risk 77
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
      collateral: 50_000_000n, // < one contribution
    });
    expect(r.atRisk).toBe(true);
    expect(r.rationale).toMatch(/under-collateral/i);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd agent && npx vitest run monitor
```

Expected: FAIL — `../src/monitor.js` not found.

- [ ] **Step 3: Write `agent/src/monitor.ts`**

```typescript
import type { Reputation } from "./types.js";
import { baseScore } from "./scoring.js";

export interface MemberRoundState {
  address: string;
  contributed: boolean;
  reputation: Reputation;
  contributionAmount: bigint;
  collateral: bigint;
}

export interface RiskAssessment {
  address: string;
  atRisk: boolean;
  riskScore: number; // 0..100, higher = more likely to default
  rationale: string;
}

export const RISK_THRESHOLD = 60;

/**
 * Deterministic per-round default-risk prediction. Mirrors the on-chain reliability signal:
 * riskScore = 100 - baseScore(reputation). A member who already contributed this round is not at
 * risk. Under-collateralization (collateral < one contribution) is surfaced as an aggravating note.
 */
export function assessDefaultRisk(state: MemberRoundState): RiskAssessment {
  const reliability = baseScore(state.reputation);
  const riskScore = 100 - reliability;

  if (state.contributed) {
    return {
      address: state.address,
      atRisk: false,
      riskScore,
      rationale: `Already contributed this round; no default risk.`,
    };
  }

  const underCollateralized = state.collateral < state.contributionAmount;
  const atRisk = riskScore >= RISK_THRESHOLD;

  const parts: string[] = [`reliability ${reliability}/100 (risk ${riskScore})`];
  if (state.reputation.defaults > 0) parts.push(`${state.reputation.defaults} prior default(s)`);
  if (underCollateralized) parts.push(`under-collateralized (${state.collateral} < ${state.contributionAmount})`);

  return {
    address: state.address,
    atRisk,
    riskScore,
    rationale: `${atRisk ? "AT RISK" : "OK"}: has not contributed; ${parts.join("; ")}.`,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd agent && npx vitest run monitor
```

Expected: PASS (4 tests).

- [ ] **Step 5: Add `signRiskFlag` to `agent/src/sign.ts`**

Append (the `DECISION_DOMAIN` helper and imports are reused):

```typescript
export const RISK_FLAG_TYPES = {
  RiskFlag: [
    { name: "circle", type: "address" },
    { name: "member", type: "address" },
    { name: "round", type: "uint256" },
    { name: "rationaleHash", type: "bytes32" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface RiskFlagMessage {
  circle: Address;
  member: Address;
  round: bigint;
  rationaleHash: Hex;
  deadline: bigint;
}

/** Sign an early-warning RiskFlag via EIP-712 (same domain as the Decision). */
export async function signRiskFlag(
  account: Account,
  chainId: number,
  verifyingContract: Address,
  message: RiskFlagMessage,
): Promise<Hex> {
  if (!account.signTypedData) throw new Error("account cannot signTypedData");
  return account.signTypedData({
    domain: DECISION_DOMAIN(chainId, verifyingContract),
    types: RISK_FLAG_TYPES,
    primaryType: "RiskFlag",
    message,
  });
}
```

- [ ] **Step 6: Add a round-trip test to `agent/test/sign.test.ts`**

Append inside the file (add `signRiskFlag`, `RISK_FLAG_TYPES` to the import from `../src/sign.js`):

```typescript
import { signRiskFlag, RISK_FLAG_TYPES } from "../src/sign.js";

describe("signRiskFlag EIP-712", () => {
  it("produces a signature that recovers to the signer", async () => {
    const { privateKeyToAccount } = await import("viem/accounts");
    const { recoverTypedDataAddress, keccak256, toBytes } = await import("viem");
    const { DECISION_DOMAIN } = await import("../src/sign.js");

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
```

(If the existing `sign.test.ts` already imports `recoverTypedDataAddress`/`keccak256`/`toBytes`/`privateKeyToAccount` at the top, reuse those imports instead of the dynamic `await import(...)` — the dynamic form is given so the appended block is self-contained regardless.)

- [ ] **Step 7: Run the full agent suite**

```bash
cd agent && npx vitest run
```

Expected: PASS — scoring 8 + underwrite 3 + sign 1+1 + monitor 4 = **17**.

- [ ] **Step 8: Commit**

```bash
git add agent/src/monitor.ts agent/test/monitor.test.ts agent/src/sign.ts agent/test/sign.test.ts
git commit -m "feat(agent): deterministic default-risk monitor + EIP-712 risk-flag signing"
```

---

## Task 4: Cross-layer risk-flag consistency test

**Files:**
- Modify: `contracts/test/CrossLayer.t.sol`

Pin the new `RiskFlag` EIP-712 struct between TS and Solidity, the same way `CrossLayer` pins the Decision: a signature over the canonical domain with the shared anvil key is accepted by `verifyRiskFlag`.

- [ ] **Step 1: Add the cross-layer risk-flag test**

Append to the `CrossLayerTest` contract in `contracts/test/CrossLayer.t.sol`:

```solidity
    function test_canonicalRiskFlagAccepted() public view {
        uint256 deadline = 9999999999;
        bytes32 rationaleHash = keccak256("risk");
        bytes memory sig = SignDecision.signRiskFlag(
            vm, AI_KEY, address(uw), circle, member, 2, rationaleHash, deadline
        );
        assertTrue(uw.verifyRiskFlag(circle, member, 2, rationaleHash, deadline, sig));
    }
```

> The `AI_KEY` (anvil #1) matches `agent/test/sign.test.ts`'s key, and the `RiskFlag` typehash + domain are byte-identical between `SignDecision.sol`, `agent/src/sign.ts`, and `Underwriter.sol`. If this passes AND the agent's `signRiskFlag` round-trip passes, the layers agree.

- [ ] **Step 2: Run the cross-layer test**

```bash
cd contracts && forge test --match-contract CrossLayerTest -vv
```

Expected: PASS (2 tests — the prior decision test + the new risk-flag test).

- [ ] **Step 3: Run both full suites + deploy sim**

```bash
cd contracts && forge test -vv
cd agent && npx vitest run
cd contracts && forge script script/Deploy.s.sol:Deploy --sender 0x0000000000000000000000000000000000000001
```

Expected: contracts all green (77 — 76 + 1 cross-layer risk flag); agent 17; deploy 7 lines.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/CrossLayer.t.sol
git commit -m "test(contracts): cross-layer EIP-712 risk-flag consistency"
```

---

## Phase 6 Done — Definition of Done

- [ ] `cd contracts && forge test -vv` green (~77 tests).
- [ ] `cd agent && npx vitest run` green (17 tests).
- [ ] `forge script ... Deploy` simulates cleanly (7 lines).
- [ ] Demoable money-shot: each round the agent re-scores members and predicts defaulters deterministically; the AI posts a verifiable EIP-712-signed risk flag on-chain before the deadline; the flagged member tops up collateral; on a subsequent default the slash comes from their own (larger) collateral and the insurance pool is untouched — proving the monitoring is load-bearing and continuous, not just a join-time check.

**Next:** Frontend phase — Next.js dashboard + AA gasless onboarding (Phase 5 folded in) + demo video. All contract/agent APIs the frontend needs now exist.

---

## Self-Review

**Spec coverage (design spec §4.2 monitoring / re-score / early-warning + §6 demo step 4):** ✔ EIP-712 risk-flag verification mirroring verifyAndQuote (Task 1), ✔ topUpCollateral (load-bearing: shrinks insurance draw) + flagAtRisk on-chain verifiable warning (Task 2), ✔ deterministic per-round default prediction in the agent + risk-flag signing (Task 3), ✔ cross-layer EIP-712 pin for the new struct (Task 4). Deferred by design: enforcement teeth (auto-penalize flagged non-responders), LLM-enriched monitoring narrative, AA → frontend phase.

**Placeholder scan:** No TBD/TODO. One inline arithmetic correction is flagged explicitly in Task 2 Step 1 (the `test_topUpCollateral_increasesCollateral` balance assertion must be `300_000_000`, not the wrong draft expression) — the engineer applies the corrected literal.

**Type consistency:** `verifyRiskFlag(address,address,uint256,bytes32,uint256,bytes)` consistent across `Underwriter.sol`, `Monitor.t.sol`, `CrossLayer.t.sol`, and the `flagAtRisk` caller. `RiskFlag` typehash string byte-identical in `Underwriter.sol`, `SignDecision.sol`, and `agent/src/sign.ts` (RISK_FLAG_TYPES field order circle/member/round/rationaleHash/deadline) — pinned by Task 4 + the agent round-trip. `topUpCollateral(uint256)`, `flagAtRisk(address,bytes32,uint256,bytes)`, `atRisk(uint256,address)`, `ZeroAmount` consistent across `TandaCircle.sol` and `Monitor.t.sol`. `assessDefaultRisk(MemberRoundState) → RiskAssessment` consistent across `monitor.ts` and `monitor.test.ts`. The deterministic `riskScore = 100 - baseScore` uses the SAME `baseScore` as the contract (re-exported from `scoring.ts`), so the agent's prediction is grounded in the on-chain signal. No change to `_settle`/`resolveRound`/`payout`/`bid`/`join` — Phase 1-4 conservation untouched.
