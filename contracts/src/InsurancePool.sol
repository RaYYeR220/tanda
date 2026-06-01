// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice A shared MXNB buffer that absorbs default shortfalls beyond a defaulter's collateral.
///         Funded by per-join risk-priced premiums forwarded by authorized circles (plus an
///         optional protocol seed). "LP yield" = accumulated premiums net of claims.
contract InsurancePool {
    using SafeERC20 for IERC20;

    IERC20 public immutable token;
    address public admin;
    mapping(address => bool) public isAuthorizedCircle;

    uint256 public totalPremiums;
    uint256 public totalClaims;

    error NotAdmin();
    error NotAuthorizedCircle();
    error ZeroAddress();

    event CircleAuthorized(address indexed circle, bool authorized);
    event AdminTransferred(address indexed from, address indexed to);
    event PremiumReceived(address indexed circle, uint256 amount);
    event Claimed(address indexed circle, uint256 requested, uint256 covered);

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address token_, address admin_) {
        if (token_ == address(0) || admin_ == address(0)) revert ZeroAddress();
        token = IERC20(token_);
        admin = admin_;
    }

    function transferAdmin(address newAdmin) external onlyAdmin {
        if (newAdmin == address(0)) revert ZeroAddress();
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    function balance() external view returns (uint256) {
        return token.balanceOf(address(this));
    }

    /// @notice Record a premium that an authorized circle has just transferred in.
    function notifyPremium(uint256 amount) external onlyAuthorizedCircle {
        totalPremiums += amount;
        emit PremiumReceived(msg.sender, amount);
    }

    /// @notice Cover up to `amount` of a shortfall, sending covered tokens to the calling circle.
    /// @return covered The amount actually transferred (less than requested if underfunded).
    function cover(uint256 amount) external onlyAuthorizedCircle returns (uint256 covered) {
        uint256 bal = token.balanceOf(address(this));
        covered = amount > bal ? bal : amount;
        if (covered > 0) {
            totalClaims += covered;
            token.safeTransfer(msg.sender, covered);
        }
        emit Claimed(msg.sender, amount, covered);
    }
}
