// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationSBT} from "./ReputationSBT.sol";

/// @notice Computes a deterministic on-chain base reliability score from ReputationSBT,
///         and maps a (clamped) score to required collateral. EIP-712 verification of the
///         AI's signed adjustment is added in a later step.
contract Underwriter {
    ReputationSBT public immutable reputation;
    address public aiSigner;

    uint256 public constant MAX_DELTA = 15; // AI may move the score by at most this many points

    constructor(address reputation_, address aiSigner_) {
        reputation = ReputationSBT(reputation_);
        aiSigner = aiSigner_;
    }

    /// @notice Deterministic base score in [0,100] from on-chain reputation. Cold-start = 50.
    function baseScore(address member) public view returns (uint256) {
        (, uint32 onTime, uint32 late, uint32 defaults, uint32 completed) = reputation.reputation(member);
        int256 s = 50;
        s += int256(uint256(onTime)) * 4;
        s += int256(uint256(completed)) * 8;
        s -= int256(uint256(late)) * 6;
        s -= int256(uint256(defaults)) * 25;
        if (s < 0) return 0;
        if (s > 100) return 100;
        return uint256(s);
    }

    /// @notice Required collateral for a given score, in token base units.
    function quote(uint256 score, uint256 contributionAmount) public pure returns (uint256) {
        uint256 bps;
        if (score >= 80) bps = 5000;
        else if (score >= 60) bps = 10000;
        else if (score >= 40) bps = 20000;
        else bps = 30000;
        return contributionAmount * bps / 10000;
    }
}
