// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract TandaCircleTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    TandaCircle internal circle;

    address internal organizer = address(this);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;

    address internal alice = address(0xA1A1);
    address internal bob = address(0xB2B2);
    address internal carol = address(0xC3C3);

    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB
    uint8 internal constant MAX = 3;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        circle = new TandaCircle(organizer, address(mxnb), address(sbt), address(uw), AMOUNT, MAX);
        sbt.setCircleAuthorized(address(circle), true);

        address[3] memory who = [alice, bob, carol];
        for (uint256 i = 0; i < who.length; i++) {
            mxnb.mint(who[i], AMOUNT * 10);
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
        assertEq(circle.contributionAmount(), AMOUNT);
        assertEq(circle.maxMembers(), MAX);
        assertEq(address(circle.underwriter()), address(uw));
    }

    function test_join_escrowsCollateral() public {
        uint256 before = mxnb.balanceOf(alice);
        _join(alice);
        assertTrue(circle.isMember(alice));
        assertEq(circle.collateral(alice), 2 * AMOUNT);
        assertEq(mxnb.balanceOf(alice), before - 2 * AMOUNT);
        assertEq(mxnb.balanceOf(address(circle)), 2 * AMOUNT);
    }

    function test_join_rejectsDuplicate() public {
        _join(alice);
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), alice, 50, keccak256("ok"), deadline
        );
        vm.prank(alice);
        vm.expectRevert(TandaCircle.AlreadyMember.selector);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function test_join_rejectsWhenFull() public {
        _everyoneJoins();
        uint256 deadline = block.timestamp + 1 hours;
        address dave = address(0xD4D4);
        mxnb.mint(dave, AMOUNT * 10);
        vm.prank(dave);
        mxnb.approve(address(circle), type(uint256).max);
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), dave, 50, keccak256("ok"), deadline
        );
        vm.prank(dave);
        vm.expectRevert(TandaCircle.CircleFull.selector);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function test_join_rejectsBadSignature() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, 0xBEEF, address(uw), address(circle), alice, 50, keccak256("ok"), deadline
        );
        vm.prank(alice);
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function test_start_onlyOrganizerAndWhenFull() public {
        _join(alice);
        vm.expectRevert(TandaCircle.NotFull.selector);
        circle.start();

        _join(bob);
        _join(carol);
        vm.prank(alice);
        vm.expectRevert(TandaCircle.NotOrganizer.selector);
        circle.start();

        circle.start();
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    function test_fullHappyPath_rotatingPayout_andCollateralWithdraw() public {
        _everyoneJoins();
        circle.start();

        uint256 aliceBefore = mxnb.balanceOf(alice);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(alice), aliceBefore + 2 * AMOUNT);
        assertEq(circle.currentRound(), 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);

        uint256 carolBefore = mxnb.balanceOf(carol);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(carol), carolBefore + 2 * AMOUNT);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        uint256 aBefore = mxnb.balanceOf(alice);
        vm.prank(alice);
        circle.withdrawCollateral();
        assertEq(mxnb.balanceOf(alice), aBefore + 2 * AMOUNT);
        assertEq(circle.collateral(alice), 0);

        (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(alice);
        assertEq(rounds, 3);
        assertEq(onTime, 3);
        assertEq(completed, 1);
    }

    function test_withdrawCollateral_revertsBeforeCompletion() public {
        _everyoneJoins();
        circle.start();
        vm.prank(alice);
        vm.expectRevert(TandaCircle.WrongState.selector);
        circle.withdrawCollateral();
    }

    function test_withdrawCollateral_revertsTwice() public {
        _everyoneJoins();
        circle.start();
        for (uint256 r = 0; r < 3; r++) {
            _allContribute();
            circle.payout();
        }
        vm.startPrank(alice);
        circle.withdrawCollateral();
        vm.expectRevert(TandaCircle.NoCollateral.selector);
        circle.withdrawCollateral();
        vm.stopPrank();
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
