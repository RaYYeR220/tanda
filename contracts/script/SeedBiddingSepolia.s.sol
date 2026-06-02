// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2} from "forge-std/console2.sol";
import {MockMXNB} from "../src/MockMXNB.sol";
import {TandaCircle} from "../src/TandaCircle.sol";
import {CircleFactory} from "../src/CircleFactory.sol";
import {SignDecision} from "../test/util/SignDecision.sol";

/// @notice Seed a circle that goes through a REAL bidding auction, to demo the AI risk band.
///         Reuses the same keccak-derived members as SeedDemoSepolia (they already carry the
///         seeded reputation 82/66/50/28 on the shared ReputationSBT), so their AI scores — and
///         therefore their `earliestSlot` floors — differ. 0xkito (score 28) bids the MOST yet the
///         band floors a score-<30 member to slot n/2, so the top bid cannot buy an early slot.
///
/// Flow: create → members join → openBidding → members bid → finalizeBidding (→ Active).
/// Members are topped up with MXNB + gas from the deployer, so run with `--slow`.
///
/// Run (PowerShell), reusing the existing Sepolia deployment:
///   $env:PRIVATE_KEY="0x<funded deployer key>"
///   $env:FACTORY="0xFD53CE3B35660D8B8Dfa514DDB3853172A42C1E8"
///   $env:MXNB="0x7FeA15363F3Cc0B71DA8545C0ECb4b752e5F1F3e"
///   $env:UW="0x67f70c123B446fE87C51Eb78A1e64Ba3e1B2042D"
///   forge script script/SeedBiddingSepolia.s.sol:SeedBiddingSepolia `
///     --rpc-url $env:ARBITRUM_SEPOLIA_RPC_URL --broadcast --slow
contract SeedBiddingSepolia is Script {
    uint256 internal constant AI_SIGNER_KEY = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    uint256 internal constant AMOUNT = 100_000_000; // 100 MXNB
    uint8 internal constant MAX = 4;
    uint256 internal constant ROUND = 600;
    uint256 internal constant BIDDUR = 300;

    uint256 internal constant SCORE_MARIA = 82;
    uint256 internal constant SCORE_DIEGO = 66;
    uint256 internal constant SCORE_LUPE = 50;
    uint256 internal constant SCORE_KITO = 28;

    // Bids (6dp). kito bids the HIGHEST to prove the band still blocks an early slot.
    uint256 internal constant BID_KITO = 80_000_000; // 80 MXNB — top bid, but score 28 → floor n/2
    uint256 internal constant BID_MARIA = 50_000_000; // 50 MXNB
    uint256 internal constant BID_DIEGO = 30_000_000; // 30 MXNB
    uint256 internal constant BID_LUPE = 10_000_000; // 10 MXNB

    MockMXNB internal _mxnb;
    address internal _uw;
    address internal _circle;

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
        _deployerKey = vm.envUint("PRIVATE_KEY");
        _mxnb = MockMXNB(vm.envAddress("MXNB"));
        _uw = vm.envAddress("UW");
        address factory = vm.envAddress("FACTORY");

        // Same members as SeedDemoSepolia (their reputation/scores are already on-chain).
        _mariaKey = uint256(keccak256("tanda.sepolia.member.maria.v1"));
        _diegoKey = uint256(keccak256("tanda.sepolia.member.diego.v1"));
        _lupeKey = uint256(keccak256("tanda.sepolia.member.lupe.v1"));
        _kitoKey = uint256(keccak256("tanda.sepolia.member.kito.v1"));
        _mariaAddr = vm.addr(_mariaKey);
        _diegoAddr = vm.addr(_diegoKey);
        _lupeAddr = vm.addr(_lupeKey);
        _kitoAddr = vm.addr(_kitoKey);

        // Top up MXNB + gas so the joins/bids can't run short (run with --slow).
        vm.startBroadcast(_deployerKey);
        _mxnb.mint(_mariaAddr, 1_000_000_000);
        _mxnb.mint(_diegoAddr, 1_000_000_000);
        _mxnb.mint(_lupeAddr, 1_000_000_000);
        _mxnb.mint(_kitoAddr, 1_000_000_000);
        _fund(_mariaAddr);
        _fund(_diegoAddr);
        _fund(_lupeAddr);
        _fund(_kitoAddr);
        _circle = CircleFactory(factory).createCircle(AMOUNT, MAX, ROUND, BIDDUR);
        vm.stopBroadcast();

        _join(_mariaKey, _mariaAddr, SCORE_MARIA);
        _join(_diegoKey, _diegoAddr, SCORE_DIEGO);
        _join(_lupeKey, _lupeAddr, SCORE_LUPE);
        _join(_kitoKey, _kitoAddr, SCORE_KITO);

        vm.broadcast(_deployerKey);
        TandaCircle(_circle).openBidding();

        // approve(max) at join already covers the bid fee's transferFrom.
        vm.broadcast(_mariaKey);
        TandaCircle(_circle).bid(BID_MARIA);
        vm.broadcast(_diegoKey);
        TandaCircle(_circle).bid(BID_DIEGO);
        vm.broadcast(_lupeKey);
        TandaCircle(_circle).bid(BID_LUPE);
        vm.broadcast(_kitoKey);
        TandaCircle(_circle).bid(BID_KITO);

        vm.broadcast(_deployerKey);
        TandaCircle(_circle).finalizeBidding();

        console2.log("=== Bidding circle (auction demo) ===");
        console2.log("NEXT_PUBLIC_AUCTION_CIRCLE=", _circle);
        console2.log("payoutOrder[0] memberIdx=", TandaCircle(_circle).payoutOrderAt(0));
        console2.log("payoutOrder[1] memberIdx=", TandaCircle(_circle).payoutOrderAt(1));
        console2.log("payoutOrder[2] memberIdx=", TandaCircle(_circle).payoutOrderAt(2));
        console2.log("payoutOrder[3] memberIdx=", TandaCircle(_circle).payoutOrderAt(3));
    }

    function _fund(address to) internal {
        (bool ok,) = to.call{value: 1e15}(""); // 0.001 ETH
        require(ok, "gas fund failed");
    }

    function _join(uint256 key, address addr, uint256 score) internal {
        bytes32 rationaleHash = keccak256("seed");
        uint256 deadline = block.timestamp + 1 hours;
        bytes memory sig = SignDecision.sign(vm, AI_SIGNER_KEY, _uw, _circle, addr, score, rationaleHash, deadline);
        vm.startBroadcast(key);
        _mxnb.approve(_circle, type(uint256).max);
        TandaCircle(_circle).join(score, rationaleHash, deadline, sig);
        vm.stopBroadcast();
    }
}
