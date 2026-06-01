// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";
import {Underwriter} from "./Underwriter.sol";
import {InsurancePool} from "./InsurancePool.sol";

/// @notice One rotating savings circle (ROSCA) in MXNB.
///         Members post AI-quoted collateral and a risk-priced premium at join. Each round all
///         members contribute and the round's recipient receives the pot. If a member misses a
///         contribution, after the round deadline anyone calls resolveRound(): the defaulter's
///         collateral is slashed and the insurance pool tops up any shortfall so the recipient is
///         made whole; the defaulter's reputation is downgraded. Underfunded rounds haircut the
///         recipient and emit RoundUnderfunded (loss surfaced honestly, no magic).
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
    Underwriter public immutable underwriter;
    InsurancePool public immutable insurancePool;
    uint256 public immutable contributionAmount;
    uint8 public immutable maxMembers;
    uint256 public immutable roundDuration;

    State public state;
    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public collateral;
    mapping(address => bool) public hasDefaulted;

    uint256 public currentRound;
    uint256 public roundDeadline;
    mapping(uint256 => mapping(address => bool)) public contributedInRound;
    mapping(uint256 => uint256) public roundContributions;

    error NotOrganizer();
    error WrongState();
    error AlreadyMember();
    error CircleFull();
    error NotFull();
    error NotMember();
    error AlreadyContributed();
    error RoundIncomplete();
    error RoundNotExpired();
    error RoundAlreadyComplete();
    error NoCollateral();
    error ZeroAddress();

    event Joined(address indexed member, uint256 index, uint256 collateral, uint256 premium);
    event Started(uint256 timestamp, uint256 roundDeadline);
    event Contributed(address indexed member, uint256 indexed round);
    event PaidOut(address indexed recipient, uint256 indexed round, uint256 amount);
    event MemberDefaulted(
        address indexed member, uint256 indexed round, uint256 owed, uint256 fromCollateral, uint256 fromInsurance
    );
    event RoundUnderfunded(uint256 indexed round, uint256 shortfall);
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
        address insurancePool_,
        uint256 contributionAmount_,
        uint8 maxMembers_,
        uint256 roundDuration_
    ) {
        if (
            organizer_ == address(0) || token_ == address(0) || reputation_ == address(0)
                || underwriter_ == address(0) || insurancePool_ == address(0)
        ) revert ZeroAddress();
        organizer = organizer_;
        token = IERC20(token_);
        reputation = IReputationSBT(reputation_);
        underwriter = Underwriter(underwriter_);
        insurancePool = InsurancePool(insurancePool_);
        contributionAmount = contributionAmount_;
        maxMembers = maxMembers_;
        roundDuration = roundDuration_;
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
        uint256 prem = underwriter.premium(adjustedScore, contributionAmount);

        isMember[msg.sender] = true;
        members.push(msg.sender);
        collateral[msg.sender] = required;
        emit Joined(msg.sender, members.length - 1, required, prem);

        uint256 total = required + prem;
        if (total > 0) {
            token.safeTransferFrom(msg.sender, address(this), total);
        }
        if (prem > 0) {
            token.safeTransfer(address(insurancePool), prem);
            insurancePool.notifyPremium(prem);
        }
    }

    function start() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit Started(block.timestamp, roundDeadline);
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

    /// @notice Happy path: everyone has contributed this round; pay the recipient the full pot.
    function payout() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] != members.length) revert RoundIncomplete();
        _settle(contributionAmount * members.length);
    }

    /// @notice Default path: after the round deadline, slash defaulters and draw insurance to make
    ///         the recipient whole, then advance. Reverts if the round is complete (use payout) or
    ///         the deadline has not passed.
    function resolveRound() external inState(State.Active) nonReentrant {
        if (roundContributions[currentRound] == members.length) revert RoundAlreadyComplete();
        if (block.timestamp <= roundDeadline) revert RoundNotExpired();

        uint256 n = members.length;
        uint256 pot = contributionAmount * n;
        uint256 liquid = roundContributions[currentRound] * contributionAmount;

        for (uint256 i = 0; i < n; i++) {
            address m = members[i];
            if (!contributedInRound[currentRound][m]) {
                hasDefaulted[m] = true;
                uint256 owed = contributionAmount;
                uint256 fromCol = collateral[m] >= owed ? owed : collateral[m];
                collateral[m] -= fromCol;
                uint256 shortfall = owed - fromCol;
                uint256 fromIns = 0;
                if (shortfall > 0) {
                    fromIns = insurancePool.cover(shortfall);
                }
                liquid += fromCol + fromIns;
                reputation.recordDefault(m);
                emit MemberDefaulted(m, currentRound, owed, fromCol, fromIns);
            }
        }

        uint256 payAmount = liquid >= pot ? pot : liquid;
        if (payAmount < pot) {
            emit RoundUnderfunded(currentRound, pot - payAmount);
        }
        _settle(payAmount);
    }

    function _settle(uint256 payAmount) internal {
        address recipient = members[currentRound];
        emit PaidOut(recipient, currentRound, payAmount);

        if (currentRound + 1 == members.length) {
            state = State.Completed;
            for (uint256 i = 0; i < members.length; i++) {
                if (!hasDefaulted[members[i]]) {
                    reputation.recordCompletion(members[i]);
                }
            }
            emit Completed();
        } else {
            currentRound += 1;
            roundDeadline = block.timestamp + roundDuration;
        }
        token.safeTransfer(recipient, payAmount);
    }

    function withdrawCollateral() external inState(State.Completed) nonReentrant {
        uint256 amount = collateral[msg.sender];
        if (amount == 0) revert NoCollateral();
        collateral[msg.sender] = 0;
        emit CollateralWithdrawn(msg.sender, amount);
        token.safeTransfer(msg.sender, amount);
    }
}
