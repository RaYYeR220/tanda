// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IReputationSBT} from "./interfaces/IReputationSBT.sol";

/// @notice Per-address cross-circle reputation as a soulbound (non-transferable) ERC-721.
/// @dev One token per member, tokenId = uint256(uint160(member)). Implements ERC-5192 `locked`.
contract ReputationSBT is ERC721, IReputationSBT {
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
    error Soulbound();

    event CircleAuthorized(address indexed circle, bool authorized);
    event ReputationUpdated(address indexed member);
    event Locked(uint256 tokenId); // ERC-5192

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    modifier onlyAuthorizedCircle() {
        if (!isAuthorizedCircle[msg.sender]) revert NotAuthorizedCircle();
        _;
    }

    constructor(address admin_) ERC721("Tanda Reputation", "TANREP") {
        admin = admin_;
    }

    function setCircleAuthorized(address circle, bool authorized) external onlyAdmin {
        isAuthorizedCircle[circle] = authorized;
        emit CircleAuthorized(circle, authorized);
    }

    event AdminTransferred(address indexed from, address indexed to);

    function transferAdmin(address newAdmin) external onlyAdmin {
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    /// @notice ERC-5192: all tokens are permanently locked.
    function locked(uint256 tokenId) external view returns (bool) {
        _requireOwned(tokenId);
        return true;
    }

    function _ensureMinted(address member) internal {
        uint256 tokenId = uint256(uint160(member));
        if (_ownerOf(tokenId) == address(0)) {
            _mint(member, tokenId);
            emit Locked(tokenId);
        }
    }

    function recordOnTime(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.onTime += 1;
        emit ReputationUpdated(member);
    }

    function recordLate(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.late += 1;
        emit ReputationUpdated(member);
    }

    function recordDefault(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        Reputation storage r = reputation[member];
        r.roundsParticipated += 1;
        r.defaults += 1;
        emit ReputationUpdated(member);
    }

    function recordCompletion(address member) external onlyAuthorizedCircle {
        _ensureMinted(member);
        reputation[member].circlesCompleted += 1;
        emit ReputationUpdated(member);
    }

    /// @dev Block all transfers (allow mint where `from == 0`). OZ v5 routes transfers through `_update`.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == 0xb45a3c0e || super.supportsInterface(interfaceId); // ERC-5192
    }
}
