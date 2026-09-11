// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title FirebreakVault
/// @notice Hackathon prototype: a single-asset reserve with two-factor payments,
///         rate-limited backup authorization, delayed large transfers, and
///         independent guardian recovery.
/// @dev Not audited. Never use with real assets.
contract FirebreakVault is EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum TransferMode { IMMEDIATE, DELAYED }
    enum AttemptStatus { NONE, RESERVED, APPROVED, REJECTED, EXECUTED }
    enum PendingStatus { NONE, ACTIVE, EXECUTED, CANCELLED }

    struct Transfer {
        uint256 epoch;
        uint256 nonce;
        address recipient;
        uint256 amount;
        uint8 mode;
        uint256 deadline;
    }

    struct Attempt {
        AttemptStatus status;
        bytes32 requestHash;
        bytes32 actionDigest;
        Transfer action;
    }

    struct PendingTransfer {
        PendingStatus status;
        address recipient;
        uint256 amount;
        uint256 eta;
        uint256 epoch;
    }

    struct Recovery {
        bool active;
        uint256 nonce;
        address newSeedSigner;
        address newDeviceSigner;
        uint256 readyAt;
    }

    bytes32 public constant TRANSFER_TYPEHASH = keccak256(
        "Transfer(uint256 epoch,uint256 nonce,address recipient,uint256 amount,uint8 mode,uint256 deadline)"
    );
    bytes32 public constant RESERVE_TYPEHASH = keccak256(
        "ReserveAttempt(uint256 epoch,uint256 reservationNonce,bytes32 actionDigest,bytes32 requestHash,uint256 deadline)"
    );
    bytes32 public constant CANCEL_TYPEHASH = keccak256(
        "CancelTransfer(uint256 epoch,bytes32 pendingId,uint256 deadline)"
    );
    bytes32 public constant RECOVERY_TYPEHASH = keccak256(
        "Recovery(uint256 epoch,uint256 recoveryNonce,address newSeedSigner,address newDeviceSigner,uint256 deadline)"
    );
    bytes32 public constant CANCEL_RECOVERY_TYPEHASH = keccak256(
        "CancelRecovery(uint256 epoch,uint256 recoveryNonce,uint256 deadline)"
    );

    IERC20 public immutable asset;
    address public immutable authGateway;
    address public immutable guardian1;
    address public immutable guardian2;
    address public immutable guardian3;
    uint256 public immutable capacity;
    uint256 public immutable refillPeriod;
    uint256 public immutable transferDelay;
    uint256 public immutable recoveryDelay;
    uint256 public immutable pinAttemptCap;
    uint256 public immutable pinPeriod;

    address public seedSigner;
    address public deviceSigner;
    uint256 public epoch;
    bool public frozen;
    bool public pinEnabled = true;
    uint256 public storedCredit;
    uint256 public creditUpdatedAt;
    uint256 public reservedTotal;
    uint256 public nextPendingSequence;
    uint256 public recoveryNonce;
    Recovery public recovery;

    mapping(uint256 => mapping(uint256 => bool)) public usedTransferNonces;
    mapping(uint256 => mapping(uint256 => bool)) public usedReservationNonces;
    mapping(uint256 => uint256) public attemptsByPeriod;
    mapping(bytes32 => Attempt) private attempts;
    mapping(bytes32 => PendingTransfer) private pendingTransfers;
    bytes32[] private activePendingIds;

    error Unauthorized();
    error InvalidInput();
    error Expired();
    error Frozen();
    error NonceUsed();
    error InsufficientCredit(uint256 available, uint256 requested);
    error InsufficientUnreservedBalance(uint256 available, uint256 requested);
    error AttemptBudgetExhausted(uint256 period);
    error InvalidState();
    error TooManyPending();
    error TooEarly(uint256 readyAt);

    event TransferExecuted(bytes32 indexed actionDigest, address indexed recipient, uint256 amount, uint8 lane);
    event TransferQueued(bytes32 indexed pendingId, bytes32 indexed actionDigest, address recipient, uint256 amount, uint256 eta);
    event TransferCancelled(bytes32 indexed pendingId);
    event AttemptReserved(bytes32 indexed attemptId, bytes32 indexed actionDigest, bytes32 requestHash, uint256 period, uint256 used);
    event AttemptResolved(bytes32 indexed attemptId, bool approved);
    event RecoveryStarted(uint256 indexed nonce, uint256 indexed previousEpoch, uint256 newEpoch, address newSeedSigner, address newDeviceSigner, uint256 readyAt);
    event RecoveryCompleted(uint256 indexed nonce, uint256 newEpoch, address seedSigner, address deviceSigner);
    event RecoveryCancelled(uint256 indexed nonce, uint256 newEpoch);

    constructor(
        IERC20 asset_,
        address seedSigner_,
        address deviceSigner_,
        address authGateway_,
        address[3] memory guardians_,
        uint256 capacity_,
        uint256 refillPeriod_,
        uint256 transferDelay_,
        uint256 recoveryDelay_,
        uint256 pinAttemptCap_,
        uint256 pinPeriod_
    ) EIP712("FirebreakVault", "1") {
        if (
            address(asset_) == address(0) || seedSigner_ == address(0) || deviceSigner_ == address(0)
                || authGateway_ == address(0) || guardians_[0] == address(0) || guardians_[1] == address(0)
                || guardians_[2] == address(0) || seedSigner_ == deviceSigner_ || guardians_[0] == guardians_[1]
                || guardians_[0] == guardians_[2] || guardians_[1] == guardians_[2] || capacity_ == 0
                || refillPeriod_ == 0 || transferDelay_ == 0 || recoveryDelay_ == 0 || pinAttemptCap_ == 0
                || pinPeriod_ == 0
        ) revert InvalidInput();
        asset = asset_;
        seedSigner = seedSigner_;
        deviceSigner = deviceSigner_;
        authGateway = authGateway_;
        guardian1 = guardians_[0];
        guardian2 = guardians_[1];
        guardian3 = guardians_[2];
        capacity = capacity_;
        refillPeriod = refillPeriod_;
        transferDelay = transferDelay_;
        recoveryDelay = recoveryDelay_;
        pinAttemptCap = pinAttemptCap_;
        pinPeriod = pinPeriod_;
        storedCredit = capacity_;
        creditUpdatedAt = block.timestamp;
    }

    function transferDigest(Transfer calldata action) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            TRANSFER_TYPEHASH,
            action.epoch,
            action.nonce,
            action.recipient,
            action.amount,
            action.mode,
            action.deadline
        )));
    }

    function reserveDigest(
        uint256 epoch_, uint256 reservationNonce, bytes32 actionDigest, bytes32 requestHash, uint256 deadline
    ) public view returns (bytes32) {
        return _hashTypedDataV4(keccak256(abi.encode(
            RESERVE_TYPEHASH, epoch_, reservationNonce, actionDigest, requestHash, deadline
        )));
    }

    function availableCredit() public view returns (uint256) {
        if (storedCredit >= capacity) return capacity;
        uint256 elapsed = block.timestamp - creditUpdatedAt;
        if (elapsed >= refillPeriod) return capacity;
        uint256 refill = (elapsed * capacity) / refillPeriod;
        uint256 updated = storedCredit + refill;
        return updated > capacity ? capacity : updated;
    }

    function currentPinPeriod() public view returns (uint256) {
        return block.timestamp / pinPeriod;
    }

    function attemptsRemaining() external view returns (uint256) {
        uint256 used = attemptsByPeriod[currentPinPeriod()];
        return used >= pinAttemptCap ? 0 : pinAttemptCap - used;
    }

    function executeDevice(Transfer calldata action, bytes calldata seedSignature, bytes calldata deviceSignature)
        external nonReentrant returns (bytes32 id)
    {
        bytes32 digest = transferDigest(action);
        _requireSigner(digest, seedSignature, seedSigner);
        _requireSigner(digest, deviceSignature, deviceSigner);
        return _executeAuthorized(action, digest, 0);
    }

    function reserveAttempt(
        Transfer calldata action,
        uint256 reservationNonce,
        bytes32 requestHash,
        uint256 reservationDeadline,
        bytes calldata seedSignature
    ) external returns (bytes32 attemptId) {
        if (frozen) revert Frozen();
        if (!pinEnabled) revert InvalidState();
        if (action.epoch != epoch || action.deadline < block.timestamp || reservationDeadline < block.timestamp) revert Expired();
        if (requestHash == bytes32(0)) revert InvalidInput();
        if (usedReservationNonces[epoch][reservationNonce]) revert NonceUsed();
        bytes32 actionHash = transferDigest(action);
        bytes32 digest = reserveDigest(epoch, reservationNonce, actionHash, requestHash, reservationDeadline);
        _requireSigner(digest, seedSignature, seedSigner);

        uint256 period = currentPinPeriod();
        uint256 used = attemptsByPeriod[period];
        if (used >= pinAttemptCap) revert AttemptBudgetExhausted(period);
        usedReservationNonces[epoch][reservationNonce] = true;
        attemptsByPeriod[period] = used + 1;
        attemptId = keccak256(abi.encode(address(this), epoch, reservationNonce));
        if (attempts[attemptId].status != AttemptStatus.NONE) revert NonceUsed();
        attempts[attemptId] = Attempt(AttemptStatus.RESERVED, requestHash, actionHash, action);
        emit AttemptReserved(attemptId, actionHash, requestHash, period, used + 1);
    }

    function recordAuthResult(bytes32 attemptId, bytes32 requestHash, bytes32 actionDigest, bool approved) external {
        if (msg.sender != authGateway) revert Unauthorized();
        Attempt storage attempt = attempts[attemptId];
        if (attempt.status != AttemptStatus.RESERVED) revert InvalidState();
        if (attempt.requestHash != requestHash || attempt.actionDigest != actionDigest) revert InvalidInput();
        if (attempt.action.epoch != epoch || attempt.action.deadline < block.timestamp || frozen) approved = false;
        attempt.status = approved ? AttemptStatus.APPROVED : AttemptStatus.REJECTED;
        emit AttemptResolved(attemptId, approved);
    }

    function executePin(bytes32 attemptId) external nonReentrant returns (bytes32 id) {
        Attempt storage attempt = attempts[attemptId];
        if (attempt.status != AttemptStatus.APPROVED) revert InvalidState();
        attempt.status = AttemptStatus.EXECUTED;
        Transfer memory action = attempt.action;
        return _executeAuthorized(action, attempt.actionDigest, 1);
    }

    function executeQueued(bytes32 pendingId) external nonReentrant {
        if (frozen) revert Frozen();
        PendingTransfer storage pending = pendingTransfers[pendingId];
        if (pending.status != PendingStatus.ACTIVE || pending.epoch != epoch) revert InvalidState();
        if (block.timestamp < pending.eta) revert TooEarly(pending.eta);
        pending.status = PendingStatus.EXECUTED;
        reservedTotal -= pending.amount;
        asset.safeTransfer(pending.recipient, pending.amount);
        emit TransferExecuted(pendingId, pending.recipient, pending.amount, 2);
    }

    function cancelQueued(bytes32 pendingId, uint256 deadline, bytes calldata deviceSignature) external {
        if (deadline < block.timestamp) revert Expired();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_TYPEHASH, epoch, pendingId, deadline)));
        _requireSigner(digest, deviceSignature, deviceSigner);
        PendingTransfer storage pending = pendingTransfers[pendingId];
        if (pending.status != PendingStatus.ACTIVE || pending.epoch != epoch) revert InvalidState();
        pending.status = PendingStatus.CANCELLED;
        reservedTotal -= pending.amount;
        emit TransferCancelled(pendingId);
    }

    function beginRecovery(
        uint256 nonce,
        address newSeedSigner,
        address newDeviceSigner,
        uint256 deadline,
        bytes[] calldata signatures
    ) external {
        if (recovery.active || nonce != recoveryNonce || deadline < block.timestamp) revert InvalidState();
        if (newSeedSigner == address(0) || newDeviceSigner == address(0) || newSeedSigner == newDeviceSigner) revert InvalidInput();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(
            RECOVERY_TYPEHASH, epoch, nonce, newSeedSigner, newDeviceSigner, deadline
        )));
        _requireGuardianQuorum(digest, signatures);
        uint256 oldEpoch = epoch;
        frozen = true;
        pinEnabled = false;
        epoch++;
        _invalidatePending();
        recovery = Recovery(true, nonce, newSeedSigner, newDeviceSigner, block.timestamp + recoveryDelay);
        emit RecoveryStarted(nonce, oldEpoch, epoch, newSeedSigner, newDeviceSigner, recovery.readyAt);
    }

    function completeRecovery() external {
        if (!recovery.active) revert InvalidState();
        if (block.timestamp < recovery.readyAt) revert TooEarly(recovery.readyAt);
        uint256 nonce = recovery.nonce;
        seedSigner = recovery.newSeedSigner;
        deviceSigner = recovery.newDeviceSigner;
        recoveryNonce++;
        epoch++;
        delete recovery;
        frozen = false;
        emit RecoveryCompleted(nonce, epoch, seedSigner, deviceSigner);
    }

    function cancelRecovery(uint256 nonce, uint256 deadline, bytes[] calldata signatures) external {
        if (!recovery.active || nonce != recovery.nonce || deadline < block.timestamp) revert InvalidState();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(CANCEL_RECOVERY_TYPEHASH, epoch, nonce, deadline)));
        _requireGuardianQuorum(digest, signatures);
        recoveryNonce++;
        epoch++;
        delete recovery;
        frozen = true;
        emit RecoveryCancelled(nonce, epoch);
    }

    function getAttempt(bytes32 attemptId) external view returns (Attempt memory) {
        return attempts[attemptId];
    }

    function getPending(bytes32 pendingId) external view returns (PendingTransfer memory) {
        return pendingTransfers[pendingId];
    }

    function activePending() external view returns (bytes32[] memory) {
        return activePendingIds;
    }

    function exposureState() external view returns (
        uint256 balance, uint256 credit, uint256 reserved, uint256 matured, uint256 executableWithBothFactors
    ) {
        balance = asset.balanceOf(address(this));
        credit = availableCredit();
        reserved = reservedTotal;
        for (uint256 i; i < activePendingIds.length; ++i) {
            PendingTransfer storage p = pendingTransfers[activePendingIds[i]];
            if (p.status == PendingStatus.ACTIVE && p.epoch == epoch && p.eta <= block.timestamp) matured += p.amount;
        }
        if (frozen) return (balance, credit, reserved, matured, 0);
        uint256 unreserved = balance > reserved ? balance - reserved : 0;
        uint256 fresh = credit < unreserved ? credit : unreserved;
        executableWithBothFactors = matured + fresh;
        if (executableWithBothFactors > balance) executableWithBothFactors = balance;
    }

    function _executeAuthorized(Transfer memory action, bytes32 digest, uint8 lane) internal returns (bytes32 id) {
        if (frozen) revert Frozen();
        if (action.epoch != epoch || action.deadline < block.timestamp) revert Expired();
        if (action.recipient == address(0) || action.recipient == address(this) || action.amount == 0 || action.mode > 1) revert InvalidInput();
        if (usedTransferNonces[epoch][action.nonce]) revert NonceUsed();
        usedTransferNonces[epoch][action.nonce] = true;

        uint256 balance = asset.balanceOf(address(this));
        uint256 unreserved = balance > reservedTotal ? balance - reservedTotal : 0;
        if (action.amount > unreserved) revert InsufficientUnreservedBalance(unreserved, action.amount);

        if (action.mode == uint8(TransferMode.IMMEDIATE)) {
            uint256 credit = _materializeCredit();
            if (action.amount > credit) revert InsufficientCredit(credit, action.amount);
            storedCredit = credit - action.amount;
            asset.safeTransfer(action.recipient, action.amount);
            emit TransferExecuted(digest, action.recipient, action.amount, lane);
            return digest;
        }

        if (_activePendingCount() >= 16) revert TooManyPending();
        id = keccak256(abi.encode(address(this), epoch, ++nextPendingSequence, digest));
        uint256 eta = block.timestamp + transferDelay;
        pendingTransfers[id] = PendingTransfer(PendingStatus.ACTIVE, action.recipient, action.amount, eta, epoch);
        activePendingIds.push(id);
        reservedTotal += action.amount;
        emit TransferQueued(id, digest, action.recipient, action.amount, eta);
    }

    function _materializeCredit() internal returns (uint256 credit) {
        credit = availableCredit();
        storedCredit = credit;
        creditUpdatedAt = block.timestamp;
    }

    function _activePendingCount() internal view returns (uint256 count) {
        for (uint256 i; i < activePendingIds.length; ++i) {
            if (pendingTransfers[activePendingIds[i]].status == PendingStatus.ACTIVE) ++count;
        }
    }

    function _invalidatePending() internal {
        for (uint256 i; i < activePendingIds.length; ++i) {
            PendingTransfer storage pending = pendingTransfers[activePendingIds[i]];
            if (pending.status == PendingStatus.ACTIVE) pending.status = PendingStatus.CANCELLED;
        }
        reservedTotal = 0;
        delete activePendingIds;
    }

    function _requireSigner(bytes32 digest, bytes calldata signature, address expected) internal pure {
        if (ECDSA.recover(digest, signature) != expected) revert Unauthorized();
    }

    function _isGuardian(address signer) internal view returns (bool) {
        return signer == guardian1 || signer == guardian2 || signer == guardian3;
    }

    function _requireGuardianQuorum(bytes32 digest, bytes[] calldata signatures) internal view {
        if (signatures.length < 2 || signatures.length > 3) revert Unauthorized();
        address first = ECDSA.recover(digest, signatures[0]);
        address second = ECDSA.recover(digest, signatures[1]);
        if (!_isGuardian(first) || !_isGuardian(second) || first == second) revert Unauthorized();
        if (signatures.length == 3) {
            address third = ECDSA.recover(digest, signatures[2]);
            if (!_isGuardian(third) || third == first || third == second) revert Unauthorized();
        }
    }
}
