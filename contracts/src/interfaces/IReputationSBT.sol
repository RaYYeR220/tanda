// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Write surface used by TandaCircle instances to record member behavior.
interface IReputationSBT {
    function recordOnTime(address member) external;
    function recordLate(address member) external;
    function recordDefault(address member) external;
    function recordCompletion(address member) external;
}
