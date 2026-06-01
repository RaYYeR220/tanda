// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";
import {Underwriter} from "./Underwriter.sol";

/// @notice One rotating savings circle (ROSCA). Phase 1: fixed join-order payout, on-time recording.
/// @dev Extension points for later phases: `collateral` mapping and `underwriter` address (unused here).
contract TandaCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Forming,
        Active,
        Completed,
        Defaulted
    }

    address public immutable organizer;
    IERC20 public immutable token;
    IReputationSBT public immutable reputation;
    uint256 public immutable contributionAmount;
    uint8 public immutable maxMembers;

    State public state;
    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public collateral;
    Underwriter public immutable underwriter;

    uint256 public currentRound; // 0-indexed; recipient = members[currentRound]
    mapping(uint256 => mapping(address => bool)) public contributedInRound;
    mapping(uint256 => uint256) public roundContributions; // count of contributors this round

    error NotOrganizer();
    error WrongState();
    error AlreadyMember();
    error CircleFull();
    error NotFull();
    error NotMember();
    error AlreadyContributed();
    error RoundIncomplete();
    error NoCollateral();

    event Joined(address indexed member, uint256 index);
    event Started(uint256 timestamp);
    event Contributed(address indexed member, uint256 indexed round);
    event PaidOut(address indexed recipient, uint256 indexed round, uint256 amount);
    event Completed();
    event CollateralWithdrawn(address indexed member, uint256 amount);

    modifier inState(State s) {
        if (state != s) revert WrongState();
        _;
    }

    constructor(
        address organizer_,
        address token_,
        address reputation_,
        address underwriter_,
        uint256 contributionAmount_,
        uint8 maxMembers_
    ) {
        organizer = organizer_;
        token = IERC20(token_);
        reputation = IReputationSBT(reputation_);
        underwriter = Underwriter(underwriter_);
        contributionAmount = contributionAmount_;
        maxMembers = maxMembers_;
        state = State.Forming;
    }

    function memberCount() external view returns (uint256) {
        return members.length;
    }

    function join(uint256 adjustedScore, bytes32 rationaleHash, uint256 deadline, bytes calldata signature)
        external
        inState(State.Forming)
        nonReentrant
    {
        if (isMember[msg.sender]) revert AlreadyMember();
        if (members.length >= maxMembers) revert CircleFull();

        uint256 required = underwriter.verifyAndQuote(
            address(this), msg.sender, adjustedScore, rationaleHash, deadline, contributionAmount, signature
        );

        isMember[msg.sender] = true;
        members.push(msg.sender);
        collateral[msg.sender] = required;
        emit Joined(msg.sender, members.length - 1);

        if (required > 0) {
            token.safeTransferFrom(msg.sender, address(this), required);
        }
    }

    function start() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Active;
        emit Started(block.timestamp);
    }

    function contribute() external inState(State.Active) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (contributedInRound[currentRound][msg.sender]) revert AlreadyContributed();
        contributedInRound[currentRound][msg.sender] = true;
        roundContributions[currentRound] += 1;
        token.safeTransferFrom(msg.sender, address(this), contributionAmount);
        reputation.recordOnTime(msg.sender);
        emit Contributed(msg.sender, currentRound);
    }

    function payout() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] != members.length) revert RoundIncomplete();
        address recipient = members[currentRound];
        uint256 amount = contributionAmount * members.length;
        emit PaidOut(recipient, currentRound, amount);

        if (currentRound + 1 == members.length) {
            state = State.Completed;
            for (uint256 i = 0; i < members.length; i++) {
                reputation.recordCompletion(members[i]);
            }
            emit Completed();
        } else {
            currentRound += 1;
        }
        token.safeTransfer(recipient, amount);
    }

    function withdrawCollateral() external inState(State.Completed) nonReentrant {
        uint256 amount = collateral[msg.sender];
        if (amount == 0) revert NoCollateral();
        collateral[msg.sender] = 0;
        emit CollateralWithdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }
}
