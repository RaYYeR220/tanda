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

/// @notice Deploy + seed the full "Tanda Oaxaca" demo on a PUBLIC testnet (Arbitrum Sepolia).
///
/// Differences vs the local `SeedDemo` (anvil) script:
///   1. The DEPLOYER is the user's own funded key, supplied via the PRIVATE_KEY env var.
///      It only broadcasts (deploy, fund, create, payout, flag) — it is never the AI signer.
///   2. The AI SIGNER is the well-known test account #0 key (a throwaway, public test key).
///      It only *signs* EIP-712 digests off-chain — it needs no gas, so it never broadcasts.
///      Keeping it fixed means web/.env.local's AI_SIGNER_KEY is IDENTICAL for anvil and Sepolia.
///   3. The 4 member accounts (test-mnemonic indices 1-4) start with 0 testnet ETH, so the
///      deployer FUNDS each with a little gas ETH before they transact. This requires `--slow`
///      so each funding tx confirms before the funded account spends it.
///   4. The round duration is short (default 600s) so the "default caught" resolveRound
///      money-shot can be demonstrated live shortly after seeding.
///
/// Run (PowerShell):
///   $env:PRIVATE_KEY="0x<your funded Arbitrum-Sepolia key>"
///   $env:ARBITRUM_SEPOLIA_RPC_URL="https://<your rpc>"
///   cd contracts
///   forge script script/SeedDemoSepolia.s.sol:SeedDemoSepolia `
///     --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast --slow
///
/// Optional env overrides: ROUND_SECONDS (default 600), BID_SECONDS (default 300),
///   GAS_FUND_WEI (default 5e15 = 0.005 ETH per member).
contract SeedDemoSepolia is Script {
    /// Well-known test account #0 private key — used ONLY as the AI signer (signs, never broadcasts).
    /// Public throwaway key; safe for a testnet demo. Same value as web/.env.local AI_SIGNER_KEY.
    uint256 internal constant AI_SIGNER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    // 100 MXNB (6 decimals)
    uint256 internal constant AMOUNT = 100_000_000;
    uint8 internal constant MAX = 4;

    // Adjusted scores — within ±15 of the seeded on-chain base (see _seedReputation).
    uint256 internal constant SCORE_MARIA = 82; // base 82 → band [67,97]
    uint256 internal constant SCORE_DIEGO = 66; // base 66 → band [51,81]
    uint256 internal constant SCORE_LUPE = 50; //  base 50 → band [35,65]
    uint256 internal constant SCORE_KITO = 28; //  base 25 → band [10,40]

    // ── Shared state ──────────────────────────────────────────────────────────
    MockMXNB internal _mxnb;
    ReputationSBT internal _sbt;
    Underwriter internal _uw;
    InsurancePool internal _pool;
    CircleFactory internal _factory;
    address internal _circle;

    uint256 internal _deployerKey;
    uint256 internal _mariaKey;
    uint256 internal _diegoKey;
    uint256 internal _lupeKey;
    uint256 internal _kitoKey;

    address internal _deployerAddr;
    address internal _aiSignerAddr;
    address internal _mariaAddr;
    address internal _diegoAddr;
    address internal _lupeAddr;
    address internal _kitoAddr;

    uint256 internal _round;
    uint256 internal _bidDur;
    uint256 internal _gasFund;

    function run() external {
        // The deployer (funded) key comes from env — never hard-coded, never the AI signer.
        _deployerKey = vm.envUint("PRIVATE_KEY");
        _deployerAddr = vm.addr(_deployerKey);
        _aiSignerAddr = vm.addr(AI_SIGNER_KEY);

        // High-entropy, project-specific member keys — NOT the public test mnemonic.
        // Those well-known addresses (anvil 1-4) are instantly swept on public testnets:
        // bots set EIP-7702 delegations that drain any incoming ETH, so gas funding never
        // sticks. keccak-derived keys are unknown to sweepers, so funding survives.
        _mariaKey = uint256(keccak256("tanda.sepolia.member.maria.v1"));
        _diegoKey = uint256(keccak256("tanda.sepolia.member.diego.v1"));
        _lupeKey = uint256(keccak256("tanda.sepolia.member.lupe.v1"));
        _kitoKey = uint256(keccak256("tanda.sepolia.member.kito.v1"));
        _mariaAddr = vm.addr(_mariaKey);
        _diegoAddr = vm.addr(_diegoKey);
        _lupeAddr = vm.addr(_lupeKey);
        _kitoAddr = vm.addr(_kitoKey);

        _round = vm.envOr("ROUND_SECONDS", uint256(600));
        _bidDur = vm.envOr("BID_SECONDS", uint256(300));
        _gasFund = vm.envOr("GAS_FUND_WEI", uint256(2e15)); // 0.002 ETH — plenty for ~4 member txs

        _deploy();
        _seedReputation();
        _handAdminToFactory();
        _mintTokens();
        _fundMembersGas();
        _createCircle();
        _membersJoin();
        _start();
        _round0();
        _round1();
        _logAddresses();
    }

    // ── 1. Deploy (aiSigner = test acct #0, NOT the deployer) ──────────────────
    function _deploy() internal {
        vm.startBroadcast(_deployerKey);
        _mxnb = new MockMXNB();
        _sbt = new ReputationSBT(_deployerAddr);
        _uw = new Underwriter(address(_sbt), _aiSignerAddr);
        _pool = new InsurancePool(address(_mxnb), _deployerAddr);
        _factory = new CircleFactory(address(_mxnb), address(_sbt), address(_uw), address(_pool));
        vm.stopBroadcast();
    }

    // ── 2. Seed reputation (deployer still holds SBT admin) ────────────────────
    function _seedReputation() internal {
        vm.startBroadcast(_deployerKey);
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

    // ── 3. Hand admin to factory ───────────────────────────────────────────────
    function _handAdminToFactory() internal {
        vm.startBroadcast(_deployerKey);
        _sbt.transferAdmin(address(_factory));
        _pool.transferAdmin(address(_factory));
        vm.stopBroadcast();
    }

    // ── 4. Mint MXNB to members + seed the insurance pool ──────────────────────
    function _mintTokens() internal {
        vm.startBroadcast(_deployerKey);
        _mxnb.mint(_mariaAddr, 1_000_000_000); // 1 000 MXNB each
        _mxnb.mint(_diegoAddr, 1_000_000_000);
        _mxnb.mint(_lupeAddr, 1_000_000_000);
        _mxnb.mint(_kitoAddr, 1_000_000_000);
        _mxnb.mint(address(_pool), 1_227_000_000); // ≈1 240 MXNB after join premiums
        vm.stopBroadcast();
    }

    // ── 5. Fund member EOAs with gas ETH (testnet accounts start empty) ────────
    //      Requires `--slow` so these confirm before the members spend the gas.
    function _fundMembersGas() internal {
        vm.startBroadcast(_deployerKey);
        _fundOne(_mariaAddr);
        _fundOne(_diegoAddr);
        _fundOne(_lupeAddr);
        _fundOne(_kitoAddr);
        vm.stopBroadcast();
    }

    function _fundOne(address to) internal {
        (bool ok,) = to.call{value: _gasFund}("");
        require(ok, "gas funding transfer failed");
    }

    // ── 6. Create circle ────────────────────────────────────────────────────────
    function _createCircle() internal {
        vm.broadcast(_deployerKey);
        _circle = _factory.createCircle(AMOUNT, MAX, _round, _bidDur);
    }

    // ── 7. Members join (each broadcasts its own tx → needs the gas funded above)
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
        // Signed by the AI signer key (acct #0) — NOT the deployer.
        bytes memory sig =
            SignDecision.sign(vm, AI_SIGNER_KEY, address(_uw), _circle, memberAddr, score, rationaleHash, deadline);
        vm.startBroadcast(memberKey);
        _mxnb.approve(_circle, type(uint256).max);
        TandaCircle(_circle).join(score, rationaleHash, deadline, sig);
        vm.stopBroadcast();
    }

    // ── 8. Start ────────────────────────────────────────────────────────────────
    function _start() internal {
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).start();
    }

    // ── 9. Round 0 — all contribute, happy payout (no time-warp needed) ─────────
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
        TandaCircle(_circle).payout(); // currentRound advances to 1
    }

    // ── 10. Round 1 — María/Diego/Lupe contribute; kito skips; AI flag posted ──
    function _round1() internal {
        vm.broadcast(_mariaKey);
        TandaCircle(_circle).contribute();

        vm.broadcast(_diegoKey);
        TandaCircle(_circle).contribute();

        vm.broadcast(_lupeKey);
        TandaCircle(_circle).contribute();

        // 0xkito does NOT contribute — leaves round 1 in-flight (the default money-shot).

        bytes32 riskHash = keccak256("risk");
        uint256 flagDeadline = block.timestamp + 1 hours;
        bytes memory flagSig =
            SignDecision.signRiskFlag(vm, AI_SIGNER_KEY, address(_uw), _circle, _kitoAddr, 1, riskHash, flagDeadline);
        vm.broadcast(_deployerKey);
        TandaCircle(_circle).flagAtRisk(_kitoAddr, riskHash, flagDeadline, flagSig);
    }

    // ── 11. Log everything to paste into web/.env.local ────────────────────────
    function _logAddresses() internal view {
        console2.log("=== Tanda Sepolia Addresses (paste into web/.env.local) ===");
        console2.log("NEXT_PUBLIC_CHAIN=arbitrumSepolia");
        console2.log("NEXT_PUBLIC_MXNB=       ", address(_mxnb));
        console2.log("NEXT_PUBLIC_REPUTATION= ", address(_sbt));
        console2.log("NEXT_PUBLIC_UNDERWRITER=", address(_uw));
        console2.log("NEXT_PUBLIC_INSURANCE=  ", address(_pool));
        console2.log("NEXT_PUBLIC_FACTORY=    ", address(_factory));
        console2.log("NEXT_PUBLIC_DEMO_CIRCLE=", _circle);
        console2.log("--- AI_SIGNER_KEY stays the same as anvil (test acct #0) ---");
        console2.log("AI signer address:      ", _aiSignerAddr);
        console2.log("=== Actors ===");
        console2.log("DEPLOYER (funded)=      ", _deployerAddr);
        console2.log("MARIA=                  ", _mariaAddr);
        console2.log("DIEGO=                  ", _diegoAddr);
        console2.log("LUPE=                   ", _lupeAddr);
        console2.log("KITO=                   ", _kitoAddr);
        console2.log("round seconds=          ", _round);
    }
}
