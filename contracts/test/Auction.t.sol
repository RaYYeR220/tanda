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

    address internal hi = address(0x4111);
    address internal mid = address(0x4222);
    address internal risky = address(0x4333);
    address internal d4 = address(0x4444);

    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 4;
    uint256 internal constant ROUND = 1 days;
    uint256 internal constant BIDDUR = 1 hours;

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
        sbt.setCircleAuthorized(address(this), true);

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

    // Finalize after the bid window closes (the path used when not everyone bid).
    function _finalize() internal {
        vm.warp(circle.bidDeadline() + 1);
        circle.finalizeBidding();
    }

    function _joinAll() internal {
        _join(hi, 50);
        _join(mid, 50);
        _join(risky, 25);
        _join(d4, 50);
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

        _bid(risky, 50_000_000);
        _bid(mid, 10_000_000);
        _bid(hi, 1_000_000);
        // d4 did not bid -> finalize only after the window closes
        _finalize();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));

        assertEq(circle.payoutOrderAt(0), _indexOf(mid));
        uint256 riskySlot = _slotOf(risky);
        assertGe(riskySlot, 2);
    }

    function test_finalizeBidding_producesFullPermutation() public {
        _joinAll();
        circle.openBidding();
        _bid(risky, 50_000_000);
        _bid(mid, 10_000_000);
        _finalize();

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
        _finalize();

        address slot0 = circle.members(circle.payoutOrderAt(0));
        uint256 before = mxnb.balanceOf(slot0);

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
        vm.prank(mid);
        vm.expectRevert(TandaCircle.WrongState.selector);
        circle.bid(1_000_000);
    }

    function test_finalize_revertsBeforeDeadlineWhenNotAllBid() public {
        _joinAll();
        circle.openBidding();
        _bid(mid, 10_000_000); // only one bidder, window still open
        vm.expectRevert(TandaCircle.BidNotClosed.selector);
        circle.finalizeBidding();
    }

    function test_finalize_allowedImmediatelyWhenEveryoneBid() public {
        _joinAll();
        circle.openBidding();
        _bid(hi, 1_000_000);
        _bid(mid, 2_000_000);
        _bid(risky, 3_000_000);
        _bid(d4, 4_000_000);
        // everyone bid -> can finalize without waiting for the deadline
        circle.finalizeBidding();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    function test_startStillWorksAsNoAuctionShortcut() public {
        _joinAll();
        circle.start();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
        for (uint256 s = 0; s < 4; s++) {
            assertEq(circle.payoutOrderAt(s), s);
        }
    }
}
