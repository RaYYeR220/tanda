// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice Test-only mock of Bitso's MXN stablecoin (MXNB). Freely mintable.
contract MockMXNB is ERC20 {
    constructor() ERC20("Mock MXN Bitso", "MXNB") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @dev Open mint for testnet/demo. NOT for production.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
