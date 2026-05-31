// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";

contract ReputationSBTTest is Test {
    ReputationSBT internal sbt;
    address internal admin = address(this);
    address internal circle = address(0xC1);
    address internal member = address(0x111);

    function setUp() public {
        sbt = new ReputationSBT(admin);
    }

    function test_adminCanAuthorizeCircle() public {
        sbt.setCircleAuthorized(circle, true);
        assertTrue(sbt.isAuthorizedCircle(circle));
    }

    function test_nonAdminCannotAuthorize() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ReputationSBT.NotAdmin.selector);
        sbt.setCircleAuthorized(circle, true);
    }

    function test_authorizedCircleRecordsOnTime() public {
        sbt.setCircleAuthorized(circle, true);
        vm.prank(circle);
        sbt.recordOnTime(member);

        (uint32 rounds, uint32 onTime, uint32 late, uint32 defaults, uint32 completed) = sbt.reputation(member);
        assertEq(rounds, 1);
        assertEq(onTime, 1);
        assertEq(late, 0);
        assertEq(defaults, 0);
        assertEq(completed, 0);
    }

    function test_unauthorizedCannotRecord() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(ReputationSBT.NotAuthorizedCircle.selector);
        sbt.recordOnTime(member);
    }

    function test_recordsAccumulate() public {
        sbt.setCircleAuthorized(circle, true);
        vm.startPrank(circle);
        sbt.recordOnTime(member);
        sbt.recordLate(member);
        sbt.recordDefault(member);
        sbt.recordCompletion(member);
        vm.stopPrank();

        (uint32 rounds, uint32 onTime, uint32 late, uint32 defaults, uint32 completed) = sbt.reputation(member);
        assertEq(rounds, 3);
        assertEq(onTime, 1);
        assertEq(late, 1);
        assertEq(defaults, 1);
        assertEq(completed, 1);
    }
}
