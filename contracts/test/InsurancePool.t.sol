// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {InsurancePool} from "../src/InsurancePool.sol";

contract InsurancePoolTest is Test {
    MockMXNB internal mxnb;
    InsurancePool internal pool;
    address internal circle = address(0xC1);

    function setUp() public {
        mxnb = new MockMXNB();
        pool = new InsurancePool(address(mxnb), address(this));
    }

    function test_adminAuthorizesCircle() public {
        pool.setCircleAuthorized(circle, true);
        assertTrue(pool.isAuthorizedCircle(circle));
    }

    function test_nonAdminCannotAuthorize() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAdmin.selector);
        pool.setCircleAuthorized(circle, true);
    }

    function test_transferAdmin() public {
        pool.transferAdmin(address(0xF00D));
        assertEq(pool.admin(), address(0xF00D));
    }

    function test_notifyPremiumAccrues() public {
        pool.setCircleAuthorized(circle, true);
        vm.prank(circle);
        pool.notifyPremium(5_000_000);
        assertEq(pool.totalPremiums(), 5_000_000);
    }

    function test_notifyPremium_onlyAuthorized() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAuthorizedCircle.selector);
        pool.notifyPremium(1);
    }

    function test_coverPaysAuthorizedCircleUpToBalance() public {
        mxnb.mint(address(pool), 1_000_000_000);
        pool.setCircleAuthorized(circle, true);

        vm.prank(circle);
        uint256 covered = pool.cover(300_000_000);
        assertEq(covered, 300_000_000);
        assertEq(mxnb.balanceOf(circle), 300_000_000);
        assertEq(pool.totalClaims(), 300_000_000);
    }

    function test_coverCapsAtBalanceWhenUnderfunded() public {
        mxnb.mint(address(pool), 40_000_000);
        pool.setCircleAuthorized(circle, true);

        vm.prank(circle);
        uint256 covered = pool.cover(100_000_000);
        assertEq(covered, 40_000_000);
        assertEq(mxnb.balanceOf(circle), 40_000_000);
    }

    function test_cover_onlyAuthorized() public {
        vm.prank(address(0xBAD));
        vm.expectRevert(InsurancePool.NotAuthorizedCircle.selector);
        pool.cover(1);
    }
}
