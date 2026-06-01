# Tanda Phase 3 — Insurance Pool + Default/Slash Path Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a circle survive a default — the demo money-shot. A member misses a contribution; after the round deadline anyone can `resolveRound()`, which slashes the defaulter's collateral, draws an insurance buffer to make the recipient whole, and downgrades the defaulter's reputation. Risk-priced premiums (collected at join) fund the insurance pool. A naive ROSCA loses money in the same scenario; Tanda absorbs it.

**Architecture:** A new `InsurancePool` contract holds an MXNB buffer, funded by per-join premiums forwarded by authorized circles (plus an optional protocol seed). `Underwriter` gains a pure `premium(score, amount)` ladder (no signature/return changes — the circle calls it with the already-verified score). `TandaCircle` gains a round deadline, premium collection at join, a `resolveRound()` default path (slash → insurance cover → recordDefault → continue), honest underfunded handling (recipient haircut + event), and completion credit only for non-defaulters. The `CircleFactory` wires + authorizes circles on the pool; the deploy script seeds it.

**Tech Stack:** Solidity ^0.8.24 + Foundry + OpenZeppelin v5 (SafeERC20, ReentrancyGuard). No TypeScript changes (the agent's signed score already drives both collateral and premium on-chain).

---

## Design decisions locked (read before implementing)

**1. Premium ladder `Underwriter.premium(score, amount) pure → uint256`** (bps of contribution; riskier pays more):
- `score >= 80` → 100 bps (1%)
- `score >= 60` → 200 bps (2%)
- `score >= 40` → 400 bps (4%)
- `score < 40`  → 600 bps (6%)
- `premium = amount * bps / 10000`. NOT refundable — it funds the pool. A fresh wallet (score 50) pays 4%.

**2. `verifyAndQuote` is NOT changed.** The circle calls `verifyAndQuote(...)` (validates the signed, in-band score and returns collateral) and then `premium(adjustedScore, amount)` with the same `adjustedScore`. Because `verifyAndQuote` reverts unless `adjustedScore` is in-band and signed, the score is known-valid by the time `premium` is called. This keeps Phase-2 Underwriter/CrossLayer tests untouched.

**3. Round deadline.** `TandaCircle` takes a `roundDuration` (seconds). `start()` sets `roundDeadline = block.timestamp + roundDuration`. Each advance (`_settle` non-final) sets the next `roundDeadline`. `payout()` (all contributed) works anytime. `resolveRound()` requires `block.timestamp > roundDeadline` AND not-all-contributed.

**4. Default settlement math (proven to conserve collateral).** Let `n = members`, `pot = n*amount`, `c = contributors this round`. For each non-contributor `m`: `hasDefaulted[m]=true`; `owed = amount`; `fromCol = min(collateral[m], owed)`; `collateral[m] -= fromCol`; `shortfall = owed - fromCol`; `fromIns = shortfall>0 ? insurancePool.cover(shortfall) : 0`; `recordDefault(m)`. `liquid = c*amount + Σ(fromCol+fromIns)`. `payAmount = min(liquid, pot)`; if `payAmount < pot` emit `RoundUnderfunded`. Pay the recipient `payAmount`. Slashed collateral was already in the contract; insurance `cover` transfers tokens in; the contract balance after settling equals the sum of remaining collateral — withdrawals at completion return exactly that.

**5. Insurance pool funding + authorization.** Premiums are forwarded by the circle at join (`token.safeTransfer(pool, prem)` then `pool.notifyPremium(prem)`). `cover(amount)` pays `min(amount, balance)` to the calling authorized circle and returns the covered amount (graceful underfunding, no revert). The factory is the pool's admin (via `transferAdmin`) and authorizes each circle on the pool, exactly like it does on the SBT. The deploy script can seed the pool with `INSURANCE_SEED` MXNB.

**6. Phase boundaries.** Auction ordering → Phase 4. AA → Phase 5. Monitoring/re-score → Phase 6. Punitive over-slash (forfeit beyond the missed contribution) is intentionally NOT done — slashing is limited to the amount owed, which is fair; note as future work.

---

## File Structure

```
contracts/
  src/
    InsurancePool.sol      # NEW: MXNB buffer; premium accounting; cover(); circle authorization
    Underwriter.sol        # MODIFY: add premium(score, amount) pure ladder
    TandaCircle.sol        # MODIFY: roundDuration + deadline, premium at join, resolveRound, hasDefaulted, underfunded
    CircleFactory.sol      # MODIFY: hold + authorize InsurancePool; createCircle takes roundDuration
  test/
    InsurancePool.t.sol    # NEW
    Underwriter.t.sol      # MODIFY: add premium ladder tests
    TandaCircle.t.sol      # REWRITE: premium-aware happy path + default + insurance + underfunded
    CircleFactory.t.sol    # REWRITE: wire pool + roundDuration
    Integration.t.sol      # REWRITE: lifecycle (premium) + default scenario
  script/
    Deploy.s.sol           # MODIFY: deploy + seed + authorize InsurancePool
```

---

## Task 1: InsurancePool

**Files:**
- Create: `contracts/src/InsurancePool.sol`
- Test: `contracts/test/InsurancePool.t.sol`

- [ ] **Step 1: Write the failing test**

`contracts/test/InsurancePool.t.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

contract InsurancePoolTest is Test {
    MockMXNB internal mxnb;
    InsurancePool internal pool;
    address internal circle = address(0xC1);

    function setUp() public {
        mxnb = new MockMXNB();
        pool = new InsurancePool(address(mxnb), address(this));
    }

    function test_adminAuthorizesCircle() public {
        pool.setCircleAuthorized(circle, true);
        assertTrue(pool.isAuthorizedCircle(circle));
    }

    function test_nonAdminCannotAuthorize() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAdmin.selector);
        pool.setCircleAuthorized(circle, true);
    }

    function test_transferAdmin() public {
        pool.transferAdmin(address(0xF00D));
        assertEq(pool.admin(), address(0xF00D));
    }

    function test_notifyPremiumAccrues() public {
        pool.setCircleAuthorized(circle, true);
        vm.prank(circle);
        pool.notifyPremium(5_000_000);
        assertEq(pool.totalPremiums(), 5_000_000);
    }

    function test_notifyPremium_onlyAuthorized() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAuthorizedCircle.selector);
        pool.notifyPremium(1);
    }

    function test_coverPaysAuthorizedCircleUpToBalance() public {
        mxnb.mint(address(pool), 1_000_000_000); // 1000 MXNB buffer
        pool.setCircleAuthorized(circle, true);

        vm.prank(circle);
        uint256 covered = pool.cover(300_000_000);
        assertEq(covered, 300_000_000);
        assertEq(mxnb.balanceOf(circle), 300_000_000);
        assertEq(pool.totalClaims(), 300_000_000);
    }

    function test_coverCapsAtBalanceWhenUnderfunded() public {
        mxnb.mint(address(pool), 40_000_000); // only 40 MXNB
        pool.setCircleAuthorized(circle, true);

        vm.prank(circle);
        uint256 covered = pool.cover(100_000_000);
        assertEq(covered, 40_000_000); // capped
        assertEq(mxnb.balanceOf(circle), 40_000_000);
    }

    function test_cover_onlyAuthorized() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAuthorizedCircle.selector);
        pool.cover(1);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract InsurancePoolTest -vv
```

Expected: FAIL — `InsurancePool.sol` does not exist.

- [ ] **Step 3: Write the implementation**

`contracts/src/InsurancePool.sol`:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice A shared MXNB buffer that absorbs default shortfalls beyond a defaulter's collateral.
///         Funded by per-join risk-priced premiums forwarded by authorized circles (plus an
///         optional protocol seed). "LP yield" = accumulated premiums net of claims.
contract InsurancePool {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public admin;
    mapping(address => bool) public isAuthorizedCircle;

    uint256 public totalPremiums;
    uint256 public totalClaims;

    error NotAdmin();
    error NotAuthorizedCircle();
    error ZeroAddress();

    event CircleAuthorized(address indexed circle, bool authorized);
    event AdminTransferred(address indexed from, address indexed to);
    event PremiumReceived(address indexed circle, uint256 amount);
    event Claimed(address indexed circle, uint256 requested, uint256 covered);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address token_, address admin_) {
        if (token_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        admin = admin_;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Record a premium that an authorized circle has just transferred in.
    function notifyPremium(uint256 amount) external onlyAuthorizedCircle {
        totalPremiums += amount;
        emit PremiumReceived(msg.sender, amount);
    }

    /// @notice Cover up to `amount` of a shortfall, sending covered tokens to the calling circle.
    /// @return covered The amount actually transferred (less than requested if underfunded).
    function cover(uint256 amount) external onlyAuthorizedCircle returns (uint256 covered) {
        uint256 bal = token.balanceOf(address(this));
        covered = amount > bal ? bal : amount;
        if (covered > 0) {
            totalClaims += covered;
            token.safeTransfer(msg.sender, covered);
        }
        emit Claimed(msg.sender, amount, covered);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-contract InsurancePoolTest -vv
```

Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/InsurancePool.sol contracts/test/InsurancePool.t.sol
git commit -m "feat(contracts): InsurancePool buffer with premium accounting + capped cover"
```

---

## Task 2: Underwriter — premium ladder

**Files:**
- Modify: `contracts/src/Underwriter.sol`
- Modify: `contracts/test/Underwriter.t.sol`

- [ ] **Step 1: Add failing tests**

Append a new test contract to `contracts/test/Underwriter.t.sol` (after the existing contracts; the imports `Test`, `ReputationSBT`, `Underwriter` are already present at the top):

```solidity
contract UnderwriterPremiumTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;

    function setUp() public {
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), address(0xA15));
    }

    function test_premiumLadder() public view {
        uint256 amount = 100_000_000; // 100 MXNB
        assertEq(uw.premium(85, amount), 1_000_000); // 1%
        assertEq(uw.premium(70, amount), 2_000_000); // 2%
        assertEq(uw.premium(50, amount), 4_000_000); // 4%
        assertEq(uw.premium(30, amount), 6_000_000); // 6%
    }

    function test_premiumBoundaries() public view {
        uint256 amount = 100_000_000;
        assertEq(uw.premium(80, amount), 1_000_000); // >=80
        assertEq(uw.premium(79, amount), 2_000_000); // >=60
        assertEq(uw.premium(60, amount), 2_000_000);
        assertEq(uw.premium(59, amount), 4_000_000); // >=40
        assertEq(uw.premium(40, amount), 4_000_000);
        assertEq(uw.premium(39, amount), 6_000_000); // <40
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract UnderwriterPremiumTest -vv
```

Expected: FAIL — `premium` undefined.

- [ ] **Step 3: Add the `premium` function to `contracts/src/Underwriter.sol`**

Insert immediately after the existing `quote(...)` function:

```solidity
    /// @notice Risk-priced insurance premium for a given score, in token base units.
    ///         Lower score (riskier) pays a higher premium that funds the insurance buffer.
    function premium(uint256 score, uint256 contributionAmount) public pure returns (uint256) {
        uint256 bps;
        if (score >= 80) bps = 100; // 1%
        else if (score >= 60) bps = 200; // 2%
        else if (score >= 40) bps = 400; // 4%
        else bps = 600; // 6%
        return contributionAmount * bps / 10000;
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-path contracts/test/Underwriter.t.sol -vv
```

Expected: PASS (12 prior + 2 new = 14).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/Underwriter.sol contracts/test/Underwriter.t.sol
git commit -m "feat(contracts): Underwriter risk-priced premium ladder"
```

---

## Task 3: TandaCircle — round deadline, premium at join, default/slash path

**Files:**
- Modify: `contracts/src/TandaCircle.sol`
- Rewrite: `contracts/test/TandaCircle.t.sol`

- [ ] **Step 1: Rewrite the test file** (premium-aware happy path + default + insurance + underfunded)

Replace the entirety of `contracts/test/TandaCircle.t.sol` with:

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

contract TandaCircleTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    TandaCircle internal circle;

    address internal organizer = address(this);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;

    address internal alice = address(0xA1A1);
    address internal bob = address(0xB2B2);
    address internal carol = address(0xC3C3);

    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB
    uint256 internal constant PREMIUM_FRESH = 4_000_000; // 4% at score 50
    uint256 internal constant COLLATERAL_FRESH = 200_000_000; // 2x at score 50
    uint8 internal constant MAX = 3;
    uint256 internal constant ROUND = 1 days;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        circle = new TandaCircle(
            organizer, address(mxnb), address(sbt), address(uw), address(pool), AMOUNT, MAX, ROUND
        );
        sbt.setCircleAuthorized(address(circle), true);
        pool.setCircleAuthorized(address(circle), true);

        address[3] memory who = [alice, bob, carol];
        for (uint256 i = 0; i < who.length; i++) {
            mxnb.mint(who[i], AMOUNT * 20);
            vm.prank(who[i]);
            mxnb.approve(address(circle), type(uint256).max);
        }
    }

    // fresh wallet base score 50; submit adjustedScore 50 (in band) -> 2x collateral, 4% premium
    function _join(address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, 50, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function _everyoneJoins() internal {
        _join(alice);
        _join(bob);
        _join(carol);
    }

    function _allContribute() internal {
        vm.prank(alice);
        circle.contribute();
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
    }

    function test_initialState() public view {
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Forming));
        assertEq(circle.roundDuration(), ROUND);
        assertEq(address(circle.insurancePool()), address(pool));
    }

    function test_join_escrowsCollateralAndForwardsPremium() public {
        uint256 before = mxnb.balanceOf(alice);
        _join(alice);
        assertEq(circle.collateral(alice), COLLATERAL_FRESH);
        // member paid collateral + premium
        assertEq(mxnb.balanceOf(alice), before - COLLATERAL_FRESH - PREMIUM_FRESH);
        // collateral stays in circle; premium went to pool
        assertEq(mxnb.balanceOf(address(circle)), COLLATERAL_FRESH);
        assertEq(mxnb.balanceOf(address(pool)), PREMIUM_FRESH);
        assertEq(pool.totalPremiums(), PREMIUM_FRESH);
    }

    function test_start_setsRoundDeadline() public {
        _everyoneJoins();
        circle.start();
        assertEq(circle.roundDeadline(), block.timestamp + ROUND);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    function test_happyPath_rotatingPayout_withPremiumAndWithdraw() public {
        _everyoneJoins();
        circle.start();

        uint256 aliceBefore = mxnb.balanceOf(alice);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(alice), aliceBefore + 2 * AMOUNT); // net +2x (paid 1, got 3)

        _allContribute();
        circle.payout();
        _allContribute();
        circle.payout();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        uint256 aBefore = mxnb.balanceOf(alice);
        vm.prank(alice);
        circle.withdrawCollateral();
        assertEq(mxnb.balanceOf(alice), aBefore + COLLATERAL_FRESH);

        (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(alice);
        assertEq(rounds, 3);
        assertEq(onTime, 3);
        assertEq(completed, 1);
    }

    function test_resolveRound_slashesDefaulterCollateral_recipientWhole() public {
        _everyoneJoins();
        circle.start();

        // Round 0 happy: alice is recipient
        _allContribute();
        circle.payout();
        assertEq(circle.currentRound(), 1);

        // Round 1: alice defaults (classic: she already got her pot); bob, carol contribute
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();

        // before deadline -> cannot resolve
        vm.expectRevert(TandaCircle.RoundNotExpired.selector);
        circle.resolveRound();

        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        // recipient (bob) made whole: full pot
        assertEq(mxnb.balanceOf(bob), bobBefore + 3 * AMOUNT);
        // alice slashed by exactly one contribution (collateral 200 -> 100); no insurance needed
        assertEq(circle.collateral(alice), COLLATERAL_FRESH - AMOUNT);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore); // pool untouched
        assertTrue(circle.hasDefaulted(alice));
        (, , , uint32 defaults,) = sbt.reputation(alice);
        assertEq(defaults, 1);
        assertEq(circle.currentRound(), 2);
    }

    function test_resolveRound_revertsWhenRoundComplete() public {
        _everyoneJoins();
        circle.start();
        _allContribute();
        vm.warp(circle.roundDeadline() + 1);
        vm.expectRevert(TandaCircle.RoundAlreadyComplete.selector);
        circle.resolveRound();
    }

    function test_defaulter_getsNoCompletionCredit_butKeepsRemainingCollateral() public {
        _everyoneJoins();
        circle.start();

        // round 0 happy (alice recipient)
        _allContribute();
        circle.payout();

        // round 1: alice defaults
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);
        circle.resolveRound();

        // round 2: alice defaults again; bob, carol contribute
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);
        circle.resolveRound();

        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        // alice defaulted twice: collateral 200 - 100 - 100 = 0; no completion credit
        assertEq(circle.collateral(alice), 0);
        (,,, uint32 defaults, uint32 completed) = sbt.reputation(alice);
        assertEq(defaults, 2);
        assertEq(completed, 0);

        // bob never defaulted: gets completion credit + withdraws full collateral
        (,,,, uint32 bobCompleted) = sbt.reputation(bob);
        assertEq(bobCompleted, 1);
        uint256 bBefore = mxnb.balanceOf(bob);
        vm.prank(bob);
        circle.withdrawCollateral();
        assertEq(mxnb.balanceOf(bob), bBefore + COLLATERAL_FRESH);
    }

    function test_contribute_rejectsDouble() public {
        _everyoneJoins();
        circle.start();
        vm.startPrank(alice);
        circle.contribute();
        vm.expectRevert(TandaCircle.AlreadyContributed.selector);
        circle.contribute();
        vm.stopPrank();
    }

    function test_payout_revertsBeforeAllContribute() public {
        _everyoneJoins();
        circle.start();
        vm.prank(alice);
        circle.contribute();
        vm.expectRevert(TandaCircle.RoundIncomplete.selector);
        circle.payout();
    }
}

/// @notice Insurance-draw + underfunded scenarios use a 2-member circle where the defaulter
///         has a high score (0.5x collateral) so a single default needs insurance.
contract TandaCircleInsuranceTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    TandaCircle internal circle;

    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address internal bob = address(0xB0B); // recipient round 0, fresh
    address internal risky = address(0x515C); // member1, high score -> 0.5x collateral, defaults

    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 2;
    uint256 internal constant ROUND = 1 days;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        circle = new TandaCircle(
            address(this), address(mxnb), address(sbt), address(uw), address(pool), AMOUNT, MAX, ROUND
        );
        sbt.setCircleAuthorized(address(circle), true);
        pool.setCircleAuthorized(address(circle), true);

        // Boost `risky` reputation so baseScore >= 65 and an adjustedScore of 80 is in band.
        // 4 on-time => base = 50 + 16 = 66. Authorize this test as a circle to write reputation.
        sbt.setCircleAuthorized(address(this), true);
        for (uint256 i = 0; i < 4; i++) sbt.recordOnTime(risky);

        mxnb.mint(bob, AMOUNT * 20);
        mxnb.mint(risky, AMOUNT * 20);
        vm.prank(bob);
        mxnb.approve(address(circle), type(uint256).max);
        vm.prank(risky);
        mxnb.approve(address(circle), type(uint256).max);
    }

    function _joinScore(address who, uint256 score) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, score, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(score, keccak256("ok"), deadline, sig);
    }

    function test_resolveRound_drawsInsuranceForUndercollateralizedDefaulter() public {
        // bob fresh (score 50 -> 2x = 200 collateral); risky score 80 -> 0.5x = 50 collateral
        _joinScore(bob, 50);
        _joinScore(risky, 80);
        assertEq(circle.collateral(risky), 50_000_000); // 0.5x

        // seed the pool generously so it can cover
        mxnb.mint(address(pool), 1_000_000_000);

        circle.start();

        // Round 0 recipient = bob. risky defaults (does not contribute); bob contributes.
        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        // recipient bob made whole: full pot = 2 * AMOUNT
        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);
        // risky owed 100, had 50 collateral -> slashed 50 (to 0), insurance covered 50
        assertEq(circle.collateral(risky), 0);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore - 50_000_000);
        assertEq(pool.totalClaims(), 50_000_000);
        assertTrue(circle.hasDefaulted(risky));
    }

    function test_resolveRound_underfunded_haircutsRecipientAndFlags() public {
        _joinScore(bob, 50);
        _joinScore(risky, 80);
        // Do NOT seed the pool beyond the premiums the two joins contributed:
        //   premium(bob,50)=4% of 100 = 4_000_000 ; premium(risky,80)=1% = 1_000_000 ; pool = 5_000_000
        uint256 poolBal = mxnb.balanceOf(address(pool));
        assertEq(poolBal, 5_000_000);

        circle.start();
        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        vm.expectEmit(true, false, false, true, address(circle));
        // risky owed 100, slashed 50, shortfall 50, insurance covers only 5 -> still short 45
        emit TandaCircle.RoundUnderfunded(0, 45_000_000);
        circle.resolveRound();

        // liquid = bob contribution 100 + risky slash 50 + insurance 5 = 155 ; pot 200
        assertEq(mxnb.balanceOf(bob), bobBefore + 155_000_000);
        assertEq(mxnb.balanceOf(address(pool)), 0); // fully drained
        assertTrue(circle.hasDefaulted(risky));
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-path contracts/test/TandaCircle.t.sol -vv
```

Expected: FAIL — constructor arity changed (8 args), `roundDuration`/`insurancePool`/`roundDeadline`/`hasDefaulted`/`resolveRound`/`RoundNotExpired`/`RoundAlreadyComplete`/`RoundUnderfunded` undefined.

- [ ] **Step 3: Rewrite `contracts/src/TandaCircle.sol`**

Replace the entire file with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";
import {Underwriter} from "./Underwriter.sol";
import {InsurancePool} from "./InsurancePool.sol";

/// @notice One rotating savings circle (ROSCA) in MXNB.
///         Members post AI-quoted collateral and a risk-priced premium at join. Each round all
///         members contribute and the round's recipient receives the pot. If a member misses a
///         contribution, after the round deadline anyone calls resolveRound(): the defaulter's
///         collateral is slashed and the insurance pool tops up any shortfall so the recipient is
///         made whole; the defaulter's reputation is downgraded. Underfunded rounds haircut the
///         recipient and emit RoundUnderfunded (loss surfaced honestly, no magic).
contract TandaCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Forming,
        Active,
        Completed,
        Defaulted
    }

    address public immutable organizer;
    IERC20 public immutable token;
    IReputationSBT public immutable reputation;
    Underwriter public immutable underwriter;
    InsurancePool public immutable insurancePool;
    uint256 public immutable contributionAmount;
    uint8 public immutable maxMembers;
    uint256 public immutable roundDuration;

    State public state;
    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public collateral;
    mapping(address => bool) public hasDefaulted;

    uint256 public currentRound; // 0-indexed; recipient = members[currentRound]
    uint256 public roundDeadline; // contributions for the current round are due by this time
    mapping(uint256 => mapping(address => bool)) public contributedInRound;
    mapping(uint256 => uint256) public roundContributions;

    error NotOrganizer();
    error WrongState();
    error AlreadyMember();
    error CircleFull();
    error NotFull();
    error NotMember();
    error AlreadyContributed();
    error RoundIncomplete();
    error RoundNotExpired();
    error RoundAlreadyComplete();
    error NoCollateral();
    error ZeroAddress();

    event Joined(address indexed member, uint256 index, uint256 collateral, uint256 premium);
    event Started(uint256 timestamp, uint256 roundDeadline);
    event Contributed(address indexed member, uint256 indexed round);
    event PaidOut(address indexed recipient, uint256 indexed round, uint256 amount);
    event MemberDefaulted(
        address indexed member, uint256 indexed round, uint256 owed, uint256 fromCollateral, uint256 fromInsurance
    );
    event RoundUnderfunded(uint256 indexed round, uint256 shortfall);
    event Completed();
    event CollateralWithdrawn(address indexed member, uint256 amount);

    modifier inState(State s) {
        if (state != s) revert WrongState();
        _;
    }

    constructor(
        address organizer_,
        address token_,
        address reputation_,
        address underwriter_,
        address insurancePool_,
        uint256 contributionAmount_,
        uint8 maxMembers_,
        uint256 roundDuration_
    ) {
        if (
            organizer_ == address(0) || token_ == address(0) || reputation_ == address(0)
                || underwriter_ == address(0) || insurancePool_ == address(0)
        ) revert ZeroAddress();
        organizer = organizer_;
        token = IERC20(token_);
        reputation = IReputationSBT(reputation_);
        underwriter = Underwriter(underwriter_);
        insurancePool = InsurancePool(insurancePool_);
        contributionAmount = contributionAmount_;
        maxMembers = maxMembers_;
        roundDuration = roundDuration_;
        state = State.Forming;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function join(uint256 adjustedScore, bytes32 rationaleHash, uint256 deadline, bytes calldata signature)
        external
        inState(State.Forming)
        nonReentrant
    {
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= maxMembers) revert CircleFull();

        uint256 required = underwriter.verifyAndQuote(
            address(this), msg.sender, adjustedScore, rationaleHash, deadline, contributionAmount, signature
        );
        uint256 prem = underwriter.premium(adjustedScore, contributionAmount);

        isMember[msg.sender] = true;
        members.push(msg.sender);
        collateral[msg.sender] = required;
        emit Joined(msg.sender, members.length - 1, required, prem);

        uint256 total = required + prem;
        if (total > 0) {
            token.safeTransferFrom(msg.sender, address(this), total);
        }
        if (prem > 0) {
            token.safeTransfer(address(insurancePool), prem);
            insurancePool.notifyPremium(prem);
        }
    }

    function start() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit Started(block.timestamp, roundDeadline);
    }

    function contribute() external inState(State.Active) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (contributedInRound[currentRound][msg.sender]) revert AlreadyContributed();
        contributedInRound[currentRound][msg.sender] = true;
        roundContributions[currentRound] += 1;
        token.safeTransferFrom(msg.sender, address(this), contributionAmount);
        reputation.recordOnTime(msg.sender);
        emit Contributed(msg.sender, currentRound);
    }

    /// @notice Happy path: everyone has contributed this round; pay the recipient the full pot.
    function payout() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] != members.length) revert RoundIncomplete();
        _settle(contributionAmount * members.length);
    }

    /// @notice Default path: after the round deadline, slash defaulters and draw insurance to make
    ///         the recipient whole, then advance. Reverts if the round is complete (use payout) or
    ///         the deadline has not passed.
    function resolveRound() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] == members.length) revert RoundAlreadyComplete();
        if (block.timestamp <= roundDeadline) revert RoundNotExpired();

        uint256 n = members.length;
        uint256 pot = contributionAmount * n;
        uint256 liquid = roundContributions[currentRound] * contributionAmount;

        for (uint256 i = 0; i < n; i++) {
            address m = members[i];
            if (!contributedInRound[currentRound][m]) {
                hasDefaulted[m] = true;
                uint256 owed = contributionAmount;
                uint256 fromCol = collateral[m] >= owed ? owed : collateral[m];
                collateral[m] -= fromCol;
                uint256 shortfall = owed - fromCol;
                uint256 fromIns = 0;
                if (shortfall > 0) {
                    fromIns = insurancePool.cover(shortfall);
                }
                liquid += fromCol + fromIns;
                reputation.recordDefault(m);
                emit MemberDefaulted(m, currentRound, owed, fromCol, fromIns);
            }
        }

        uint256 payAmount = liquid >= pot ? pot : liquid;
        if (payAmount < pot) {
            emit RoundUnderfunded(currentRound, pot - payAmount);
        }
        _settle(payAmount);
    }

    function _settle(uint256 payAmount) internal {
        address recipient = members[currentRound];
        emit PaidOut(recipient, currentRound, payAmount);

        if (currentRound + 1 == members.length) {
            state = State.Completed;
            for (uint256 i = 0; i < members.length; i++) {
                if (!hasDefaulted[members[i]]) {
                    reputation.recordCompletion(members[i]);
                }
            }
            emit Completed();
        } else {
            currentRound += 1;
            roundDeadline = block.timestamp + roundDuration;
        }
        token.safeTransfer(recipient, payAmount);
    }

    function withdrawCollateral() external inState(State.Completed) nonReentrant {
        uint256 amount = collateral[msg.sender];
        if (amount == 0) revert NoCollateral();
        collateral[msg.sender] = 0;
        emit CollateralWithdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-path contracts/test/TandaCircle.t.sol -vv
```

Expected: PASS (TandaCircleTest 9 + TandaCircleInsuranceTest 2 = 11).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/TandaCircle.sol contracts/test/TandaCircle.t.sol
git commit -m "feat(contracts): TandaCircle default/slash path + insurance draw + round deadline + premium"
```

---

## Task 4: CircleFactory + Deploy + Integration — wire the InsurancePool

**Files:**
- Modify: `contracts/src/CircleFactory.sol`
- Rewrite: `contracts/test/CircleFactory.t.sol`
- Rewrite: `contracts/test/Integration.t.sol`
- Modify: `contracts/script/Deploy.s.sol`

- [ ] **Step 1: Rewrite the factory test**

Replace `contracts/test/CircleFactory.t.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract CircleFactoryTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    CircleFactory internal factory;
    address internal organizer = address(0x0123);
    address internal aiSigner = address(0xA15);

    uint256 internal constant ROUND = 1 days;

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        factory = new CircleFactory(address(mxnb), address(sbt), address(uw), address(pool));
        sbt.transferAdmin(address(factory));
        pool.transferAdmin(address(factory));
    }

    function test_createCircle_deploysAuthorizesTracksOnBothRegistries() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(100_000_000, 3, ROUND);

        assertTrue(factory.isCircle(circleAddr));
        assertEq(factory.allCirclesLength(), 1);
        assertTrue(sbt.isAuthorizedCircle(circleAddr));
        assertTrue(pool.isAuthorizedCircle(circleAddr));

        TandaCircle c = TandaCircle(circleAddr);
        assertEq(c.organizer(), organizer);
        assertEq(c.contributionAmount(), 100_000_000);
        assertEq(c.maxMembers(), 3);
        assertEq(c.roundDuration(), ROUND);
        assertEq(address(c.token()), address(mxnb));
        assertEq(address(c.underwriter()), address(uw));
        assertEq(address(c.insurancePool()), address(pool));
    }

    function test_createCircle_rejectsZeroContribution() public {
        vm.prank(organizer);
        vm.expectRevert(CircleFactory.InvalidParams.selector);
        factory.createCircle(0, 3, ROUND);
    }

    function test_createCircle_rejectsTooFewMembers() public {
        vm.prank(organizer);
        vm.expectRevert(CircleFactory.InvalidParams.selector);
        factory.createCircle(100_000_000, 1, ROUND);
    }

    function test_createCircle_rejectsZeroRoundDuration() public {
        vm.prank(organizer);
        vm.expectRevert(CircleFactory.InvalidParams.selector);
        factory.createCircle(100_000_000, 3, 0);
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract CircleFactoryTest -vv
```

Expected: FAIL — factory constructor arity + `createCircle` signature changed.

- [ ] **Step 3: Modify `contracts/src/CircleFactory.sol`**

Replace the entire file with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TandaCircle} from "./TandaCircle.sol";
import {ReputationSBT} from "./ReputationSBT.sol";
import {Underwriter} from "./Underwriter.sol";
import {InsurancePool} from "./InsurancePool.sol";

/// @notice Deploys and registers TandaCircle instances; authorizes each to write the SBT and to
///         draw on the InsurancePool. Must hold admin on both (via their transferAdmin).
contract CircleFactory {
    address public immutable mxnb;
    ReputationSBT public immutable reputation;
    Underwriter public immutable underwriter;
    InsurancePool public immutable insurancePool;

    address[] public allCircles;
    mapping(address => bool) public isCircle;

    error InvalidParams();
    error ZeroAddress();

    event CircleCreated(
        address indexed circle, address indexed organizer, uint256 contributionAmount, uint8 maxMembers
    );

    constructor(address mxnb_, address reputation_, address underwriter_, address insurancePool_) {
        if (
            mxnb_ == address(0) || reputation_ == address(0) || underwriter_ == address(0)
                || insurancePool_ == address(0)
        ) revert ZeroAddress();
        mxnb = mxnb_;
        reputation = ReputationSBT(reputation_);
        underwriter = Underwriter(underwriter_);
        insurancePool = InsurancePool(insurancePool_);
    }

    function allCirclesLength() external view returns (uint256) {
        return allCircles.length;
    }

    function createCircle(uint256 contributionAmount, uint8 maxMembers, uint256 roundDuration)
        external
        returns (address)
    {
        if (contributionAmount == 0 || maxMembers < 2 || roundDuration == 0) revert InvalidParams();
        TandaCircle circle = new TandaCircle(
            msg.sender,
            mxnb,
            address(reputation),
            address(underwriter),
            address(insurancePool),
            contributionAmount,
            maxMembers,
            roundDuration
        );
        address addr = address(circle);
        allCircles.push(addr);
        isCircle[addr] = true;
        reputation.setCircleAuthorized(addr, true);
        insurancePool.setCircleAuthorized(addr, true);
        emit CircleCreated(addr, msg.sender, contributionAmount, maxMembers);
        return addr;
    }
}
```

- [ ] **Step 4: Run factory tests**

```bash
cd contracts && forge test --match-contract CircleFactoryTest -vv
```

Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite the integration test** (premium-aware lifecycle + default scenario)

Replace `contracts/test/Integration.t.sol` with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract IntegrationTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    CircleFactory internal factory;

    address internal organizer = address(0xABCD);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address[] internal members;
    uint256 internal constant AMOUNT = 100_000_000;
    uint256 internal constant COLLATERAL_FRESH = 200_000_000;
    uint8 internal constant MAX = 3;
    uint256 internal constant ROUND = 1 days;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        factory = new CircleFactory(address(mxnb), address(sbt), address(uw), address(pool));
        sbt.transferAdmin(address(factory));
        pool.transferAdmin(address(factory));
        mxnb.mint(address(pool), 1_000_000_000); // protocol-seeded buffer

        members.push(address(0x1));
        members.push(address(0x2));
        members.push(address(0x3));
    }

    function _join(TandaCircle circle, address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, 50, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function test_endToEndHappyLifecycle() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX, ROUND);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            _join(circle, members[i]);
            assertEq(circle.collateral(members[i]), COLLATERAL_FRESH);
        }

        vm.prank(organizer);
        circle.start();

        for (uint256 round = 0; round < members.length; round++) {
            address recipient = members[round];
            uint256 before = mxnb.balanceOf(recipient);
            for (uint256 i = 0; i < members.length; i++) {
                vm.prank(members[i]);
                circle.contribute();
            }
            circle.payout();
            assertEq(mxnb.balanceOf(recipient), before + AMOUNT * (members.length - 1));
        }

        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            circle.withdrawCollateral();
            (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(members[i]);
            assertEq(rounds, 3);
            assertEq(onTime, 3);
            assertEq(completed, 1);
            assertEq(sbt.balanceOf(members[i]), 1);
        }
    }

    function test_defaultScenario_recipientMadeWhole_circleContinues() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX, ROUND);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            _join(circle, members[i]);
        }
        vm.prank(organizer);
        circle.start();

        // Round 0 happy: members[0] paid
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            circle.contribute();
        }
        circle.payout();

        // Round 1: members[0] defaults (the classic early-recipient scam); others contribute
        vm.prank(members[1]);
        circle.contribute();
        vm.prank(members[2]);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        address recipient1 = members[1];
        uint256 before = mxnb.balanceOf(recipient1);
        circle.resolveRound();

        // recipient is STILL made whole despite the default
        assertEq(mxnb.balanceOf(recipient1), before + AMOUNT * (members.length - 1));
        assertTrue(circle.hasDefaulted(members[0]));
        (,,, uint32 defaults,) = sbt.reputation(members[0]);
        assertEq(defaults, 1);
        // circle keeps going
        assertEq(circle.currentRound(), 2);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }
}
```

- [ ] **Step 6: Modify `contracts/script/Deploy.s.sol`**

Replace the entire file with:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

contract Deploy is Script {
    function run() external {
        address aiSigner = vm.envOr("AI_SIGNER", msg.sender);
        uint256 seed = vm.envOr("INSURANCE_SEED", uint256(0));

        vm.startBroadcast();
        MockMXNB mxnb = new MockMXNB();
        ReputationSBT sbt = new ReputationSBT(msg.sender);
        Underwriter underwriter = new Underwriter(address(sbt), aiSigner);
        InsurancePool pool = new InsurancePool(address(mxnb), msg.sender);
        CircleFactory factory =
            new CircleFactory(address(mxnb), address(sbt), address(underwriter), address(pool));
        sbt.transferAdmin(address(factory));
        pool.transferAdmin(address(factory));
        if (seed > 0) {
            mxnb.mint(address(pool), seed);
        }
        vm.stopBroadcast();

        console2.log("MockMXNB:      ", address(mxnb));
        console2.log("ReputationSBT: ", address(sbt));
        console2.log("Underwriter:   ", address(underwriter));
        console2.log("InsurancePool: ", address(pool));
        console2.log("CircleFactory: ", address(factory));
        console2.log("AI signer:     ", aiSigner);
        console2.log("Insurance seed:", seed);
    }
}
```

- [ ] **Step 7: Run the full contract suite**

```bash
cd contracts && forge test -vv
```

Expected: ALL green. Counts: MockMXNB 2 + ReputationSBT 8 + Underwriter 14 + InsurancePool 8 + TandaCircle 9 + TandaCircleInsurance 2 + CircleFactory 4 + Integration 2 + CrossLayer 1 = **50**.

- [ ] **Step 8: Dry-run the deploy**

```bash
cd contracts && forge script script/Deploy.s.sol:Deploy --sender 0x0000000000000000000000000000000000000001
```

Expected: clean simulation logging seven lines.

- [ ] **Step 9: Commit**

```bash
git add contracts/src/CircleFactory.sol contracts/test/CircleFactory.t.sol contracts/test/Integration.t.sol contracts/script/Deploy.s.sol
git commit -m "feat(contracts): wire InsurancePool through factory + deploy; default integration scenario"
```

---

## Phase 3 Done — Definition of Done

- [ ] `cd contracts && forge test -vv` green (50 tests).
- [ ] `cd agent && npx vitest run` still green (12 — unchanged).
- [ ] `forge script script/Deploy.s.sol:Deploy --sender 0x...01` simulates cleanly (7 logged lines incl. InsurancePool + seed).
- [ ] Demoable money-shot: a member defaults; `resolveRound()` slashes their collateral, draws insurance for any shortfall, makes the recipient whole, downgrades the defaulter's reputation, and the circle continues — whereas a naive ROSCA would lose the money. Premiums (risk-priced at join) fund the pool; underfunded rounds haircut the recipient and emit `RoundUnderfunded` (honest, no magic).

**Next:** Phase 4 — auction payout ordering (bidding within AI risk bands).

---

## Self-Review

**Spec coverage (design spec §4.1 InsurancePool + §5.7 default path + premium):** ✔ InsurancePool buffer + premium accounting + capped cover (Task 1), ✔ risk-priced premium ladder (Task 2), ✔ default/slash path: deadline, resolveRound, slash collateral, draw insurance, recordDefault, hasDefaulted, completion only for clean members, honest underfunded haircut (Task 3), ✔ factory authorizes circles on the pool + deploy seeds it + default integration scenario (Task 4). Deferred by design: auction → Phase 4, AA → Phase 5, monitoring → Phase 6, punitive over-slash → future.

**Placeholder scan:** No TBD/TODO. No agent (TS) changes — premium is derived on-chain from the same verified score, so the agent's existing signed decision already drives it; noted explicitly, not a gap.

**Type consistency:** `premium(uint256,uint256)` consistent between `Underwriter.sol` and all callers (`TandaCircle.join`, premium tests). `TandaCircle` constructor arity (organizer, token, reputation, underwriter, insurancePool, contributionAmount, maxMembers, roundDuration) consistent across the contract, factory deployment, all test setups, and (via factory) the deploy script. `createCircle(uint256,uint8,uint256)` consistent across factory, factory tests, integration. `CircleFactory` constructor (mxnb, reputation, underwriter, insurancePool) consistent across contract, tests, deploy. `InsurancePool` interface (`setCircleAuthorized`, `transferAdmin`, `notifyPremium`, `cover`, `balance`, `isAuthorizedCircle`, `totalPremiums`, `totalClaims`) consistent across the contract, its tests, the circle's calls, and the factory's authorization. `resolveRound`/`hasDefaulted`/`roundDeadline`/`roundDuration`/`RoundNotExpired`/`RoundAlreadyComplete`/`RoundUnderfunded`/`MemberDefaulted` consistent across `TandaCircle.sol` and both test contracts. The default-settlement collateral-conservation argument (Decision 4) is checked by `test_defaulter_getsNoCompletionCredit_butKeepsRemainingCollateral` (balance returns) and the insurance/underfunded tests (exact pool deltas).
