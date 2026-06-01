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
/// @dev Assumes a well-behaved ERC20: no transfer fee, no rebasing, no transfer callbacks. The
///      settlement accounting credits insurance `cover` proceeds at face value, so a fee-on-transfer
///      token would over-count `liquid`. MXNB and standard stablecoins satisfy this.
contract TandaCircle is ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum State {
        Forming,
        Bidding,
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
    uint256 public immutable bidDuration;

    State public state;
    address[] public members;
    mapping(address => bool) public isMember;
    mapping(address => uint256) public collateral;
    mapping(address => bool) public hasDefaulted;
    mapping(address => uint256) public memberScore; // AI-clamped score captured at join
    mapping(address => uint256) public bidFee; // auction bid (0 if not bid)
    uint256 public bidDeadline;
    uint256[] public payoutOrder; // slot -> member index; identity for the no-auction path

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
    error ZeroBid();
    error AlreadyBid();
    error BidNotClosed();

    event Joined(address indexed member, uint256 index, uint256 collateral, uint256 premium);
    event Started(uint256 timestamp, uint256 roundDeadline);
    event BiddingOpened(uint256 bidDeadline);
    event BidPlaced(address indexed member, uint256 fee);
    event BiddingFinalized(uint256[] payoutOrder);
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
        uint256 roundDuration_,
        uint256 bidDuration_
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
        bidDuration = bidDuration_;
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
        memberScore[msg.sender] = adjustedScore;
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
        _initIdentityOrder();
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit Started(block.timestamp, roundDeadline);
    }

    function _initIdentityOrder() internal {
        for (uint256 i = 0; i < members.length; i++) {
            payoutOrder.push(i);
        }
    }

    /// @notice Organizer opens the bidding phase (alternative to start()).
    function openBidding() external inState(State.Forming) {
        if (msg.sender != organizer) revert NotOrganizer();
        if (members.length != maxMembers) revert NotFull();
        state = State.Bidding;
        bidDeadline = block.timestamp + bidDuration;
        emit BiddingOpened(bidDeadline);
    }

    /// @notice Member bids a fee for an earlier payout slot. The fee funds the insurance pool
    ///         (it never enters the pot or collateral). One bid per member; fee must be > 0.
    function bid(uint256 fee) external inState(State.Bidding) nonReentrant {
        if (!isMember[msg.sender]) revert NotMember();
        if (fee == 0) revert ZeroBid();
        if (bidFee[msg.sender] != 0) revert AlreadyBid();
        bidFee[msg.sender] = fee;
        token.safeTransferFrom(msg.sender, address(this), fee);
        token.safeTransfer(address(insurancePool), fee);
        insurancePool.notifyPremium(fee);
        emit BidPlaced(msg.sender, fee);
    }

    /// @notice Organizer finalizes the auction: assign payout slots greedily by descending fee,
    ///         constrained by each member's AI-allowed earliest slot, then go Active.
    function finalizeBidding() external inState(State.Bidding) {
        if (msg.sender != organizer) revert NotOrganizer();
        uint256 n = members.length;

        uint256[] memory order = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            order[i] = i;
        }
        for (uint256 i = 0; i < n; i++) {
            uint256 best = i;
            for (uint256 j = i + 1; j < n; j++) {
                uint256 fj = bidFee[members[order[j]]];
                uint256 fb = bidFee[members[order[best]]];
                if (fj > fb || (fj == fb && order[j] < order[best])) {
                    best = j;
                }
            }
            (order[i], order[best]) = (order[best], order[i]);
        }

        uint256 SENTINEL = type(uint256).max;
        uint256[] memory slotToMember = new uint256[](n);
        for (uint256 s = 0; s < n; s++) {
            slotToMember[s] = SENTINEL;
        }
        for (uint256 k = 0; k < n; k++) {
            uint256 mIdx = order[k];
            uint256 floor = underwriter.earliestSlot(memberScore[members[mIdx]], n);
            for (uint256 s = floor; s < n; s++) {
                if (slotToMember[s] == SENTINEL) {
                    slotToMember[s] = mIdx;
                    break;
                }
            }
        }
        for (uint256 k = 0; k < n; k++) {
            uint256 mIdx = order[k];
            bool placed = false;
            for (uint256 s = 0; s < n; s++) {
                if (slotToMember[s] == mIdx) {
                    placed = true;
                    break;
                }
            }
            if (placed) continue;
            for (uint256 s = 0; s < n; s++) {
                if (slotToMember[s] == SENTINEL) {
                    slotToMember[s] = mIdx;
                    break;
                }
            }
        }

        for (uint256 s = 0; s < n; s++) {
            payoutOrder.push(slotToMember[s]);
        }
        state = State.Active;
        roundDeadline = block.timestamp + roundDuration;
        emit BiddingFinalized(payoutOrder);
        emit Started(block.timestamp, roundDeadline);
    }

    /// @notice Helper: the member index scheduled to receive the pot in slot `s`.
    function payoutOrderAt(uint256 s) external view returns (uint256) {
        return payoutOrder[s];
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
        address recipient = members[payoutOrder[currentRound]];
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
