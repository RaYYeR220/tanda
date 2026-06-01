// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {SignDecision} from "./util/SignDecision.sol";

/// @notice Proves the EIP-712 domain/struct used by the TS agent matches the contract:
///         a signature over the canonical domain is accepted by verifyAndQuote.
contract CrossLayerTest is Test {
    ReputationSBT internal sbt;
    Underwriter internal uw;
    // anvil account #1 private key (matches agent/test/sign.test.ts)
    uint256 internal constant AI_KEY = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    address internal aiSigner;

    address internal circle = address(0x2222222222222222222222222222222222222222);
    address internal member = address(0x3333333333333333333333333333333333333333);
    uint256 internal constant AMOUNT = 100_000_000;

    function setUp() public {
        aiSigner = vm.addr(AI_KEY);
        sbt = new ReputationSBT(address(this));
        uw = new Underwriter(address(sbt), aiSigner);
    }

    function test_canonicalSignatureAccepted() public view {
        uint256 deadline = 9999999999;
        bytes32 rationaleHash = keccak256("reason");
        bytes memory sig = SignDecision.sign(
            vm, AI_KEY, address(uw), circle, member, 62, rationaleHash, deadline
        );
        uint256 collateral = uw.verifyAndQuote(circle, member, 62, rationaleHash, deadline, AMOUNT, sig);
        assertEq(collateral, AMOUNT);
    }
}
