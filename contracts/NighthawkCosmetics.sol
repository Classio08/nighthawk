// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * NIGHTHAWK cosmetics: an ERC-1155 where each token id is ONE in-game cosmetic (see src/economy/nft.js COSMETIC_TOKENS).
 * Owning a token unlocks a skin. It carries no gameplay power, no yield, no rewards and no promise of value.
 *
 * Deliberately small and self-contained (no imports) so it is easy to read and audit:
 *  - only the owner can mint, and only up to a per-id supply cap that can be set once and never raised
 *  - the contract holds no ETH and cannot receive any (no payable functions, no receive/fallback)
 *  - ERC-2981 royalty info is advertised (marketplaces may or may not honour it)
 *  - two-step ownership transfer; the owner can renounce to freeze the collection
 *
 * STATUS: compiled with solc, NOT audited, NOT deployed. Test networks only until an independent review and the licence in docs/ECONOMY.md exist.
 */
interface IERC1155Receiver { function onERC1155Received(address, address, uint256, uint256, bytes calldata) external returns (bytes4); function onERC1155BatchReceived(address, address, uint256[] calldata, uint256[] calldata, bytes calldata) external returns (bytes4); }

contract NighthawkCosmetics {
    event TransferSingle(address indexed operator, address indexed from, address indexed to, uint256 id, uint256 value);
    event TransferBatch(address indexed operator, address indexed from, address indexed to, uint256[] ids, uint256[] values);
    event ApprovalForAll(address indexed account, address indexed operator, bool approved);
    event URI(string value, uint256 indexed id);
    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event SupplyCapSet(uint256 indexed id, uint256 cap);

    error NotOwner(); error ZeroAddress(); error LengthMismatch(); error NotAuthorised(); error InsufficientBalance(); error CapNotSet(); error CapAlreadySet(); error CapExceeded(); error BadReceiver(); error RoyaltyTooHigh();

    string public name = "NIGHTHAWK Cosmetics";
    string private _baseUri;
    address public owner; address public pendingOwner;
    address public royaltyReceiver; uint96 public royaltyBps;               // at most 10%
    mapping(uint256 => mapping(address => uint256)) private _bal;
    mapping(address => mapping(address => bool)) private _approved;
    mapping(uint256 => uint256) public supplyCap; mapping(uint256 => uint256) public totalSupply;

    constructor(string memory baseUri_, address royaltyReceiver_, uint96 royaltyBps_) {
        if (royaltyBps_ > 1000) revert RoyaltyTooHigh();
        owner = msg.sender; _baseUri = baseUri_; royaltyReceiver = royaltyReceiver_; royaltyBps = royaltyBps_;
        emit OwnershipTransferred(address(0), msg.sender);
    }
    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }

    // ---- owner ----
    function setSupplyCap(uint256 id, uint256 cap) external onlyOwner { if (supplyCap[id] != 0) revert CapAlreadySet(); supplyCap[id] = cap; emit SupplyCapSet(id, cap); }
    function mint(address to, uint256 id, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress(); uint256 cap = supplyCap[id]; if (cap == 0) revert CapNotSet();
        if (totalSupply[id] + amount > cap) revert CapExceeded();
        totalSupply[id] += amount; _bal[id][to] += amount; emit TransferSingle(msg.sender, address(0), to, id, amount); _checkReceiver(msg.sender, address(0), to, id, amount);
    }
    function transferOwnership(address next) external onlyOwner { pendingOwner = next; emit OwnershipTransferStarted(owner, next); }
    function acceptOwnership() external { if (msg.sender != pendingOwner) revert NotOwner(); emit OwnershipTransferred(owner, msg.sender); owner = msg.sender; pendingOwner = address(0); }
    function renounceOwnership() external onlyOwner { emit OwnershipTransferred(owner, address(0)); owner = address(0); }

    // ---- ERC-1155 ----
    function uri(uint256 id) external view returns (string memory) { return string(abi.encodePacked(_baseUri, _toString(id), ".json")); }
    function balanceOf(address account, uint256 id) public view returns (uint256) { if (account == address(0)) revert ZeroAddress(); return _bal[id][account]; }
    function balanceOfBatch(address[] calldata accounts, uint256[] calldata ids) external view returns (uint256[] memory out) {
        if (accounts.length != ids.length) revert LengthMismatch(); out = new uint256[](ids.length); for (uint256 i; i < ids.length; ++i) out[i] = balanceOf(accounts[i], ids[i]);
    }
    function setApprovalForAll(address operator, bool ok) external { _approved[msg.sender][operator] = ok; emit ApprovalForAll(msg.sender, operator, ok); }
    function isApprovedForAll(address account, address operator) public view returns (bool) { return _approved[account][operator]; }
    function safeTransferFrom(address from, address to, uint256 id, uint256 amount, bytes calldata) external {
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) revert NotAuthorised(); if (to == address(0)) revert ZeroAddress();
        uint256 b = _bal[id][from]; if (b < amount) revert InsufficientBalance(); unchecked { _bal[id][from] = b - amount; } _bal[id][to] += amount;
        emit TransferSingle(msg.sender, from, to, id, amount); _checkReceiver(msg.sender, from, to, id, amount);
    }
    function safeBatchTransferFrom(address from, address to, uint256[] calldata ids, uint256[] calldata amounts, bytes calldata data) external {
        if (from != msg.sender && !isApprovedForAll(from, msg.sender)) revert NotAuthorised(); if (to == address(0)) revert ZeroAddress(); if (ids.length != amounts.length) revert LengthMismatch();
        for (uint256 i; i < ids.length; ++i) { uint256 b = _bal[ids[i]][from]; if (b < amounts[i]) revert InsufficientBalance(); unchecked { _bal[ids[i]][from] = b - amounts[i]; } _bal[ids[i]][to] += amounts[i]; }
        emit TransferBatch(msg.sender, from, to, ids, amounts);
        if (to.code.length > 0) { try IERC1155Receiver(to).onERC1155BatchReceived(msg.sender, from, ids, amounts, data) returns (bytes4 r) { if (r != IERC1155Receiver.onERC1155BatchReceived.selector) revert BadReceiver(); } catch { revert BadReceiver(); } }
    }
    function _checkReceiver(address operator, address from, address to, uint256 id, uint256 amount) private {
        if (to.code.length > 0) { try IERC1155Receiver(to).onERC1155Received(operator, from, id, amount, "") returns (bytes4 r) { if (r != IERC1155Receiver.onERC1155Received.selector) revert BadReceiver(); } catch { revert BadReceiver(); } }
    }

    // ---- ERC-2981 + ERC-165 ----
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) { return (royaltyReceiver, (salePrice * royaltyBps) / 10000); }
    function supportsInterface(bytes4 i) external pure returns (bool) { return i == 0x01ffc9a7 || i == 0xd9b67a26 || i == 0x0e89341c || i == 0x2a55205a; }

    function _toString(uint256 v) private pure returns (string memory) {
        if (v == 0) return "0"; uint256 t = v; uint256 n; while (t != 0) { ++n; t /= 10; } bytes memory b = new bytes(n); while (v != 0) { b[--n] = bytes1(uint8(48 + v % 10)); v /= 10; } return string(b);
    }
}
