// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract IntegrationTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    CircleFactory internal factory;

    address internal organizer = address(0xABCD);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address[] internal members;
    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 3;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        factory = new CircleFactory(address(mxnb), address(sbt), address(uw));
        sbt.transferAdmin(address(factory));

        members.push(address(0x1));
        members.push(address(0x2));
        members.push(address(0x3));
    }

    function test_endToEndLifecycleWithCollateral() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 10);
            vm.startPrank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            vm.stopPrank();

            uint256 deadline = block.timestamp + 1 hours;
            bytes memory sig = SignDecision.sign(
                vm, aiKey, address(uw), circleAddr, members[i], 50, keccak256("ok"), deadline
            );
            vm.prank(members[i]);
            circle.join(50, keccak256("ok"), deadline, sig);
            assertEq(circle.collateral(members[i]), 2 * AMOUNT);
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
            uint256 before = mxnb.balanceOf(members[i]);
            vm.prank(members[i]);
            circle.withdrawCollateral();
            assertEq(mxnb.balanceOf(members[i]), before + 2 * AMOUNT);

            (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(members[i]);
            assertEq(rounds, 3);
            assertEq(onTime, 3);
            assertEq(completed, 1);
            assertEq(sbt.balanceOf(members[i]), 1);
        }
    }
}
