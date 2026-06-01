// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Vm} from "forge-std/Vm.sol";

/// @dev Builds the EIP-712 digest for an Underwriter Decision and signs it with a vm private key.
library SignDecision {
    bytes32 internal constant DECISION_TYPEHASH = keccak256(
        "Decision(address circle,address member,uint256 adjustedScore,bytes32 rationaleHash,uint256 deadline)"
    );

    function domainSeparator(address verifyingContract) internal view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("TandaUnderwriter")),
                keccak256(bytes("1")),
                block.chainid,
                verifyingContract
            )
        );
    }

    function sign(
        Vm vm,
        uint256 signerKey,
        address verifyingContract,
        address circle,
        address member,
        uint256 adjustedScore,
        bytes32 rationaleHash,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(DECISION_TYPEHASH, circle, member, adjustedScore, rationaleHash, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(verifyingContract), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }

    bytes32 internal constant RISK_FLAG_TYPEHASH = keccak256(
        "RiskFlag(address circle,address member,uint256 round,bytes32 rationaleHash,uint256 deadline)"
    );

    function signRiskFlag(
        Vm vm,
        uint256 signerKey,
        address verifyingContract,
        address circle,
        address member,
        uint256 round,
        bytes32 rationaleHash,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 structHash =
            keccak256(abi.encode(RISK_FLAG_TYPEHASH, circle, member, round, rationaleHash, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator(verifyingContract), structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerKey, digest);
        return abi.encodePacked(r, s, v);
    }
}
