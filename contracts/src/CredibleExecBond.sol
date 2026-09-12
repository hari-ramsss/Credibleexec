// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable2Step.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Agent collateral custody. The authorized offchain verifier is trusted.
contract CredibleExecBond is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;
    enum Status { CREATED, FUNDED, ACTIVE, FULFILLED, FAILED, EXPIRED, CANCELLED }
    struct Terms {
        address agent;
        address user;
        address principalToken;
        address targetToken;
        uint256 principalAmount;
        uint256 maxSpend;
        uint256 minOutput;
        address recipient;
        uint256 deadline;
        uint256 bondAmount;
        bytes32 mandateHash;
    }
    struct Commitment { Terms terms; Status status; bytes32 commitmentHash; }
    IERC20 public immutable bondToken;
    address public settlementAuthority;
    uint256 public totalLocked;
    mapping(bytes32 => Commitment) private commitments;
    mapping(bytes32 => bool) public exists;
    event CommitmentCreated(bytes32 indexed id, address indexed agent, bytes32 mandateHash);
    event BondDeposited(bytes32 indexed id, address indexed agent, uint256 amount);
    event CommitmentActivated(bytes32 indexed id);
    event CommitmentFulfilled(bytes32 indexed id, bytes32 evidenceHash);
    event CommitmentFailed(bytes32 indexed id, bytes32 evidenceHash);
    event CommitmentCancelled(bytes32 indexed id);
    event ExternalFailureResolved(bytes32 indexed id, bytes32 evidenceHash);
    event BondReleased(bytes32 indexed id, address indexed recipient, uint256 amount);
    event BondSlashed(bytes32 indexed id, address indexed recipient, uint256 amount);
    event SettlementAuthorityChanged(address indexed authority);
    error InvalidTerms();
    error InvalidState();
    error Unauthorized();
    error UnknownCommitment();

    constructor(address token, address authority, address admin) Ownable(admin) {
        if (token == address(0) || authority == address(0)) revert InvalidTerms();
        bondToken = IERC20(token);
        settlementAuthority = authority;
    }
    modifier onlySettlement() {
        if (msg.sender != settlementAuthority) revert Unauthorized();
        _;
    }
    function setSettlementAuthority(address authority) external onlyOwner {
        if (authority == address(0)) revert InvalidTerms();
        settlementAuthority = authority;
        emit SettlementAuthorityChanged(authority);
    }
    function getCommitment(bytes32 id) external view returns (Commitment memory) {
        if (!exists[id]) revert UnknownCommitment();
        return commitments[id];
    }
    function createCommitment(bytes32 id, Terms calldata t) external {
        if (msg.sender != t.agent) revert Unauthorized();
        if (id == bytes32(0) || exists[id] || t.agent == address(0) || t.user == address(0)
            || t.agent == t.user || t.principalToken == address(0) || t.targetToken == address(0)
            || t.principalToken == t.targetToken || t.recipient == address(0)
            || t.principalAmount == 0 || t.maxSpend < t.principalAmount || t.minOutput == 0
            || t.bondAmount == 0 || t.deadline <= block.timestamp || t.mandateHash == bytes32(0)) revert InvalidTerms();
        exists[id] = true;
        commitments[id] = Commitment(t, Status.CREATED, keccak256(abi.encode(block.chainid, address(this), id, t)));
        emit CommitmentCreated(id, t.agent, t.mandateHash);
    }
    function depositBond(bytes32 id) external nonReentrant {
        Commitment storage c = _at(id, Status.CREATED);
        if (msg.sender != c.terms.agent) revert Unauthorized();
        if (block.timestamp >= c.terms.deadline) revert InvalidState();
        uint256 beforeBalance = bondToken.balanceOf(address(this));
        c.status = Status.FUNDED;
        totalLocked += c.terms.bondAmount;
        bondToken.safeTransferFrom(msg.sender, address(this), c.terms.bondAmount);
        if (bondToken.balanceOf(address(this)) - beforeBalance != c.terms.bondAmount) revert InvalidTerms();
        emit BondDeposited(id, msg.sender, c.terms.bondAmount);
    }
    function activateCommitment(bytes32 id) external onlySettlement {
        Commitment storage c = _at(id, Status.FUNDED);
        if (block.timestamp >= c.terms.deadline) revert InvalidState();
        c.status = Status.ACTIVE;
        emit CommitmentActivated(id);
    }
    function settleSuccess(bytes32 id, bytes32 evidenceHash) external onlySettlement nonReentrant {
        Commitment storage c = _at(id, Status.ACTIVE);
        if (evidenceHash == bytes32(0)) revert InvalidTerms();
        c.status = Status.FULFILLED;
        emit CommitmentFulfilled(id, evidenceHash);
        _release(id, c, false);
    }
    function settleFailure(bytes32 id, bytes32 evidenceHash) external onlySettlement nonReentrant {
        Commitment storage c = _at(id, Status.ACTIVE);
        if (evidenceHash == bytes32(0)) revert InvalidTerms();
        c.status = Status.FAILED;
        emit CommitmentFailed(id, evidenceHash);
        _release(id, c, true);
    }
    function cancelCommitment(bytes32 id) external nonReentrant {
        if (!exists[id]) revert UnknownCommitment();
        Commitment storage c = commitments[id];
        if (msg.sender != c.terms.agent && msg.sender != c.terms.user && msg.sender != settlementAuthority) revert Unauthorized();
        if (c.status != Status.CREATED && c.status != Status.FUNDED) revert InvalidState();
        bool funded = c.status == Status.FUNDED;
        c.status = Status.CANCELLED;
        emit CommitmentCancelled(id);
        if (funded) _release(id, c, false);
    }
    /// @dev Requires a human-reviewed external-failure decision; elapsed time alone never slashes.
    function resolveExternalFailure(bytes32 id, bytes32 evidenceHash) external onlySettlement nonReentrant {
        Commitment storage c = _at(id, Status.ACTIVE);
        if (block.timestamp <= c.terms.deadline || evidenceHash == bytes32(0)) revert InvalidState();
        c.status = Status.EXPIRED;
        emit ExternalFailureResolved(id, evidenceHash);
        _release(id, c, false);
    }
    function _at(bytes32 id, Status status) private view returns (Commitment storage c) {
        if (!exists[id]) revert UnknownCommitment();
        c = commitments[id];
        if (c.status != status) revert InvalidState();
    }
    function _release(bytes32 id, Commitment storage c, bool slash) private {
        uint256 amount = c.terms.bondAmount;
        totalLocked -= amount;
        address recipient = slash ? c.terms.user : c.terms.agent;
        if (slash) emit BondSlashed(id, recipient, amount);
        else emit BondReleased(id, recipient, amount);
        bondToken.safeTransfer(recipient, amount);
    }
}
