// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {CircleFactory} from "../src/CircleFactory.sol";

/// @notice Create one empty circle (stays in Forming state) on the already-deployed Sepolia
///         factory, so the gasless passkey onboarding has somewhere to join.
///
/// Run (PowerShell):
///   $env:PRIVATE_KEY="0x<funded deployer key>"
///   $env:FACTORY="0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8"
///   forge script script/CreateFormingCircleSepolia.s.sol:CreateFormingCircleSepolia `
///     --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast
contract CreateFormingCircleSepolia is Script {
    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB (6dp)
    uint8 internal constant MAX = 4;
    uint256 internal constant ROUND = 600;
    uint256 internal constant BIDDUR = 300;

    function run() external {
        uint256 deployerKey = vm.envUint("PRIVATE_KEY");
        CircleFactory factory = CircleFactory(vm.envAddress("FACTORY"));

        vm.broadcast(deployerKey);
        address circle = factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);

        console2.log("=== Forming circle created ===");
        console2.log("NEXT_PUBLIC_GASLESS_CIRCLE=", circle);
    }
}
