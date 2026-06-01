// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

contract Deploy is Script {
    function run() external {
        address aiSigner = vm.envOr("AI_SIGNER", msg.sender);

        vm.startBroadcast();
        MockMXNB mxnb = new MockMXNB();
        ReputationSBT sbt = new ReputationSBT(msg.sender);
        Underwriter underwriter = new Underwriter(address(sbt), aiSigner);
        CircleFactory factory = new CircleFactory(address(mxnb), address(sbt), address(underwriter));
        sbt.transferAdmin(address(factory));
        vm.stopBroadcast();

        console2.log("MockMXNB:      ", address(mxnb));
        console2.log("ReputationSBT: ", address(sbt));
        console2.log("Underwriter:   ", address(underwriter));
        console2.log("CircleFactory: ", address(factory));
        console2.log("AI signer:     ", aiSigner);
    }
}
