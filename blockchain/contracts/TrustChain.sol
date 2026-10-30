// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title TrustChain
 * @notice Milestone-based charity escrow. Donations are locked in this contract and released to a
 *         campaign's fixed beneficiary only after the campaign's assigned verifier approves the
 *         evidence (IPFS CID + SHA-256 hash) submitted by the NGO for that milestone.
 */
contract TrustChain is AccessControl, ReentrancyGuard {
    // ---------------------------------------------------------------------
    // Roles & limits
    // ---------------------------------------------------------------------

    bytes32 public constant NGO_ROLE = keccak256("NGO_ROLE");
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");

    uint256 public constant MAX_MILESTONES = 20;
    uint256 public constant MAX_TITLE_LENGTH = 120;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 280;
    uint256 public constant MAX_REASON_LENGTH = 500;
    uint256 public constant MAX_CID_LENGTH = 128;

    // ---------------------------------------------------------------------
    // Data structures
    // ---------------------------------------------------------------------

    /// Pending = awaiting evidence, Submitted = PENDING_VERIFICATION.
    enum MilestoneStatus {
        Pending,
        Submitted,
        Approved,
        Rejected,
        Released
    }

    struct Campaign {
        uint256 id;
        address ngo;
        address payable beneficiary;
        address verifier;
        string title;
        string metadataCID;
        uint256 targetAmount;
        uint256 totalAllocated;
        uint256 totalDonated;
        uint256 totalReleased;
        uint64 deadline;
        uint64 createdAt;
        uint32 milestoneCount;
        bool active; // accepting donations: fully allocated and not suspended
        bool suspended; // set by admin
    }

    struct Milestone {
        uint256 id;
        string description;
        uint256 allocatedAmount;
        string evidenceCID;
        bytes32 evidenceHash;
        MilestoneStatus status;
        string rejectionReason;
        uint64 submittedAt;
        uint64 reviewedAt;
        uint64 releasedAt;
    }

    uint256 public campaignCount;
    mapping(uint256 => Campaign) private _campaigns;
    mapping(uint256 => mapping(uint256 => Milestone)) private _milestones;
    mapping(uint256 => mapping(address => uint256)) private _contributions;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event NGORegistered(address indexed account, address indexed admin);
    event NGORevoked(address indexed account, address indexed admin);
    event VerifierRegistered(address indexed account, address indexed admin);
    event VerifierRevoked(address indexed account, address indexed admin);

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed ngo,
        address indexed verifier,
        address beneficiary,
        uint256 targetAmount,
        uint64 deadline,
        string title,
        string metadataCID
    );
    event MilestoneCreated(
        uint256 indexed campaignId, uint256 indexed milestoneId, uint256 allocatedAmount, string description
    );
    event CampaignStatusChanged(uint256 indexed campaignId, bool active, bool suspended);
    event CampaignVerifierChanged(
        uint256 indexed campaignId, address indexed previousVerifier, address indexed newVerifier
    );
    event DonationReceived(uint256 indexed campaignId, address indexed donor, uint256 amount, uint256 totalDonated);
    event EvidenceSubmitted(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address indexed ngo,
        string evidenceCID,
        bytes32 evidenceHash
    );
    event MilestoneApproved(uint256 indexed campaignId, uint256 indexed milestoneId, address indexed verifier);
    event MilestoneRejected(
        uint256 indexed campaignId, uint256 indexed milestoneId, address indexed verifier, string reason
    );
    event FundsReleased(
        uint256 indexed campaignId,
        uint256 indexed milestoneId,
        address indexed beneficiary,
        uint256 amount,
        address releasedBy
    );

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAddress();
    error AlreadyRegistered(address account);
    error NotRegistered(address account);
    error RoleConflict(address account);
    error CampaignNotFound(uint256 campaignId);
    error MilestoneNotFound(uint256 campaignId, uint256 milestoneId);
    error NotCampaignNGO(uint256 campaignId, address caller);
    error NotCampaignVerifier(uint256 campaignId, address caller);
    error NotAuthorizedToRelease(uint256 campaignId, address caller);
    error NotAVerifier(address account);
    error ConflictOfInterest(address verifier);
    error EmptyText();
    error TextTooLong(uint256 maxLength);
    error InvalidAmount();
    error InvalidDeadline();
    error InvalidEvidence();
    error LengthMismatch();
    error TooManyMilestones(uint256 max);
    error AllocationExceedsTarget(uint256 totalAllocated, uint256 targetAmount);
    error CampaignNotActive(uint256 campaignId);
    error CampaignEnded(uint256 campaignId, uint64 deadline);
    error DonationExceedsTarget(uint256 remaining);
    error InvalidMilestoneStatus(MilestoneStatus current);
    error AlreadyReleased(uint256 campaignId, uint256 milestoneId);
    error InsufficientEscrow(uint256 available, uint256 required);
    error TransferFailed();

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    constructor(address admin) {
        if (admin == address(0)) revert ZeroAddress();
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // ---------------------------------------------------------------------
    // Admin: role management
    // ---------------------------------------------------------------------

    function registerNGO(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (!_grantRole(NGO_ROLE, account)) revert AlreadyRegistered(account);
        emit NGORegistered(account, msg.sender);
    }

    function registerVerifier(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) revert ZeroAddress();
        if (!_grantRole(VERIFIER_ROLE, account)) revert AlreadyRegistered(account);
        emit VerifierRegistered(account, msg.sender);
    }

    function revokeNGO(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_revokeRole(NGO_ROLE, account)) revert NotRegistered(account);
        emit NGORevoked(account, msg.sender);
    }

    function revokeVerifier(address account) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (!_revokeRole(VERIFIER_ROLE, account)) revert NotRegistered(account);
        emit VerifierRevoked(account, msg.sender);
    }

    /// @notice Reassign the verifier of a campaign (e.g. if the previous verifier was revoked).
    function setCampaignVerifier(uint256 campaignId, address verifier) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Campaign storage c = _campaign(campaignId);
        _requireEligibleVerifier(verifier, c.ngo, c.beneficiary);
        address previous = c.verifier;
        c.verifier = verifier;
        emit CampaignVerifierChanged(campaignId, previous, verifier);
    }

    /// @notice Suspend or resume donations to a campaign. Does not affect funds already in escrow.
    function setCampaignSuspended(uint256 campaignId, bool suspended) external onlyRole(DEFAULT_ADMIN_ROLE) {
        Campaign storage c = _campaign(campaignId);
        c.suspended = suspended;
        _refreshActive(c, true);
    }

    // ---------------------------------------------------------------------
    // NGO: campaigns & milestones
    // ---------------------------------------------------------------------

    /**
     * @notice Create a campaign together with its milestones. The campaign accepts donations once
     *         the milestone allocations add up exactly to the target amount.
     */
    function createCampaign(
        string calldata title,
        string calldata metadataCID,
        address payable beneficiary,
        address verifier,
        uint256 targetAmount,
        uint64 deadline,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts
    ) external onlyRole(NGO_ROLE) returns (uint256 campaignId) {
        _requireText(title, MAX_TITLE_LENGTH);
        _requireText(metadataCID, MAX_CID_LENGTH);
        if (beneficiary == address(0)) revert ZeroAddress();
        _requireEligibleVerifier(verifier, msg.sender, beneficiary);
        if (targetAmount == 0) revert InvalidAmount();
        if (deadline <= block.timestamp) revert InvalidDeadline();
        if (milestoneDescriptions.length != milestoneAmounts.length) revert LengthMismatch();
        if (milestoneDescriptions.length > MAX_MILESTONES) revert TooManyMilestones(MAX_MILESTONES);

        campaignId = ++campaignCount;
        Campaign storage c = _campaigns[campaignId];
        c.id = campaignId;
        c.ngo = msg.sender;
        c.beneficiary = beneficiary;
        c.verifier = verifier;
        c.title = title;
        c.metadataCID = metadataCID;
        c.targetAmount = targetAmount;
        c.deadline = deadline;
        c.createdAt = uint64(block.timestamp);

        _emitCampaignCreated(c);

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            _addMilestone(c, milestoneDescriptions[i], milestoneAmounts[i]);
        }
        _refreshActive(c, false);
    }

    /// @notice Add a milestone to an existing campaign; total allocations may never exceed the target.
    function createMilestone(uint256 campaignId, string calldata description, uint256 allocatedAmount)
        external
        returns (uint256 milestoneId)
    {
        Campaign storage c = _campaign(campaignId);
        _requireCampaignNGO(c);
        if (c.milestoneCount >= MAX_MILESTONES) revert TooManyMilestones(MAX_MILESTONES);
        milestoneId = _addMilestone(c, description, allocatedAmount);
        _refreshActive(c, false);
    }

    // ---------------------------------------------------------------------
    // Donor
    // ---------------------------------------------------------------------

    function donate(uint256 campaignId) external payable {
        Campaign storage c = _campaign(campaignId);
        if (!c.active) revert CampaignNotActive(campaignId);
        if (block.timestamp > c.deadline) revert CampaignEnded(campaignId, c.deadline);
        if (msg.value == 0) revert InvalidAmount();
        uint256 remaining = c.targetAmount - c.totalDonated;
        if (msg.value > remaining) revert DonationExceedsTarget(remaining);

        c.totalDonated += msg.value;
        _contributions[campaignId][msg.sender] += msg.value;

        emit DonationReceived(campaignId, msg.sender, msg.value, c.totalDonated);
    }

    // ---------------------------------------------------------------------
    // Evidence & verification
    // ---------------------------------------------------------------------

    /// @notice NGO submits the IPFS CID and SHA-256 hash of the evidence manifest for a milestone.
    function submitEvidence(uint256 campaignId, uint256 milestoneId, string calldata evidenceCID, bytes32 evidenceHash)
        external
    {
        Campaign storage c = _campaign(campaignId);
        _requireCampaignNGO(c);
        Milestone storage m = _milestone(campaignId, milestoneId);
        if (m.status != MilestoneStatus.Pending && m.status != MilestoneStatus.Rejected) {
            revert InvalidMilestoneStatus(m.status);
        }
        if (bytes(evidenceCID).length == 0 || bytes(evidenceCID).length > MAX_CID_LENGTH || evidenceHash == bytes32(0))
        {
            revert InvalidEvidence();
        }

        m.evidenceCID = evidenceCID;
        m.evidenceHash = evidenceHash;
        m.status = MilestoneStatus.Submitted;
        m.rejectionReason = "";
        m.submittedAt = uint64(block.timestamp);

        emit EvidenceSubmitted(campaignId, milestoneId, msg.sender, evidenceCID, evidenceHash);
    }

    function approveMilestone(uint256 campaignId, uint256 milestoneId) external {
        Campaign storage c = _campaign(campaignId);
        _requireCampaignVerifier(c);
        Milestone storage m = _milestone(campaignId, milestoneId);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus(m.status);

        m.status = MilestoneStatus.Approved;
        m.reviewedAt = uint64(block.timestamp);

        emit MilestoneApproved(campaignId, milestoneId, msg.sender);
    }

    function rejectMilestone(uint256 campaignId, uint256 milestoneId, string calldata reason) external {
        Campaign storage c = _campaign(campaignId);
        _requireCampaignVerifier(c);
        _requireText(reason, MAX_REASON_LENGTH);
        Milestone storage m = _milestone(campaignId, milestoneId);
        if (m.status != MilestoneStatus.Submitted) revert InvalidMilestoneStatus(m.status);

        m.status = MilestoneStatus.Rejected;
        m.rejectionReason = reason;
        m.reviewedAt = uint64(block.timestamp);

        emit MilestoneRejected(campaignId, milestoneId, msg.sender, reason);
    }

    // ---------------------------------------------------------------------
    // Fund release
    // ---------------------------------------------------------------------

    /**
     * @notice Release an approved milestone's allocation from escrow to the campaign beneficiary.
     *         Callable by the campaign's verifier or an admin — never by the NGO.
     */
    function releaseFunds(uint256 campaignId, uint256 milestoneId) external nonReentrant {
        Campaign storage c = _campaign(campaignId);
        bool isCampaignVerifier = msg.sender == c.verifier && hasRole(VERIFIER_ROLE, msg.sender);
        if (!isCampaignVerifier && !hasRole(DEFAULT_ADMIN_ROLE, msg.sender)) {
            revert NotAuthorizedToRelease(campaignId, msg.sender);
        }
        Milestone storage m = _milestone(campaignId, milestoneId);
        if (m.status == MilestoneStatus.Released) revert AlreadyReleased(campaignId, milestoneId);
        if (m.status != MilestoneStatus.Approved) revert InvalidMilestoneStatus(m.status);

        uint256 amount = m.allocatedAmount;
        uint256 available = c.totalDonated - c.totalReleased;
        if (available < amount) revert InsufficientEscrow(available, amount);

        // Effects
        m.status = MilestoneStatus.Released;
        m.releasedAt = uint64(block.timestamp);
        c.totalReleased += amount;
        emit FundsReleased(campaignId, milestoneId, c.beneficiary, amount, msg.sender);

        // Interaction
        (bool ok,) = c.beneficiary.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function getCampaign(uint256 campaignId) external view returns (Campaign memory) {
        return _campaign(campaignId);
    }

    function getMilestone(uint256 campaignId, uint256 milestoneId) external view returns (Milestone memory) {
        _campaign(campaignId);
        return _milestone(campaignId, milestoneId);
    }

    function getMilestones(uint256 campaignId) external view returns (Milestone[] memory list) {
        Campaign storage c = _campaign(campaignId);
        list = new Milestone[](c.milestoneCount);
        for (uint256 i = 0; i < c.milestoneCount; i++) {
            list[i] = _milestones[campaignId][i];
        }
    }

    /// @notice Total amount `donor` has contributed to `campaignId`.
    function getDonation(uint256 campaignId, address donor) external view returns (uint256) {
        _campaign(campaignId);
        return _contributions[campaignId][donor];
    }

    function escrowBalance(uint256 campaignId) external view returns (uint256) {
        Campaign storage c = _campaign(campaignId);
        return c.totalDonated - c.totalReleased;
    }

    function isNGO(address account) external view returns (bool) {
        return hasRole(NGO_ROLE, account);
    }

    function isVerifier(address account) external view returns (bool) {
        return hasRole(VERIFIER_ROLE, account);
    }

    function isAdmin(address account) external view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, account);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    /// Separation of duties on every grant path (including AccessControl.grantRole):
    /// an address can never be both an NGO and a verifier.
    function _grantRole(bytes32 role, address account) internal override returns (bool) {
        if (role == NGO_ROLE && hasRole(VERIFIER_ROLE, account)) revert RoleConflict(account);
        if (role == VERIFIER_ROLE && hasRole(NGO_ROLE, account)) revert RoleConflict(account);
        return super._grantRole(role, account);
    }

    function _campaign(uint256 campaignId) private view returns (Campaign storage c) {
        c = _campaigns[campaignId];
        if (c.id == 0) revert CampaignNotFound(campaignId);
    }

    function _milestone(uint256 campaignId, uint256 milestoneId) private view returns (Milestone storage) {
        if (milestoneId >= _campaigns[campaignId].milestoneCount) revert MilestoneNotFound(campaignId, milestoneId);
        return _milestones[campaignId][milestoneId];
    }

    function _requireCampaignNGO(Campaign storage c) private view {
        if (msg.sender != c.ngo || !hasRole(NGO_ROLE, msg.sender)) revert NotCampaignNGO(c.id, msg.sender);
    }

    function _requireCampaignVerifier(Campaign storage c) private view {
        if (msg.sender != c.verifier || !hasRole(VERIFIER_ROLE, msg.sender)) {
            revert NotCampaignVerifier(c.id, msg.sender);
        }
    }

    function _requireEligibleVerifier(address verifier, address ngo, address beneficiary) private view {
        if (!hasRole(VERIFIER_ROLE, verifier)) revert NotAVerifier(verifier);
        if (verifier == ngo || verifier == beneficiary) revert ConflictOfInterest(verifier);
    }

    function _requireText(string calldata text, uint256 maxLength) private pure {
        uint256 len = bytes(text).length;
        if (len == 0) revert EmptyText();
        if (len > maxLength) revert TextTooLong(maxLength);
    }

    function _addMilestone(Campaign storage c, string calldata description, uint256 amount)
        private
        returns (uint256 milestoneId)
    {
        _requireText(description, MAX_DESCRIPTION_LENGTH);
        if (amount == 0) revert InvalidAmount();
        uint256 newTotal = c.totalAllocated + amount;
        if (newTotal > c.targetAmount) revert AllocationExceedsTarget(newTotal, c.targetAmount);

        milestoneId = c.milestoneCount;
        Milestone storage m = _milestones[c.id][milestoneId];
        m.id = milestoneId;
        m.description = description;
        m.allocatedAmount = amount;
        c.milestoneCount += 1;
        c.totalAllocated = newTotal;

        emit MilestoneCreated(c.id, milestoneId, amount, description);
    }

    function _emitCampaignCreated(Campaign storage c) private {
        emit CampaignCreated(c.id, c.ngo, c.verifier, c.beneficiary, c.targetAmount, c.deadline, c.title, c.metadataCID);
    }

    /// Recompute `active`; emit only when it changes (or when `force` is set by an admin action).
    function _refreshActive(Campaign storage c, bool force) private {
        bool nowActive = !c.suspended && c.totalAllocated == c.targetAmount;
        if (nowActive != c.active || force) {
            c.active = nowActive;
            emit CampaignStatusChanged(c.id, nowActive, c.suspended);
        }
    }
}
