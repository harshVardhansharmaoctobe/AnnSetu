// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {TrustChain} from "../TrustChain.sol";

/// @dev Test-only beneficiary that refuses ETH, to exercise TrustChain's TransferFailed path.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }
}

/// @dev Test-only beneficiary that tries to re-enter releaseFunds when it receives ETH.
///      It must hold an authorised role (admin) for the attempt to reach the reentrancy guard.
contract ReentrantReceiver {
    TrustChain public immutable trustChain;
    uint256 public targetCampaign;
    uint256 public targetMilestone;
    bool public reentryAttempted;
    bool public reentryBlocked;

    constructor(TrustChain _trustChain) {
        trustChain = _trustChain;
    }

    function setTarget(uint256 campaignId, uint256 milestoneId) external {
        targetCampaign = campaignId;
        targetMilestone = milestoneId;
    }

    function release(uint256 campaignId, uint256 milestoneId) external {
        trustChain.releaseFunds(campaignId, milestoneId);
    }

    receive() external payable {
        if (reentryAttempted) return;
        reentryAttempted = true;
        try trustChain.releaseFunds(targetCampaign, targetMilestone) {
            reentryBlocked = false;
        } catch {
            reentryBlocked = true;
        }
    }
}
