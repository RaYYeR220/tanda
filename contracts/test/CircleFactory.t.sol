// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";

contract CircleFactoryTest is Test {
    MockMXNB internal mxnb;
    ReputationSBT internal sbt;
    CircleFactory internal factory;
    address internal organizer = address(0x0123);

    function setUp() public {
        mxnb = new MockMXNB();
        sbt = new ReputationSBT(address(this));        // deployer is admin
        factory = new CircleFactory(address(mxnb), address(sbt));
        sbt.transferAdmin(address(factory));           // hand admin to factory
    }

    function test_createCircle_deploysAuthorizesTracks() public {
        vm.prank(organizer);
        address circleAddr = factory.createCircle(100_000_000, 3);

        assertTrue(factory.isCircle(circleAddr));
        assertEq(factory.allCirclesLength(), 1);
        assertTrue(sbt.isAuthorizedCircle(circleAddr));

        TandaCircle c = TandaCircle(circleAddr);
        assertEq(c.organizer(), organizer);
        assertEq(c.contributionAmount(), 100_000_000);
        assertEq(c.maxMembers(), 3);
        assertEq(address(c.token()), address(mxnb));
    }

    function test_createCircle_emitsEvent() public {
        vm.recordLogs();
        vm.prank(organizer);
        factory.createCircle(50_000_000, 5);
        assertEq(factory.allCirclesLength(), 1);
    }
}
