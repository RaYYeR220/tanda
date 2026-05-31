// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract IntegrationTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    CircleFactory internal factory;

    address internal organizer = address(0xABCD);
    address[] internal members;
    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 3;

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        factory = new CircleFactory(address(mxnb), address(sbt));
        sbt.transferAdmin(address(factory));

        members.push(address(0x1));
        members.push(address(0x2));
        members.push(address(0x3));
    }

    function test_endToEndLifecycle() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * MAX);
            vm.startPrank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            circle.join();
            vm.stopPrank();
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
            (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(members[i]);
            assertEq(rounds, 3);
            assertEq(onTime, 3);
            assertEq(completed, 1);
            assertEq(sbt.balanceOf(members[i]), 1);
        }
    }
}
