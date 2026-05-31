// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";

contract MockMXNBTest is Test {
    MockMXNB internal mxnb;
    address internal alice = address(0xA11CE);

    function setUp() public {
        mxnb = new MockMXNB();
    }

    function test_metadata() public view {
        assertEq(mxnb.name(), "Mock MXN Bitso");
        assertEq(mxnb.symbol(), "MXNB");
        assertEq(mxnb.decimals(), 6);
    }

    function test_mint() public {
        mxnb.mint(alice, 1_000_000);
        assertEq(mxnb.balanceOf(alice), 1_000_000);
        assertEq(mxnb.totalSupply(), 1_000_000);
    }
}
