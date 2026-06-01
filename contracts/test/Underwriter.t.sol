// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract UnderwriterScoreTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;
    address internal aiSigner = address(0xA1516);
    address internal circle = address(0xC1);
    address internal fresh = address(0xF1);
    address internal good = address(0x6000);
    address internal bad = address(0xBAD);

    function setUp() public {
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        sbt.setCircleAuthorized(address(this), true);
    }

    function test_freshWalletScoresFifty() public view {
        assertEq(uw.baseScore(fresh), 50);
    }

    function test_goodHistoryRaisesScore() public {
        for (uint256 i = 0; i < 6; i++) sbt.recordOnTime(good);
        sbt.recordCompletion(good);
        assertEq(uw.baseScore(good), 82);
    }

    function test_defaultsCrashScore() public {
        sbt.recordDefault(bad);
        sbt.recordDefault(bad);
        assertEq(uw.baseScore(bad), 0);
    }

    function test_scoreClampsAt100() public {
        for (uint256 i = 0; i < 20; i++) sbt.recordOnTime(good);
        assertEq(uw.baseScore(good), 100);
    }

    function test_collateralLadder() public view {
        uint256 amount = 100_000_000;
        assertEq(uw.quote(85, amount), 50_000_000);
        assertEq(uw.quote(70, amount), 100_000_000);
        assertEq(uw.quote(50, amount), 200_000_000);
        assertEq(uw.quote(30, amount), 300_000_000);
    }

    function test_ladderBoundaries() public view {
        uint256 amount = 100_000_000;
        assertEq(uw.quote(80, amount), 50_000_000);
        assertEq(uw.quote(79, amount), 100_000_000);
        assertEq(uw.quote(60, amount), 100_000_000);
        assertEq(uw.quote(59, amount), 200_000_000);
        assertEq(uw.quote(40, amount), 200_000_000);
        assertEq(uw.quote(39, amount), 300_000_000);
    }
}

contract UnderwriterVerifyTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address internal circle = address(0xC1);
    address internal member = address(0x111);

    uint256 internal constant AMOUNT = 100_000_000;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
    }

    function _sign(uint256 key, uint256 adjustedScore, uint256 deadline) internal view returns (bytes memory) {
        return SignDecision.sign(
            vm, key, address(uw), circle, member, adjustedScore, keccak256("reason"), deadline
        );
    }

    function test_validSignatureInBandReturnsCollateral() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 62, deadline);
        uint256 collateral = uw.verifyAndQuote(circle, member, 62, keccak256("reason"), deadline, AMOUNT, sig);
        assertEq(collateral, AMOUNT);
    }

    function test_rejectsScoreAboveBand() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 66, deadline);
        vm.expectRevert(Underwriter.ScoreOutOfBand.selector);
        uw.verifyAndQuote(circle, member, 66, keccak256("reason"), deadline, AMOUNT, sig);
    }

    function test_rejectsScoreBelowBand() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 34, deadline);
        vm.expectRevert(Underwriter.ScoreOutOfBand.selector);
        uw.verifyAndQuote(circle, member, 34, keccak256("reason"), deadline, AMOUNT, sig);
    }

    function test_rejectsWrongSigner() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(0xBEEF, 55, deadline);
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        uw.verifyAndQuote(circle, member, 55, keccak256("reason"), deadline, AMOUNT, sig);
    }

    function test_rejectsExpired() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 55, deadline);
        vm.warp(deadline + 1);
        vm.expectRevert(Underwriter.SignatureExpired.selector);
        uw.verifyAndQuote(circle, member, 55, keccak256("reason"), deadline, AMOUNT, sig);
    }

    function test_rejectsTamperedScore() public {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = _sign(aiKey, 55, deadline);
        vm.expectRevert(Underwriter.InvalidSigner.selector);
        uw.verifyAndQuote(circle, member, 60, keccak256("reason"), deadline, AMOUNT, sig);
    }
}

contract UnderwriterPremiumTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;

    function setUp() public {
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), address(0xA15));
    }

    function test_premiumLadder() public view {
        uint256 amount = 100_000_000;
        assertEq(uw.premium(85, amount), 1_000_000);
        assertEq(uw.premium(70, amount), 2_000_000);
        assertEq(uw.premium(50, amount), 4_000_000);
        assertEq(uw.premium(30, amount), 6_000_000);
    }

    function test_premiumBoundaries() public view {
        uint256 amount = 100_000_000;
        assertEq(uw.premium(80, amount), 1_000_000);
        assertEq(uw.premium(79, amount), 2_000_000);
        assertEq(uw.premium(60, amount), 2_000_000);
        assertEq(uw.premium(59, amount), 4_000_000);
        assertEq(uw.premium(40, amount), 4_000_000);
        assertEq(uw.premium(39, amount), 6_000_000);
    }
}
