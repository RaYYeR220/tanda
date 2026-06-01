// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "./util/SignDecision.sol";

contract IntegrationTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    Underwriter internal uw;
    InsurancePool internal pool;
    CircleFactory internal factory;

    address internal organizer = address(0xABCD);
    uint256 internal aiKey = 0xA1;
    address internal aiSigner;
    address[] internal members;
    uint256 internal constant AMOUNT = 100_000_000;
    uint256 internal constant COLLATERAL_FRESH = 200_000_000;
    uint8 internal constant MAX = 3;
    uint256 internal constant ROUND = 1 days;
    uint256 internal constant BIDDUR = 1 hours;

    function setUp() public {
        aiSigner = vm.addr(aiKey);
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
        pool = new InsurancePool(address(mxnb), address(this));
        factory = new CircleFactory(address(mxnb), address(sbt), address(uw), address(pool));
        sbt.transferAdmin(address(factory));
        pool.transferAdmin(address(factory));
        mxnb.mint(address(pool), 1_000_000_000); // protocol-seeded buffer

        members.push(address(0x1));
        members.push(address(0x2));
        members.push(address(0x3));
    }

    function _join(TandaCircle circle, address who) internal {
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(
            vm, aiKey, address(uw), address(circle), who, 50, keccak256("ok"), deadline
        );
        vm.prank(who);
        circle.join(50, keccak256("ok"), deadline, sig);
    }

    function test_endToEndHappyLifecycle() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            _join(circle, members[i]);
            assertEq(circle.collateral(members[i]), COLLATERAL_FRESH);
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
            assertEq(mxnb.balanceOf(members[i]), before + COLLATERAL_FRESH);

            (uint32 rounds, uint32 onTime,,, uint32 completed) = sbt.reputation(members[i]);
            assertEq(rounds, 3);
            assertEq(onTime, 3);
            assertEq(completed, 1);
            assertEq(sbt.balanceOf(members[i]), 1);
        }
    }

    function test_defaultScenario_recipientMadeWhole_circleContinues() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);
        TandaCircle circle = TandaCircle(circleAddr);

        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);
            _join(circle, members[i]);
        }
        vm.prank(organizer);
        circle.start();

        // Round 0 happy: members[0] paid
        for (uint256 i = 0; i < members.length; i++) {
            vm.prank(members[i]);
            circle.contribute();
        }
        circle.payout();

        // Round 1: members[0] defaults (the classic early-recipient scam); others contribute.
        // Capture the recipient balance BEFORE their own contribution (mirrors the happy-path assertion).
        address recipient1 = members[1];
        uint256 before = mxnb.balanceOf(recipient1);
        vm.prank(members[1]);
        circle.contribute();
        vm.prank(members[2]);
        circle.contribute();
        vm.warp(circle.roundDeadline() + 1);

        circle.resolveRound();

        // recipient is STILL made whole despite the default: net gain = pot minus own contribution
        assertEq(mxnb.balanceOf(recipient1), before + AMOUNT * (members.length - 1));
        assertTrue(circle.hasDefaulted(members[0]));
        (,,, uint32 defaults,) = sbt.reputation(members[0]);
        assertEq(defaults, 1);
        // circle keeps going
        assertEq(circle.currentRound(), 2);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }

    /// @notice The auction money-shot: a risky member out-bids everyone for slot 0, but the AI
    ///         risk band keeps them out of the early slots. n=3, risky score 25 -> floor n/2 = 1.
    /// @dev Uses a local stack so this contract can seed the risky member's on-chain reputation
    ///      (a prior default) BEFORE handing SBT admin to the factory.
    function test_auctionScenario_riskyOutbidButBandWins() public {
        ReputationSBT lsbt = new ReputationSBT(address(this));
        Underwriter luw = new Underwriter(address(lsbt), aiSigner);
        InsurancePool lpool = new InsurancePool(address(mxnb), address(this));
        CircleFactory lfactory = new CircleFactory(address(mxnb), address(lsbt), address(luw), address(lpool));

        // seed members[0] with a default (base score 50 - 25 = 25, <30 band) while still admin
        lsbt.setCircleAuthorized(address(this), true);
        lsbt.recordDefault(members[0]);

        lsbt.transferAdmin(address(lfactory));
        lpool.transferAdmin(address(lfactory));
        mxnb.mint(address(lpool), 1_000_000_000);

        vm.prank(organizer);
        address circleAddr = lfactory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);
        TandaCircle circle = TandaCircle(circleAddr);

        uint256[3] memory scores = [uint256(25), 50, 50]; // members[0] risky
        for (uint256 i = 0; i < members.length; i++) {
            mxnb.mint(members[i], AMOUNT * 20);
            vm.prank(members[i]);
            mxnb.approve(circleAddr, type(uint256).max);

            uint256 deadline = block.timestamp + 1 hours;
            bytes memory sig = SignDecision.sign(
                vm, aiKey, address(luw), circleAddr, members[i], scores[i], keccak256("ok"), deadline
            );
            vm.prank(members[i]);
            circle.join(scores[i], keccak256("ok"), deadline, sig);
        }

        vm.prank(organizer);
        circle.openBidding();

        // risky bids the most...
        vm.prank(members[0]);
        circle.bid(50_000_000);
        vm.prank(members[1]);
        circle.bid(5_000_000);

        vm.warp(circle.bidDeadline() + 1);
        vm.prank(organizer);
        circle.finalizeBidding();

        // ...but the AI band (floor n/2 = 1 for n=3) bars them from slot 0
        assertTrue(circle.payoutOrderAt(0) != 0);
        assertEq(uint8(circle.state()), uint8(TandaCircle.State.Active));
    }
}
