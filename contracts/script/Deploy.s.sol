// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

contract Deploy is Script {
    function run() external {
        address aiSigner = vm.envOr("AI_SIGNER", msg.sender);
        uint256 seed = vm.envOr("INSURANCE_SEED", uint256(0));

        vm.startBroadcast();
        MockMXNB mxnb = new MockMXNB();
        ReputationSBT sbt = new ReputationSBT(msg.sender);
        Underwriter underwriter = new Underwriter(address(sbt), aiSigner);
        InsurancePool pool = new InsurancePool(address(mxnb), msg.sender);
        CircleFactory factory = new CircleFactory(address(mxnb), address(sbt), address(underwriter), address(pool));
        sbt.transferAdmin(address(factory));
        pool.transferAdmin(address(factory));
        if (seed > 0) {
            mxnb.mint(address(pool), seed);
        }
        vm.stopBroadcast();

        console2.log("MockMXNB:      ", address(mxnb));
        console2.log("ReputationSBT: ", address(sbt));
        console2.log("Underwriter:   ", address(underwriter));
        console2.log("InsurancePool: ", address(pool));
        console2.log("CircleFactory: ", address(factory));
        console2.log("AI signer:     ", aiSigner);
        console2.log("Insurance seed:", seed);
    }
}
