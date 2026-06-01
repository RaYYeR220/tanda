// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {ReputationSBT} from "../src/ReputationSBT.sol";
import {Underwriter} from "../src/Underwriter.sol";
import {InsurancePool} from "../src/InsurancePool.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {SignDecision} from "../test/util/SignDecision.sol";

/// @notice Deploy + seed a full demo Tanda circle on a local anvil node.
///         Run: forge script script/SeedDemo.s.sol:SeedDemo --rpc-url http://127.0.0.1:8545 --broadcast
contract SeedDemo is Script {
    string internal constant MNEMONIC = "test test test test test test test test test test test junk";

    // 100 MXNB (6 decimals)
    uint256 internal constant AMOUNT  = 100_000_000;
    uint8   internal constant MAX     = 4;
    uint256 internal constant ROUND   = 7 days;
    uint256 internal constant BIDDUR  = 1 days;

    // Adjusted scores — within ±15 of the seeded on-chain base.
    // María  base 82 → band [67,97]  → 82
    // Diego  base 66 → band [51,81]  → 66
    // Lupe   base 50 → band [35,65]  → 50
    // 0xkito base 25 → band [10,40]  → 28
    uint256 internal constant SCORE_MARIA = 82;
    uint256 internal constant SCORE_DIEGO = 66;
    uint256 internal constant SCORE_LUPE  = 50;
    uint256 internal constant SCORE_KITO  = 28;

    // ── Shared state set in run() and used in helpers ────────────────────────
    MockMXNB      internal _mxnb;
    ReputationSBT internal _sbt;
    Underwriter   internal _uw;
    InsurancePool internal _pool;
    CircleFactory internal _factory;
    address       internal _circle;

    uint256 internal _deployerKey;
    uint256 internal _mariaKey;
    uint256 internal _diegoKey;
    uint256 internal _lupeKey;
    uint256 internal _kitoKey;

    address internal _deployerAddr;
    address internal _mariaAddr;
    address internal _diegoAddr;
    address internal _lupeAddr;
    address internal _kitoAddr;

    function run() external {
        // ── Keys & addresses ──────────────────────────────────────────────────
        _deployerKey  = vm.deriveKey(MNEMONIC, 0);
        _mariaKey     = vm.deriveKey(MNEMONIC, 1);
        _diegoKey     = vm.deriveKey(MNEMONIC, 2);
        _lupeKey      = vm.deriveKey(MNEMONIC, 3);
        _kitoKey      = vm.deriveKey(MNEMONIC, 4);

        _deployerAddr = vm.addr(_deployerKey);
        _mariaAddr    = vm.addr(_mariaKey);
        _diegoAddr    = vm.addr(_diegoKey);
        _lupeAddr     = vm.addr(_lupeKey);
        _kitoAddr     = vm.addr(_kitoKey);

        _deploy();
        _seedReputation();
        _handAdminToFactory();
        _mintTokens();
        _createCircle();
        _membersJoin();
        _start();
        _round0();
        _round1();
        _logAddresses();
    }

    // ── 1. Deploy ─────────────────────────────────────────────────────────────
    function _deploy() internal {
        vm.startBroadcast(_deployerKey);
        _mxnb    = new MockMXNB();
        _sbt     = new ReputationSBT(_deployerAddr);
        // deployer is aiSigner so we can produce valid EIP-712 sigs below
        _uw      = new Underwriter(address(_sbt), _deployerAddr);
        _pool    = new InsurancePool(address(_mxnb), _deployerAddr);
        _factory = new CircleFactory(address(_mxnb), address(_sbt), address(_uw), address(_pool));
        vm.stopBroadcast();
    }

    // ── 2. Seed reputation (deployer still holds SBT admin) ───────────────────
    function _seedReputation() internal {
        vm.startBroadcast(_deployerKey);
        // Authorize deployer as a pseudo-circle so it can call record*
        _sbt.setCircleAuthorized(_deployerAddr, true);

        // María: 6× onTime + 1× completion → base = 50 + 6*4 + 1*8 = 82
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordOnTime(_mariaAddr);
        _sbt.recordCompletion(_mariaAddr);

        // Diego: 4× onTime → base = 50 + 4*4 = 66
        _sbt.recordOnTime(_diegoAddr);
        _sbt.recordOnTime(_diegoAddr);
        _sbt.recordOnTime(_diegoAddr);
        _sbt.recordOnTime(_diegoAddr);

        // Lupe: nothing → base = 50

        // 0xkito: 1× default → base = 50 - 1*25 = 25
        _sbt.recordDefault(_kitoAddr);

        vm.stopBroadcast();
    }

    // ── 3. Hand admin to factory ──────────────────────────────────────────────
    function _handAdminToFactory() internal {
        vm.startBroadcast(_deployerKey);
        _sbt.transferAdmin(address(_factory));
        _pool.transferAdmin(address(_factory));
        vm.stopBroadcast();
    }

    // ── 4. Mint MXNB ─────────────────────────────────────────────────────────
    function _mintTokens() internal {
        vm.startBroadcast(_deployerKey);
        _mxnb.mint(_mariaAddr,  1_000_000_000); // 1 000 MXNB
        _mxnb.mint(_diegoAddr,  1_000_000_000);
        _mxnb.mint(_lupeAddr,   1_000_000_000);
        _mxnb.mint(_kitoAddr,   1_000_000_000);
        // Seed pool: 1 227 MXNB + ~13 MXNB from premiums at join ≈ 1 240 MXNB
        _mxnb.mint(address(_pool), 1_227_000_000);
        vm.stopBroadcast();
    }

    // ── 5. Create circle ──────────────────────────────────────────────────────
    function _createCircle() internal {
        vm.broadcast(_deployerKey);
        _circle = _factory.createCircle(AMOUNT, MAX, ROUND, BIDDUR);
    }

    // ── 6. Members join ───────────────────────────────────────────────────────
    function _membersJoin() internal {
        bytes32 rationaleHash = keccak256("seed");
        uint256 deadline      = block.timestamp + 1 hours;

        _joinOne(_mariaKey, _mariaAddr, SCORE_MARIA, rationaleHash, deadline);
        _joinOne(_diegoKey, _diegoAddr, SCORE_DIEGO, rationaleHash, deadline);
        _joinOne(_lupeKey,  _lupeAddr,  SCORE_LUPE,  rationaleHash, deadline);
        _joinOne(_kitoKey,  _kitoAddr,  SCORE_KITO,  rationaleHash, deadline);
    }

    function _joinOne(
        uint256 memberKey,
        address memberAddr,
        uint256 score,
        bytes32 rationaleHash,
        uint256 deadline
    ) internal {
        bytes memory sig = SignDecision.sign(
            vm, _deployerKey, address(_uw), _circle, memberAddr, score, rationaleHash, deadline
        );
        vm.startBroadcast(memberKey);
        _mxnb.approve(_circle, type(uint256).max);
        TandaCircle(_circle).join(score, rationaleHash, deadline, sig);
        vm.stopBroadcast();
    }

    // ── 7. Start ──────────────────────────────────────────────────────────────
    function _start() internal {
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).start();
    }

    // ── 8. Round 0 — all contribute, happy payout ─────────────────────────────
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
        // currentRound advances to 1
    }

    // ── 9. Round 1 — María/Diego/Lupe contribute; kito skips; AI flag posted ───
    function _round1() internal {
        vm.broadcast(_mariaKey);
        TandaCircle(_circle).contribute();

        vm.broadcast(_diegoKey);
        TandaCircle(_circle).contribute();

        vm.broadcast(_lupeKey);
        TandaCircle(_circle).contribute();

        // 0xkito does NOT contribute — leaves round in-flight

        // Post AI risk flag for 0xkito in round 1
        bytes32 riskHash     = keccak256("risk");
        uint256 flagDeadline = block.timestamp + 1 hours;
        bytes memory flagSig = SignDecision.signRiskFlag(
            vm, _deployerKey, address(_uw), _circle, _kitoAddr, 1, riskHash, flagDeadline
        );
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).flagAtRisk(_kitoAddr, riskHash, flagDeadline, flagSig);
    }

    // ── 10. Log all addresses for .env.local ──────────────────────────────────
    function _logAddresses() internal view {
        console2.log("=== Tanda Demo Addresses (paste into web/.env.local) ===");
        console2.log("NEXT_PUBLIC_MXNB=       ", address(_mxnb));
        console2.log("NEXT_PUBLIC_REPUTATION= ", address(_sbt));
        console2.log("NEXT_PUBLIC_UNDERWRITER=", address(_uw));
        console2.log("NEXT_PUBLIC_INSURANCE=  ", address(_pool));
        console2.log("NEXT_PUBLIC_FACTORY=    ", address(_factory));
        console2.log("NEXT_PUBLIC_DEMO_CIRCLE=", _circle);
        console2.log("=== Member Addresses ===");
        console2.log("DEPLOYER / AI_SIGNER=   ", _deployerAddr);
        console2.log("MARIA=                  ", _mariaAddr);
        console2.log("DIEGO=                  ", _diegoAddr);
        console2.log("LUPE=                   ", _lupeAddr);
        console2.log("KITO=                   ", _kitoAddr);
    }
}
