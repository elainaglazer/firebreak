// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IFirebreakAuthTarget {
    function recordAuthResult(bytes32 attemptId, bytes32 requestHash, bytes32 actionDigest, bool approved) external;
}

/// @notice Narrow receiver used by the local simulated authority and designed
///         to match a CRE report receiver. The forwarder and protocol domain
///         are immutable; the vault can be bound once by the deployer.
/// @dev The local demo uses an EOA as the simulated forwarder. A live deployment
///      must use the official CRE forwarder and verify its current receiver rules.
contract CREAuthGateway {
    bytes32 public constant PROTOCOL_DOMAIN = keccak256("FIREBREAK_PIN_AUTH_V1");
    address public immutable forwarder;
    address private binder;
    IFirebreakAuthTarget public vault;

    error Unauthorized();
    error InvalidReport();

    event VaultBound(address indexed vault);
    event ReportForwarded(bytes32 indexed attemptId, bool approved);

    constructor(address forwarder_) {
        if (forwarder_ == address(0)) revert Unauthorized();
        forwarder = forwarder_;
        binder = msg.sender;
    }

    function bindVault(IFirebreakAuthTarget vault_) external {
        if (msg.sender != binder || address(vault) != address(0) || address(vault_) == address(0)) revert Unauthorized();
        vault = vault_;
        binder = address(0);
        emit VaultBound(address(vault_));
    }

    function onReport(bytes calldata, bytes calldata report) external {
        if (msg.sender != forwarder || address(vault) == address(0)) revert Unauthorized();
        (bytes32 domain, bytes32 attemptId, bytes32 requestHash, bytes32 actionDigest, bool approved) =
            abi.decode(report, (bytes32, bytes32, bytes32, bytes32, bool));
        if (domain != PROTOCOL_DOMAIN || attemptId == bytes32(0) || requestHash == bytes32(0) || actionDigest == bytes32(0)) {
            revert InvalidReport();
        }
        vault.recordAuthResult(attemptId, requestHash, actionDigest, approved);
        emit ReportForwarded(attemptId, approved);
    }
}
