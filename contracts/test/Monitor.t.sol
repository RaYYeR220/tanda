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
    address internal bob = address(0xB0B);
    address internal risky = address(0x515C);

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
        _join(risky, 80);
        circle.start();

        uint256 before = mxnb.balanceOf(risky);
        vm.prank(risky);
        circle.topUpCollateral(50_000_000);
        assertEq(circle.collateral(risky), 100_000_000);
        assertEq(mxnb.balanceOf(risky), before - 50_000_000);
        // bob collateral 200 (2x) + risky 50 (0.5x) + topup 50 = 300
        assertEq(mxnb.balanceOf(address(circle)), 300_000_000);
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

    function test_earlyWarning_topUp_avoidsInsuranceDraw() public {
        _join(bob, 50);
        _join(risky, 80);
        mxnb.mint(address(pool), 1_000_000_000);
        circle.start();

        _flag(risky);
        assertTrue(circle.atRisk(0, risky));

        vm.prank(risky);
        circle.topUpCollateral(50_000_000);
        assertEq(circle.collateral(risky), 100_000_000);

        vm.prank(bob);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        uint256 bobBefore = mxnb.balanceOf(bob);
        uint256 poolBefore = mxnb.balanceOf(address(pool));
        circle.resolveRound();

        assertEq(mxnb.balanceOf(bob), bobBefore + 2 * AMOUNT);
        assertEq(circle.collateral(risky), 0);
        assertEq(mxnb.balanceOf(address(pool)), poolBefore); // INSURANCE UNTOUCHED
        assertEq(pool.totalClaims(), 0);
    }
}
