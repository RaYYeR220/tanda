# Tanda Phase 4 — Auction Payout Ordering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let members bid for earlier payout slots (the Mexican *tanda de puja*), but only within risk bands the AI assigns — a risky member cannot win an early slot no matter how high they bid. Bids are real (the fee funds the insurance pool); slot assignment is greedy-by-fee within each member's AI-allowed earliest slot.

**Architecture:** Add an opt-in `Bidding` lifecycle phase between `Forming` and `Active`. `start()` stays as the no-auction shortcut (payout order = join order) so all Phase-3 behavior is preserved unchanged. The auction path is `openBidding()` → members `bid(fee)` (fee forwarded to the insurance pool, like a premium — it never touches the pot or collateral, so Phase-3 conservation is untouched) → `finalizeBidding()` assigns slots greedily by descending fee, constrained by each member's AI-allowed earliest slot, then transitions to `Active`. `Underwriter.earliestSlot(score, n)` defines the risk band. `payoutOrder` (a permutation of `members`) drives the recipient selection in `_settle`. The member's AI score is captured at join (`memberScore`).

**Tech Stack:** Solidity ^0.8.24 + Foundry + OpenZeppelin v5. No TypeScript changes required for the contract layer; an optional agent helper for bid-band display is out of scope here.

---

## Design decisions locked (read before implementing)

**1. Lifecycle.** `enum State { Forming, Bidding, Active, Completed, Defaulted }`. Two mutually exclusive transitions out of `Forming` (both organizer-only, both require the circle full):
- `start()` — unchanged Phase-3 behavior: sets `payoutOrder = [0,1,...,n-1]` (join order), goes `Active`, sets `roundDeadline`. **All existing tests keep using this.**
- `openBidding()` — goes `Bidding`, sets `bidDeadline = block.timestamp + bidDuration`. Members then `bid()`. `finalizeBidding()` assigns slots and goes `Active`.

**2. `memberScore` captured at join.** `join` already calls `verifyAndQuote` with the clamped `adjustedScore`. Store it: `mapping(address => uint256) public memberScore; memberScore[msg.sender] = adjustedScore;`. (The score is already validated in-band by `verifyAndQuote`, so it's a trustworthy signal.)

**3. AI risk band — `Underwriter.earliestSlot(score, n) pure → uint256`:** the earliest (0-indexed) payout slot a member of this score may occupy in a circle of `n` members.
- `score >= 80` → 0 (no restriction)
- `score >= 50` → 0 (no restriction)
- `score >= 30` → `n/4` (integer division; e.g. n=4 → slot 1+)
- `score < 30`  → `n/2` (e.g. n=4 → slot 2+)
Rationale: a risky member must wait — by a later slot they will have paid more in before receiving, reducing loss-given-default. Cold-start (50) is unrestricted (they post 2× collateral already).

**4. `bid(uint256 fee)` during `Bidding`:** member-only, once per member (`AlreadyBid`), `fee > 0` (`ZeroBid`). The fee is pulled (`safeTransferFrom`) and immediately forwarded to the insurance pool (`safeTransfer` + `notifyPremium`) — identical mechanics to the join premium, so it does not enter the pot/collateral accounting. Records `bidFee[member] = fee`. Not bidding is allowed; a non-bidder is treated as `fee = 0`.

**5. `finalizeBidding()` — organizer-only, after `bidDeadline` OR all members bid.** Assigns `payoutOrder` (length n, a permutation of member indices):
- Build a list of members sorted by descending `bidFee` (ties broken by ascending join index — deterministic).
- Greedy: for each member in that order, place them in the earliest still-free slot that is `>= earliestSlot(memberScore[m], n)`. If none free at/after their floor (because higher bidders took them), place them in the earliest free slot anywhere (repair pass — guarantees a complete permutation; never reverts). This means a high bid buys priority *within* the allowed band, and the band is never violated unless infeasible, in which case the repair keeps the circle functional.
- After assignment, `state = Active`, set `roundDeadline = block.timestamp + roundDuration`, emit `BiddingFinalized`.

**6. `_settle` uses `payoutOrder`.** Replace `recipient = members[currentRound]` with `recipient = members[payoutOrder[currentRound]]`. For the no-auction `start()` path, `payoutOrder` is the identity, so behavior is identical to Phase 3. The default loop in `resolveRound` still iterates ALL members (order-independent) — unchanged.

**7. Conservation preserved.** Bids go to the insurance pool, never the pot. Collateral/contribution/payout accounting from Phase 3 is byte-for-byte unchanged except the single recipient-index line. The Phase-3 fund-safety proof still holds.

**8. Phase boundaries.** AA → Phase 5. Monitoring → Phase 6. The agent's bid-band UI hinting → frontend phase. Surplus-redistribution of bid discounts (a fancier auction) is intentionally simplified to "fee funds the pool" — note as future work; it keeps conservation trivial and the demo crisp.

---

## File Structure

```
contracts/
  src/
    Underwriter.sol      # MODIFY: add earliestSlot(score, n) pure
    TandaCircle.sol      # MODIFY: Bidding state, memberScore, bid/openBidding/finalizeBidding, payoutOrder, _settle index
    CircleFactory.sol    # MODIFY: createCircle takes bidDuration; pass to circle
  test/
    Underwriter.t.sol    # MODIFY: earliestSlot tests
    Auction.t.sol        # NEW: bidding lifecycle, risk-band enforcement, greedy assignment, demo scenario
    TandaCircle.t.sol    # MODIFY: constructor arity (+bidDuration); start() path otherwise unchanged
    CircleFactory.t.sol  # MODIFY: createCircle arity (+bidDuration)
    Integration.t.sol    # MODIFY: constructor/createCircle arity; add one auction-path integration test
  script/
    Deploy.s.sol         # (no change needed unless createCircle is called there — it is not)
```

---

## Task 1: Underwriter — earliestSlot risk band

**Files:**
- Modify: `contracts/src/Underwriter.sol`
- Modify: `contracts/test/Underwriter.t.sol`

- [ ] **Step 1: Add failing tests**

Append a new test contract to `contracts/test/Underwriter.t.sol`:

```solidity
contract UnderwriterEarliestSlotTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;

    function setUp() public {
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), address(0xA15));
    }

    function test_highScoreUnrestricted() public view {
        assertEq(uw.earliestSlot(80, 4), 0);
        assertEq(uw.earliestSlot(50, 4), 0);
    }

    function test_midScoreQuarterFloor() public view {
        // score in [30,50): floor = n/4
        assertEq(uw.earliestSlot(40, 4), 1);
        assertEq(uw.earliestSlot(30, 8), 2);
    }

    function test_lowScoreHalfFloor() public view {
        // score < 30: floor = n/2
        assertEq(uw.earliestSlot(20, 4), 2);
        assertEq(uw.earliestSlot(0, 6), 3);
    }

    function test_boundaries() public view {
        assertEq(uw.earliestSlot(50, 4), 0); // >=50 unrestricted
        assertEq(uw.earliestSlot(49, 4), 1); // >=30 -> n/4
        assertEq(uw.earliestSlot(30, 4), 1);
        assertEq(uw.earliestSlot(29, 4), 2); // <30 -> n/2
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract UnderwriterEarliestSlotTest -vv
```

Expected: FAIL — `earliestSlot` undefined.

- [ ] **Step 3: Add `earliestSlot` to `contracts/src/Underwriter.sol`** (immediately after `premium`)

```solidity
    /// @notice Earliest 0-indexed payout slot a member of `score` may occupy in a circle of `n`.
    ///         Riskier members are pushed later so they pay more in before receiving the pot.
    function earliestSlot(uint256 score, uint256 n) public pure returns (uint256) {
        if (score >= 50) return 0;
        if (score >= 30) return n / 4;
        return n / 2;
    }
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-path contracts/test/Underwriter.t.sol -vv
```

Expected: PASS (14 prior + 4 new = 18).

- [ ] **Step 5: Commit**

```bash
git add contracts/src/Underwriter.sol contracts/test/Underwriter.t.sol
git commit -m "feat(contracts): Underwriter earliestSlot risk band for auction ordering"
```

---

## Task 2: TandaCircle — bidding lifecycle + risk-banded slot assignment

**Files:**
- Modify: `contracts/src/TandaCircle.sol`
- Create: `contracts/test/Auction.t.sol`

This task adds the auction path WITHOUT changing the `start()` path. `TandaCircle.t.sol` only needs its constructor calls widened (Task 3); the existing assertions stay valid because `start()` sets the identity `payoutOrder`.

- [ ] **Step 1: Write the failing auction test**

`contracts/test/Auction.t.sol`:

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

contract AuctionTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    TandaCircle internal circle;

    address internal organizer = address(this);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;

    address internal hi = address(0x4111); // high score, bids low
    address internal mid = address(0x4222); // fresh score 50, bids high
    address internal risky = address(0x4333); // low score, bids highest but capped late

    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 4; // 4 members
    uint256 internal constant ROUND = 1 days;
    uint256 internal constant BIDDUR = 1 hours;

    // a 4th plain member to fill the circle
    address internal d4 = address(0x4444);

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        circle = new TandaCircle(
            organizer, address(mxnb), address(sbt), address(uw), address(pool), AMOUNT, MAX, ROUND, BIDDUR
        );
        sbt.setCircleAuthorized(address(circle), true);
        pool.setCircleAuthorized(address(circle), true);
        sbt.setCircleAuthorized(address(this), true); // to seed reputation

        // give risky a poor record: 1 default => base 50 - 25 = 25 (<30 band -> floor n/2 = 2)
        sbt.recordDefault(risky);

        address[4] memory who = [hi, mid, risky, d4];
        for (uint256 i = 0; i < who.length; i++) {
            mxnb.mint(who[i], AMOUNT * 20);
            vm.prank(who[i]);
            mxnb.approve(address(circle), type(uint256).max);
        }
    }

    function _join(address who, uint256 score) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, score, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(score, keccak256("ok"), deadline, sig);
    }

    function _bid(address who, uint256 fee) internal {
        vm.prank(who);
        circle.bid(fee);
    }

    function _joinAll() internal {
        _join(hi, 50); // fresh-ish, unrestricted (score 50)
        _join(mid, 50); // unrestricted
        _join(risky, 25); // base 25, in band [25-15,25+15] -> submit 25; floor n/2 = 2
        _join(d4, 50); // unrestricted
    }

    function test_openBidding_setsState() public {
        _joinAll();
        circle.openBidding();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Bidding));
        assertEq(circle.bidDeadline(), block.timestamp + BIDDUR);
    }

    function test_bid_forwardsFeeToPool() public {
        _joinAll();
        circle.openBidding();
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        _bid(mid, 5_000_000);
        assertEq(circle.bidFee(mid), 5_000_000);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore + 5_000_000);
    }

    function test_bid_rejectsDoubleAndZero() public {
        _joinAll();
        circle.openBidding();
        vm.prank(mid);
        vm.expectRevert(TandaCircle.ZeroBid.selector);
        circle.bid(0);

        _bid(mid, 1_000_000);
        vm.prank(mid);
        vm.expectRevert(TandaCircle.AlreadyBid.selector);
        circle.bid(2_000_000);
    }

    function test_riskyCannotWinEarlySlotDespiteTopBid() public {
        _joinAll();
        circle.openBidding();

        // risky bids the most, but is score-capped to slot >= n/2 = 2
        _bid(risky, 50_000_000);
        _bid(mid, 10_000_000);
        _bid(hi, 1_000_000);
        // d4 does not bid (fee 0)

        circle.finalizeBidding();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));

        // slot 0 (earliest) must NOT be risky; should be the highest UNRESTRICTED bidder = mid
        assertEq(circle.payoutOrderAt(0), _indexOf(mid));
        // risky must be at slot >= 2
        uint256 riskySlot = _slotOf(risky);
        assertGe(riskySlot, 2);
    }

    function test_finalizeBidding_producesFullPermutation() public {
        _joinAll();
        circle.openBidding();
        _bid(risky, 50_000_000);
        _bid(mid, 10_000_000);
        circle.finalizeBidding();

        // every slot 0..3 maps to a distinct member index 0..3
        bool[4] memory seen;
        for (uint256 s = 0; s < 4; s++) {
            uint256 idx = circle.payoutOrderAt(s);
            assertLt(idx, 4);
            assertFalse(seen[idx]);
            seen[idx] = true;
        }
    }

    function test_finalize_thenRunCircle_recipientFollowsPayoutOrder() public {
        _joinAll();
        circle.openBidding();
        _bid(mid, 10_000_000);
        circle.finalizeBidding();

        address slot0 = circle.members(circle.payoutOrderAt(0));
        uint256 before = mxnb.balanceOf(slot0);

        // round 0: everyone contributes; recipient must be slot0 member
        _contributeAll();
        circle.payout();
        assertEq(mxnb.balanceOf(slot0), before + AMOUNT * (4 - 1));
    }

    function _contributeAll() internal {
        vm.prank(hi);
        circle.contribute();
        vm.prank(mid);
        circle.contribute();
        vm.prank(risky);
        circle.contribute();
        vm.prank(d4);
        circle.contribute();
    }

    function _indexOf(address who) internal view returns (uint256) {
        for (uint256 i = 0; i < 4; i++) {
            if (circle.members(i) == who) return i;
        }
        revert("not member");
    }

    function _slotOf(address who) internal view returns (uint256) {
        uint256 idx = _indexOf(who);
        for (uint256 s = 0; s < 4; s++) {
            if (circle.payoutOrderAt(s) == idx) return s;
        }
        revert("not in order");
    }

    function test_cannotBidOutsideBiddingState() public {
        _joinAll();
        // still Forming
        vm.prank(mid);
        vm.expectRevert(TandaCircle.WrongState.selector);
        circle.bid(1_000_000);
    }

    function test_startStillWorksAsNoAuctionShortcut() public {
        _joinAll();
        circle.start(); // skip auction
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
        // identity order: slot i -> member i
        for (uint256 s = 0; s < 4; s++) {
            assertEq(circle.payoutOrderAt(s), s);
        }
    }
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd contracts && forge test --match-contract AuctionTest -vv
```

Expected: FAIL — constructor arity (9 args now), `Bidding`/`openBidding`/`bid`/`finalizeBidding`/`bidFee`/`bidDeadline`/`payoutOrderAt`/`ZeroBid`/`AlreadyBid` undefined.

- [ ] **Step 3: Modify `contracts/src/TandaCircle.sol`**

Apply these exact changes:

1. Add to the enum: `Bidding` between `Forming` and `Active`:
```solidity
    enum State {
        Forming,
        Bidding,
        Active,
        Completed,
        Defaulted
    }
```

2. Add an immutable `bidDuration` and storage for scores/bids/order. After `uint256 public immutable roundDuration;` add:
```solidity
    uint256 public immutable bidDuration;
```
And in the storage section (after `mapping(address => bool) public hasDefaulted;`) add:
```solidity
    mapping(address => uint256) public memberScore; // AI-clamped score captured at join
    mapping(address => uint256) public bidFee; // auction bid (0 if not bid)
    uint256 public bidDeadline;
    uint256[] public payoutOrder; // slot -> member index; identity for the no-auction path
```

3. Add errors:
```solidity
    error ZeroBid();
    error AlreadyBid();
    error BidNotClosed();
```

4. Add events:
```solidity
    event BiddingOpened(uint256 bidDeadline);
    event BidPlaced(address indexed member, uint256 fee);
    event BiddingFinalized(uint256[] payoutOrder);
```

5. Add `bidDuration_` as the LAST constructor parameter and assign it:
```solidity
    constructor(
        address organizer_,
        address token_,
        address reputation_,
        address underwriter_,
        address insurancePool_,
        uint256 contributionAmount_,
        uint8 maxMembers_,
        uint256 roundDuration_,
        uint256 bidDuration_
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
        bidDuration = bidDuration_;
        state = State.Forming;
    }
```

6. In `join`, capture the score. After `collateral[msg.sender] = required;` add:
```solidity
        memberScore[msg.sender] = adjustedScore;
```

7. Refactor `start()` to set the identity payout order:
```solidity
    function start() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        _initIdentityOrder();
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit Started(block.timestamp, roundDeadline);
    }

    function _initIdentityOrder() internal {
        for (uint256 i = 0; i < members.length; i++) {
            payoutOrder.push(i);
        }
    }
```

8. Add the auction functions AFTER `start()` (and `_initIdentityOrder`):
```solidity
    /// @notice Organizer opens the bidding phase (alternative to start()).
    function openBidding() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Bidding;
        bidDeadline = block.timestamp + bidDuration;
        emit BiddingOpened(bidDeadline);
    }

    /// @notice Member bids a fee for an earlier payout slot. The fee funds the insurance pool
    ///         (it never enters the pot or collateral). One bid per member; fee must be > 0.
    function bid(uint256 fee) external inState(State.Bidding) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (fee == 0) revert ZeroBid();
        if (bidFee[msg.sender] != 0) revert AlreadyBid();
        bidFee[msg.sender] = fee;
        token.safeTransferFrom(msg.sender, address(this), fee);
        token.safeTransfer(address(insurancePool), fee);
        insurancePool.notifyPremium(fee);
        emit BidPlaced(msg.sender, fee);
    }

    /// @notice Organizer finalizes the auction: assign payout slots greedily by descending fee,
    ///         constrained by each member's AI-allowed earliest slot, then go Active.
    function finalizeBidding() external inState(State.Bidding) {
        if (msg.sender != organizer) revert NotOrganizer();
        bool allBid = true;
        uint256 n = members.length;
        for (uint256 i = 0; i < n; i++) {
            if (bidFee[members[i]] == 0) {
                allBid = false;
                break;
            }
        }
        if (!allBid && block.timestamp <= bidDeadline) revert BidNotClosed();

        // order members by descending fee, ties by ascending join index (selection sort, n is tiny)
        uint256[] memory order = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            order[i] = i;
        }
        for (uint256 i = 0; i < n; i++) {
            uint256 best = i;
            for (uint256 j = i + 1; j < n; j++) {
                uint256 fj = bidFee[members[order[j]]];
                uint256 fb = bidFee[members[order[best]]];
                if (fj > fb || (fj == fb && order[j] < order[best])) {
                    best = j;
                }
            }
            (order[i], order[best]) = (order[best], order[i]);
        }

        // assign slots: greedy within each member's floor, repair pass for anything left
        uint256 SENTINEL = type(uint256).max;
        uint256[] memory slotToMember = new uint256[](n);
        for (uint256 s = 0; s < n; s++) {
            slotToMember[s] = SENTINEL;
        }
        // pass 1: honor floors
        for (uint256 k = 0; k < n; k++) {
            uint256 mIdx = order[k];
            uint256 floor = underwriter.earliestSlot(memberScore[members[mIdx]], n);
            for (uint256 s = floor; s < n; s++) {
                if (slotToMember[s] == SENTINEL) {
                    slotToMember[s] = mIdx;
                    break;
                }
            }
        }
        // pass 2 (repair): place any unplaced member in the earliest free slot anywhere
        for (uint256 k = 0; k < n; k++) {
            uint256 mIdx = order[k];
            bool placed = false;
            for (uint256 s = 0; s < n; s++) {
                if (slotToMember[s] == mIdx) {
                    placed = true;
                    break;
                }
            }
            if (placed) continue;
            for (uint256 s = 0; s < n; s++) {
                if (slotToMember[s] == SENTINEL) {
                    slotToMember[s] = mIdx;
                    break;
                }
            }
        }

        for (uint256 s = 0; s < n; s++) {
            payoutOrder.push(slotToMember[s]);
        }
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit BiddingFinalized(payoutOrder);
        emit Started(block.timestamp, roundDeadline);
    }

    /// @notice Helper: the member index scheduled to receive the pot in slot `s`.
    function payoutOrderAt(uint256 s) external view returns (uint256) {
        return payoutOrder[s];
    }
```

9. In `_settle`, change the recipient line from `members[currentRound]` to use the order:
```solidity
        address recipient = members[payoutOrder[currentRound]];
```

- [ ] **Step 4: Run to verify it passes**

```bash
cd contracts && forge test --match-contract AuctionTest -vv
```

Expected: PASS (9 tests). If `test_riskyCannotWinEarlySlotDespiteTopBid` fails, re-read Decision 5 — the floor for risky (score 25 → `n/2 = 2`) must keep them out of slots 0 and 1; the highest unrestricted bidder takes slot 0.

- [ ] **Step 5: Commit**

```bash
git add contracts/src/TandaCircle.sol contracts/test/Auction.t.sol
git commit -m "feat(contracts): bidding phase with AI risk-banded greedy slot assignment"
```

---

## Task 3: Fix constructor/createCircle arity across the suite

**Files:**
- Modify: `contracts/src/CircleFactory.sol`
- Modify: `contracts/test/TandaCircle.t.sol`
- Modify: `contracts/test/CircleFactory.t.sol`
- Modify: `contracts/test/Integration.t.sol`

Adding `bidDuration` to the `TandaCircle` constructor (and `createCircle`) breaks every existing instantiation. Thread a `bidDuration` through and fix the call sites. The Phase-3 assertions are otherwise unchanged.

- [ ] **Step 1: Modify `contracts/src/CircleFactory.sol`**

Change `createCircle` to accept and pass `bidDuration`:

```solidity
    function createCircle(uint256 contributionAmount, uint8 maxMembers, uint256 roundDuration, uint256 bidDuration)
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
            roundDuration,
            bidDuration
        );
        address addr = address(circle);
        allCircles.push(addr);
        isCircle[addr] = true;
        reputation.setCircleAuthorized(addr, true);
        insurancePool.setCircleAuthorized(addr, true);
        emit CircleCreated(addr, msg.sender, contributionAmount, maxMembers);
        return addr;
    }
```

- [ ] **Step 2: Fix `contracts/test/TandaCircle.t.sol`**

In BOTH test contracts (`TandaCircleTest` and `TandaCircleInsuranceTest`), find the `new TandaCircle(...)` call in `setUp` and add a trailing `bidDuration` argument. Add a constant near the other constants in each contract:
```solidity
    uint256 internal constant BIDDUR = 1 hours;
```
and change the constructor call to end with `..., ROUND, BIDDUR)`:
```solidity
        circle = new TandaCircle(
            organizer, address(mxnb), address(sbt), address(uw), address(pool), AMOUNT, MAX, ROUND, BIDDUR
        );
```
(for `TandaCircleInsuranceTest`, the organizer arg is `address(this)` — keep it; just append `, BIDDUR`). No other changes — `start()` keeps the identity order so all existing assertions pass.

- [ ] **Step 3: Fix `contracts/test/CircleFactory.t.sol`**

Add `uint256 internal constant BIDDUR = 1 hours;` near `ROUND`, and update EVERY `factory.createCircle(...)` call to pass a 4th arg. The valid calls become `factory.createCircle(100_000_000, 3, ROUND, BIDDUR)` etc. For the `rejectsZeroRoundDuration` test keep `ROUND`→`0` in the third position and pass `BIDDUR` fourth: `factory.createCircle(100_000_000, 3, 0, BIDDUR)`. Update each existing call:
- `test_createCircle_deploysAuthorizesTracksOnBothRegistries`: `factory.createCircle(100_000_000, 3, ROUND, BIDDUR)`
- `test_createCircle_emitsEvent`: `factory.createCircle(50_000_000, 5, ROUND, BIDDUR)`
- `test_createCircle_rejectsZeroContribution`: `factory.createCircle(0, 3, ROUND, BIDDUR)`
- `test_createCircle_rejectsTooFewMembers`: `factory.createCircle(100_000_000, 1, ROUND, BIDDUR)`
- `test_createCircle_rejectsZeroRoundDuration`: `factory.createCircle(100_000_000, 3, 0, BIDDUR)`

- [ ] **Step 4: Fix `contracts/test/Integration.t.sol`**

Add `uint256 internal constant BIDDUR = 1 hours;` near `ROUND`, and update both `factory.createCircle(AMOUNT, MAX, ROUND)` calls to `factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR)`.

- [ ] **Step 5: Run the full suite**

```bash
cd contracts && forge test -vv
```

Expected: ALL green. Counts: MockMXNB 2 + ReputationSBT 8 + Underwriter 18 + InsurancePool 8 + TandaCircle 9 + TandaCircleInsurance 2 + Auction 9 + CircleFactory 5 + Integration 2 + CrossLayer 1 = **64**.

- [ ] **Step 6: Commit**

```bash
git add contracts/src/CircleFactory.sol contracts/test/TandaCircle.t.sol contracts/test/CircleFactory.t.sol contracts/test/Integration.t.sol
git commit -m "feat(contracts): thread bidDuration through factory + fix call sites"
```

---

## Task 4: Auction integration scenario (demo money-shot #2)

**Files:**
- Modify: `contracts/test/Integration.t.sol`

Prove the auction end-to-end through the factory: a risky member out-bids everyone for slot 0 but the AI band keeps them out; the circle then runs to completion with the auction order.

- [ ] **Step 1: Add the integration test**

Append to `contracts/test/Integration.t.sol` inside `IntegrationTest` (the `_join` helper, `aiKey`, `pool`, `factory` are already in scope; note `_join` uses score 50 — add a scored variant):

```solidity
    function _joinScored(TandaCircle circle, address who, uint256 score) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, score, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(score, keccak256("ok"), deadline, sig);
    }

    function test_auctionScenario_riskyOutbidButBandWins() public {
        // give members[0] a default so its base score is 25 (<30 -> floor n/2)
        sbt.setCircleAuthorized(address(this), true);
        sbt.recordDefault(members[0]);

        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
        }
        _joinScored(circle, members[0], 25); // risky
        _joinScored(circle, members[1], 50);
        _joinScored(circle, members[2], 50);

        vm.prank(organizer);
        circle.openBidding();

        // risky bids the most
        vm.prank(members[0]);
        circle.bid(50_000_000);
        vm.prank(members[1]);
        circle.bid(5_000_000);

        vm.prank(organizer);
        circle.finalizeBidding();

        // members[0] (risky, score 25, n=3 -> floor n/2 = 1) cannot be in slot 0
        assertTrue(circle.payoutOrderAt(0) != 0);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }
```

> NOTE: `members` in IntegrationTest is `[0x1, 0x2, 0x3]` (n=3). For n=3, floor n/2 = 1, so the risky member is barred from slot 0 — exactly what the assertion checks. `BIDDUR` must be declared in this contract (Task 3 Step 4 added it).

- [ ] **Step 2: Run it**

```bash
cd contracts && forge test --match-contract IntegrationTest -vv
```

Expected: PASS (3 tests now: happy, default, auction).

- [ ] **Step 3: Run the full suite + deploy sim**

```bash
cd contracts && forge test -vv
cd contracts && forge script script/Deploy.s.sol:Deploy --sender 0x0000000000000000000000000000000000000001
```

Expected: all green (65 with the new auction integration test); deploy simulates 7 lines unchanged.

- [ ] **Step 4: Commit**

```bash
git add contracts/test/Integration.t.sol
git commit -m "test(contracts): auction integration — risky out-bids but AI band wins slot 0"
```

---

## Phase 4 Done — Definition of Done

- [ ] `cd contracts && forge test -vv` green (~65 tests).
- [ ] `cd agent && npx vitest run` still green (12 — unchanged).
- [ ] `forge script ... Deploy` simulates cleanly (7 lines).
- [ ] Demoable: members bid for earlier slots (fee funds the insurance pool); a risky member out-bids everyone but the AI risk band keeps them out of early slots; the no-auction `start()` path still works identically to Phase 3; Phase-3 conservation is preserved (bids never touch the pot/collateral).

**Next:** Phase 6 (agentic monitoring / early-warning) — then Phase 5 (AA gasless) folded into the frontend phase.

---

## Self-Review

**Spec coverage (design spec §5.3 auction within AI risk bands):** ✔ risk band `earliestSlot` (Task 1), ✔ Bidding lifecycle + bid (fee→pool) + greedy-by-fee assignment within bands + repair pass (Task 2), ✔ arity threaded through factory/tests (Task 3), ✔ demo scenario: risky out-bids but band wins (Task 4). The `start()` no-auction path is preserved so Phase-3 conservation and all prior tests hold unchanged. Deferred by design: surplus-redistribution auction variant (simplified to fee-funds-pool), AA → Phase 5, monitoring → Phase 6.

**Placeholder scan:** No TBD/TODO. The repair pass in `finalizeBidding` is a real, complete algorithm (guarantees a permutation, never reverts), not a stub.

**Type consistency:** `earliestSlot(uint256,uint256)` consistent between `Underwriter.sol`, its tests, and `TandaCircle.finalizeBidding`. `TandaCircle` constructor arity (…, roundDuration, bidDuration) consistent across the contract, factory, ALL test setups (TandaCircle.t.sol ×2, Auction.t.sol, CircleFactory.t.sol via factory, Integration.t.sol via factory). `createCircle(uint256,uint8,uint256,uint256)` consistent across factory + every caller. `State` enum now `{Forming, Bidding, Active, Completed, Defaulted}` — the added `Bidding` shifts `Active`/`Completed`/`Defaulted` ordinal values, but all tests compare against the named `TandaCircle.State.X` (not raw ints), so the shift is safe; the Phase-3 tests that assert `uint8(state) == uint8(State.Active)` still resolve correctly. `payoutOrder`/`payoutOrderAt`/`memberScore`/`bidFee`/`bidDeadline` consistent across contract + Auction tests. `_settle` recipient via `members[payoutOrder[currentRound]]` — identity order for `start()` keeps Phase-3 recipient selection identical.
