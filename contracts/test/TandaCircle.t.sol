// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract TandaCircleTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    TandaCircle internal circle;

    address internal organizer = address(this);
    address internal alice = address(0xA1);
    address internal bob = address(0xB2);
    address internal carol = address(0xC3);

    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB @ 6 decimals
    uint8 internal constant MAX = 3;

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        circle = new TandaCircle(organizer, address(mxnb), address(sbt), AMOUNT, MAX);
        sbt.setCircleAuthorized(address(circle), true); // factory does this in prod

        address[3] memory who = [alice, bob, carol];
        for (uint256 i = 0; i < who.length; i++) {
            mxnb.mint(who[i], AMOUNT * MAX);
            vm.prank(who[i]);
            mxnb.approve(address(circle), type(uint256).max);
        }
    }

    function _everyoneJoins() internal {
        vm.prank(alice);
        circle.join();
        vm.prank(bob);
        circle.join();
        vm.prank(carol);
        circle.join();
    }

    function _joinRest() internal {
        vm.prank(bob);
        circle.join();
        vm.prank(carol);
        circle.join();
    }

    function test_initialState() public view {
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Forming));
        assertEq(circle.contributionAmount(), AMOUNT);
        assertEq(circle.maxMembers(), MAX);
    }

    function test_join_addsMembers() public {
        vm.prank(alice);
        circle.join();
        assertTrue(circle.isMember(alice));
        assertEq(circle.memberCount(), 1);
    }

    function test_join_rejectsDuplicate() public {
        vm.startPrank(alice);
        circle.join();
        vm.expectRevert(TandaCircle.AlreadyMember.selector);
        circle.join();
        vm.stopPrank();
    }

    function test_join_rejectsWhenFull() public {
        _everyoneJoins();
        vm.prank(address(0xD4));
        vm.expectRevert(TandaCircle.CircleFull.selector);
        circle.join();
    }

    function test_start_onlyOrganizerAndWhenFull() public {
        vm.prank(alice);
        circle.join();
        vm.expectRevert(TandaCircle.NotFull.selector);
        circle.start();

        _joinRest();
        vm.prank(alice);
        vm.expectRevert(TandaCircle.NotOrganizer.selector);
        circle.start();

        circle.start(); // organizer == this
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    function _allContribute() internal {
        vm.prank(alice);
        circle.contribute();
        vm.prank(bob);
        circle.contribute();
        vm.prank(carol);
        circle.contribute();
    }

    function test_fullHappyPath_rotatingPayout() public {
        _everyoneJoins();
        circle.start();

        // Round 0: recipient = alice (join index 0)
        uint256 aliceBefore = mxnb.balanceOf(alice);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(alice), aliceBefore + 2 * AMOUNT);
        assertEq(circle.currentRound(), 1);

        // Round 1: recipient = bob
        uint256 bobBefore = mxnb.balanceOf(bob);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);

        // Round 2: recipient = carol, final round completes the circle
        uint256 carolBefore = mxnb.balanceOf(carol);
        _allContribute();
        circle.payout();
        assertEq(mxnb.balanceOf(carol), carolBefore + 2 * AMOUNT);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Completed));

        (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(alice);
        assertEq(rounds, 3);
        assertEq(onTime, 3);
        assertEq(completed, 1);
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
