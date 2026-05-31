// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IReputationSBT} from "./interfaces/IReputationSBT.sol";

/// @notice Per-address cross-circle reputation. Writable only by authorized circles.
/// @dev Soulbound ERC-721 wrapper is added in a later step; this holds data + auth.
contract ReputationSBT is IReputationSBT {
    struct Reputation {
        uint32 roundsParticipated;
        uint32 onTime;
        uint32 late;
        uint32 defaults;
        uint32 circlesCompleted;
    }

    address public admin;
    mapping(address => bool) public isAuthorizedCircle;
    mapping(address => Reputation) public reputation;

    error NotAdmin();
    error NotAuthorizedCircle();

    event CircleAuthorized(address indexed circle, bool authorized);
    event ReputationUpdated(address indexed member);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address admin_) {
        admin = admin_;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    function recordOnTime(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.onTime += 1;
        emit ReputationUpdated(member);
    }

    function recordLate(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.late += 1;
        emit ReputationUpdated(member);
    }

    function recordDefault(address member) external onlyAuthorizedCircle {
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.defaults += 1;
        emit ReputationUpdated(member);
    }

    function recordCompletion(address member) external onlyAuthorizedCircle {
        reputation[member].circlesCompleted += 1;
        emit ReputationUpdated(member);
    }
}
