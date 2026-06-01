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

    uint256 internal constant AMOUNT = 100_000_000;
    uint256 internal constant PREMIUM_FRESH = 4_000_000;
    uint256 internal constant COLLATERAL_FRESH = 200_000_000;
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
        assertEq(mxnb.balanceOf(alice), before - COLLATERAL_FRESH - PREMIUM_FRESH);
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
        assertEq(mxnb.balanceOf(alice), aliceBefore + 2 * AMOUNT);

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

        _allContribute();
        circle.payout();
        assertEq(circle.currentRound(), 1);

        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();

        vm.expectRevert(TandaCircle.RoundNotExpired.selector);
        circle.resolveRound();

        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        assertEq(mxnb.balanceOf(bob), bobBefore + 3 * AMOUNT);
        assertEq(circle.collateral(alice), COLLATERAL_FRESH - AMOUNT);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore);
        assertTrue(circle.hasDefaulted(alice));
        (,,, uint32 defaults,) = sbt.reputation(alice);
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

        _allContribute();
        circle.payout();

        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);
        circle.resolveRound();

        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);
        circle.resolveRound();

        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        assertEq(circle.collateral(alice), 0);
        (,,, uint32 defaults, uint32 completed) = sbt.reputation(alice);
        assertEq(defaults, 2);
        assertEq(completed, 0);

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

contract TandaCircleInsuranceTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    TandaCircle internal circle;

    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address internal bob = address(0xB0B);
    address internal risky = address(0x515C);

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
        _joinScore(bob, 50);
        _joinScore(risky, 80);
        assertEq(circle.collateral(risky), 50_000_000);

        mxnb.mint(address(pool), 1_000_000_000);

        circle.start();

        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);
        assertEq(circle.collateral(risky), 0);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore - 50_000_000);
        assertEq(pool.totalClaims(), 50_000_000);
        assertTrue(circle.hasDefaulted(risky));
    }

    function test_resolveRound_underfunded_haircutsRecipientAndFlags() public {
        _joinScore(bob, 50);
        _joinScore(risky, 80);
        uint256 poolBal = mxnb.balanceOf(address(pool));
        assertEq(poolBal, 5_000_000);

        circle.start();
        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        vm.expectEmit(true, false, false, true, address(circle));
        emit TandaCircle.RoundUnderfunded(0, 45_000_000);
        circle.resolveRound();

        assertEq(mxnb.balanceOf(bob), bobBefore + 155_000_000);
        assertEq(mxnb.balanceOf(address(pool)), 0);
        assertTrue(circle.hasDefaulted(risky));
    }
}
