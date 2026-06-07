// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title DelegationManager
/// @notice UNAUDITED testnet-only ERC-7710-style delegation contract for FelloPilot.
/// @notice NOT for production. NO third-party security review. Sepolia (chainId 11155111) only.
/// @notice Provides two paths:
///         - attestIntent(intent, signature): records an EIP-712-signed DelegationIntent
///           on-chain WITHOUT moving tokens. Matches the FelloPilot attestation
///           semantics that previously used a 0-value self-tx with ABI-encoded
///           calldata. Used by the demo flow.
///         - redeemDelegation(intent, token, amount, recipient, signature):
///           verifies the signature, enforces spendingCap + tokenAllowlist + expiry,
///           pulls ERC-20 from approver via transferFrom, and tracks consumedAmount.
///           Requires the approver to have set an ERC-20 allowance for this contract.
contract DelegationManager {
    error InvalidSignature();
    error DelegationExpired();
    error DelegationRevokedError();
    error TokenNotAllowed(address token);
    error SpendingCapExceeded(uint256 requested, uint256 remaining);
    error UnauthorizedRevoke();
    error TransferFailed();
    error ZeroAmount();

    event DelegationAttested(
        bytes32 indexed intentHash,
        address indexed approver,
        address indexed redeemer,
        bytes32 proposalId
    );

    event DelegationRedeemed(
        bytes32 indexed intentHash,
        address indexed approver,
        address indexed redeemer,
        address token,
        address recipient,
        uint256 amount,
        uint256 newConsumed
    );

    event DelegationRevoked(
        bytes32 indexed intentHash,
        address indexed approver
    );

    struct DelegationIntent {
        address approver;
        string action;
        address[] tokenAllowlist;
        uint256 spendingCap;
        uint64 expiry;
        bytes32 proposalId;
    }

    bytes32 public constant EIP712_DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId)"
    );

    bytes32 public constant INTENT_TYPEHASH = keccak256(
        "DelegationIntent(address approver,string action,address[] tokenAllowlist,uint256 spendingCap,uint64 expiry,bytes32 proposalId)"
    );

    string public constant DOMAIN_NAME = "FelloPilot Delegation Intent";
    string public constant DOMAIN_VERSION = "1";

    bytes32 public immutable DOMAIN_SEPARATOR;

    mapping(bytes32 => uint256) public consumedAmount;
    mapping(bytes32 => bool) public revoked;
    mapping(bytes32 => bool) public attested;

    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH,
                keccak256(bytes(DOMAIN_NAME)),
                keccak256(bytes(DOMAIN_VERSION)),
                block.chainid
            )
        );
    }

    function hashIntent(DelegationIntent calldata intent) public view returns (bytes32) {
        bytes32 structHash = keccak256(
            abi.encode(
                INTENT_TYPEHASH,
                intent.approver,
                keccak256(bytes(intent.action)),
                keccak256(abi.encodePacked(intent.tokenAllowlist)),
                intent.spendingCap,
                intent.expiry,
                intent.proposalId
            )
        );
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash));
    }

    function remainingCap(bytes32 intentHash, uint256 fullCap) external view returns (uint256) {
        uint256 consumed = consumedAmount[intentHash];
        if (consumed >= fullCap) return 0;
        return fullCap - consumed;
    }

    function attestIntent(
        DelegationIntent calldata intent,
        bytes calldata signature
    ) external returns (bytes32 intentHash) {
        intentHash = hashIntent(intent);
        if (revoked[intentHash]) revert DelegationRevokedError();
        address recovered = _recover(intentHash, signature);
        if (recovered != intent.approver) revert InvalidSignature();
        attested[intentHash] = true;
        emit DelegationAttested(intentHash, intent.approver, msg.sender, intent.proposalId);
    }

    function redeemDelegation(
        DelegationIntent calldata intent,
        address token,
        uint256 amount,
        address recipient,
        bytes calldata signature
    ) external returns (bytes32 intentHash) {
        if (amount == 0) revert ZeroAmount();
        intentHash = hashIntent(intent);

        if (revoked[intentHash]) revert DelegationRevokedError();
        if (block.timestamp > intent.expiry) revert DelegationExpired();

        address recovered = _recover(intentHash, signature);
        if (recovered != intent.approver) revert InvalidSignature();

        bool allowed = false;
        uint256 listLen = intent.tokenAllowlist.length;
        for (uint256 i = 0; i < listLen; i++) {
            if (intent.tokenAllowlist[i] == token) {
                allowed = true;
                break;
            }
        }
        if (!allowed) revert TokenNotAllowed(token);

        uint256 current = consumedAmount[intentHash];
        uint256 remaining = current >= intent.spendingCap ? 0 : intent.spendingCap - current;
        if (amount > remaining) revert SpendingCapExceeded(amount, remaining);

        uint256 newConsumed = current + amount;
        consumedAmount[intentHash] = newConsumed;
        attested[intentHash] = true;

        bool ok = IERC20(token).transferFrom(intent.approver, recipient, amount);
        if (!ok) revert TransferFailed();

        emit DelegationRedeemed(
            intentHash, intent.approver, msg.sender, token, recipient, amount, newConsumed
        );
    }

    function revoke(DelegationIntent calldata intent) external {
        if (msg.sender != intent.approver) revert UnauthorizedRevoke();
        bytes32 intentHash = hashIntent(intent);
        revoked[intentHash] = true;
        emit DelegationRevoked(intentHash, intent.approver);
    }

    function _recover(bytes32 messageHash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        return ecrecover(messageHash, v, r, s);
    }
}
