// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TandaCircle} from "./TandaCircle.sol";
import {ReputationSBT} from "./ReputationSBT.sol";
import {Underwriter} from "./Underwriter.sol";

/// @notice Deploys and registers TandaCircle instances; authorizes each to write the SBT.
/// @dev Must hold SBT admin (via ReputationSBT.transferAdmin) to authorize circles.
contract CircleFactory {
    address public immutable mxnb;
    ReputationSBT public immutable reputation;
    Underwriter public immutable underwriter;

    address[] public allCircles;
    mapping(address => bool) public isCircle;

    error InvalidParams();

    event CircleCreated(
        address indexed circle, address indexed organizer, uint256 contributionAmount, uint8 maxMembers
    );

    constructor(address mxnb_, address reputation_, address underwriter_) {
        mxnb = mxnb_;
        reputation = ReputationSBT(reputation_);
        underwriter = Underwriter(underwriter_);
    }

    function allCirclesLength() external view returns (uint256) {
        return allCircles.length;
    }

    function createCircle(uint256 contributionAmount, uint8 maxMembers) external returns (address) {
        if (contributionAmount == 0 || maxMembers < 2) revert InvalidParams();
        TandaCircle circle =
            new TandaCircle(msg.sender, mxnb, address(reputation), address(underwriter), contributionAmount, maxMembers);
        address addr = address(circle);
        allCircles.push(addr);
        isCircle[addr] = true;
        reputation.setCircleAuthorized(addr, true);
        emit CircleCreated(addr, msg.sender, contributionAmount, maxMembers);
        return addr;
    }
}
