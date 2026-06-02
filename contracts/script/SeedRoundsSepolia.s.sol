// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "../test/util/SignDecision.sol";

/// @notice Phase-2 of the Sepolia seed: runs members join + round 0 + round 1 against an
///         ALREADY-DEPLOYED circle. Use this after SeedDemoSepolia has deployed the contracts
///         (it deploys, seeds reputation, mints MXNB, creates the circle) but the member EOAs
///         must be funded with gas FIRST via `cast send` (forge's in-script value transfer is
///         unreliable, so funding is done out-of-band — see web/README.md).
///
/// Reads the deployed addresses from env:
///   CIRCLE  — the TandaCircle address (NEXT_PUBLIC_DEMO_CIRCLE)
///   MXNB    — the MockMXNB address     (NEXT_PUBLIC_MXNB)
///   UW      — the Underwriter address  (NEXT_PUBLIC_UNDERWRITER)
/// Deployer (circle creator, must equal the SeedDemoSepolia deployer) comes from PRIVATE_KEY.
///
/// Run (PowerShell), AFTER funding the 4 members:
///   $env:PRIVATE_KEY="0x<funded deployer key>"
///   $env:CIRCLE="0x..."; $env:MXNB="0x..."; $env:UW="0x..."
///   forge script script/SeedRoundsSepolia.s.sol:SeedRoundsSepolia `
///     --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast --slow
contract SeedRoundsSepolia is Script {
    uint256 internal constant AI_SIGNER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    uint256 internal constant SCORE_MARIA = 82;
    uint256 internal constant SCORE_DIEGO = 66;
    uint256 internal constant SCORE_LUPE = 50;
    uint256 internal constant SCORE_KITO = 28;

    address internal _circle;
    MockMXNB internal _mxnb;
    address internal _uw;

    uint256 internal _deployerKey;
    uint256 internal _mariaKey;
    uint256 internal _diegoKey;
    uint256 internal _lupeKey;
    uint256 internal _kitoKey;
    address internal _mariaAddr;
    address internal _diegoAddr;
    address internal _lupeAddr;
    address internal _kitoAddr;

    function run() external {
        _circle = vm.envAddress("CIRCLE");
        _mxnb = MockMXNB(vm.envAddress("MXNB"));
        _uw = vm.envAddress("UW");

        _deployerKey = vm.envUint("PRIVATE_KEY");

        // Must match SeedDemoSepolia exactly (reputation + circle membership are keyed by these).
        _mariaKey = uint256(keccak256("tanda.sepolia.member.maria.v1"));
        _diegoKey = uint256(keccak256("tanda.sepolia.member.diego.v1"));
        _lupeKey = uint256(keccak256("tanda.sepolia.member.lupe.v1"));
        _kitoKey = uint256(keccak256("tanda.sepolia.member.kito.v1"));
        _mariaAddr = vm.addr(_mariaKey);
        _diegoAddr = vm.addr(_diegoKey);
        _lupeAddr = vm.addr(_lupeKey);
        _kitoAddr = vm.addr(_kitoKey);

        _membersJoin();
        _start();
        _round0();
        _round1();

        console2.log("Seed rounds complete for circle:", _circle);
    }

    function _membersJoin() internal {
        bytes32 rationaleHash = keccak256("seed");
        uint256 deadline = block.timestamp + 1 hours;
        _joinOne(_mariaKey, _mariaAddr, SCORE_MARIA, rationaleHash, deadline);
        _joinOne(_diegoKey, _diegoAddr, SCORE_DIEGO, rationaleHash, deadline);
        _joinOne(_lupeKey, _lupeAddr, SCORE_LUPE, rationaleHash, deadline);
        _joinOne(_kitoKey, _kitoAddr, SCORE_KITO, rationaleHash, deadline);
    }

    function _joinOne(uint256 memberKey, address memberAddr, uint256 score, bytes32 rationaleHash, uint256 deadline)
        internal
    {
        bytes memory sig =
            SignDecision.sign(vm, AI_SIGNER_KEY, _uw, _circle, memberAddr, score, rationaleHash, deadline);
        vm.startBroadcast(memberKey);
        _mxnb.approve(_circle, type(uint256).max);
        TandaCircle(_circle).join(score, rationaleHash, deadline, sig);
        vm.stopBroadcast();
    }

    function _start() internal {
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).start();
    }

    function _round0() internal {
        vm.broadcast(_mariaKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_diegoKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_lupeKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_kitoKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).payout();
    }

    function _round1() internal {
        vm.broadcast(_mariaKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_diegoKey);
        TandaCircle(_circle).contribute();
        vm.broadcast(_lupeKey);
        TandaCircle(_circle).contribute();
        // kito skips — leaves round 1 in-flight (default money-shot)

        bytes32 riskHash = keccak256("risk");
        uint256 flagDeadline = block.timestamp + 1 hours;
        bytes memory flagSig =
            SignDecision.signRiskFlag(vm, AI_SIGNER_KEY, _uw, _circle, _kitoAddr, 1, riskHash, flagDeadline);
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).flagAtRisk(_kitoAddr, riskHash, flagDeadline, flagSig);
    }
}
