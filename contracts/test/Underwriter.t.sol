// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";

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
