// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ReputationSBT} from "./ReputationSBT.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

/// @notice Computes a deterministic on-chain base reliability score from ReputationSBT,
///         verifies the AI's EIP-712-signed score adjustment, clamps it to a band, and
///         maps the final score to required collateral. Trust-minimized: the AI can only
///         nudge the score within +/- MAX_DELTA of the contract-computed base score.
contract Underwriter is EIP712 {
    ReputationSBT public immutable reputation;
    /// @dev The AI agent's signing address, fixed at deploy. Immutable so the trust-minimization
    ///      guarantee (decisions clamped to a band around an on-chain base score) cannot be
    ///      silently re-pointed to a different signer; rotation requires a fresh deployment.
    address public immutable aiSigner;

    uint256 public constant MAX_DELTA = 15;

    bytes32 private constant DECISION_TYPEHASH = keccak256(
        "Decision(address circle,address member,uint256 adjustedScore,bytes32 rationaleHash,uint256 deadline)"
    );

    error ScoreOutOfBand();
    error InvalidSigner();
    error SignatureExpired();
    error ZeroAddress();

    constructor(address reputation_, address aiSigner_) EIP712("TandaUnderwriter", "1") {
        if (reputation_ == address(0) || aiSigner_ == address(0)) revert ZeroAddress();
        reputation = ReputationSBT(reputation_);
        aiSigner = aiSigner_;
    }

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

    function quote(uint256 score, uint256 contributionAmount) public pure returns (uint256) {
        uint256 bps;
        if (score >= 80) bps = 5000;
        else if (score >= 60) bps = 10000;
        else if (score >= 40) bps = 20000;
        else bps = 30000;
        return contributionAmount * bps / 10000;
    }

    /// @notice Risk-priced insurance premium for a given score, in token base units.
    ///         Lower score (riskier) pays a higher premium that funds the insurance buffer.
    function premium(uint256 score, uint256 contributionAmount) public pure returns (uint256) {
        uint256 bps;
        if (score >= 80) bps = 100; // 1%
        else if (score >= 60) bps = 200; // 2%
        else if (score >= 40) bps = 400; // 4%
        else bps = 600; // 6%
        return contributionAmount * bps / 10000;
    }

    /// @notice Verify the AI's signed decision, enforce the band, and return required collateral.
    /// @dev Reverts if expired, wrong signer, tampered, or the adjusted score is outside
    ///      [baseScore - MAX_DELTA, baseScore + MAX_DELTA].
    function verifyAndQuote(
        address circle,
        address member,
        uint256 adjustedScore,
        bytes32 rationaleHash,
        uint256 deadline,
        uint256 contributionAmount,
        bytes calldata signature
    ) external view returns (uint256) {
        if (block.timestamp > deadline) revert SignatureExpired();

        bytes32 structHash =
            keccak256(abi.encode(DECISION_TYPEHASH, circle, member, adjustedScore, rationaleHash, deadline));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);
        if (signer != aiSigner) revert InvalidSigner();

        uint256 base = baseScore(member);
        uint256 lo = base > MAX_DELTA ? base - MAX_DELTA : 0;
        uint256 hi = base + MAX_DELTA > 100 ? 100 : base + MAX_DELTA;
        if (adjustedScore < lo || adjustedScore > hi) revert ScoreOutOfBand();

        return quote(adjustedScore, contributionAmount);
    }
}
