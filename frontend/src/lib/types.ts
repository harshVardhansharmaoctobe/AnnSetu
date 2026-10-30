export type MilestoneStatus = "DRAFT" | "PENDING" | "PENDING_VERIFICATION" | "APPROVED" | "REJECTED" | "RELEASED";
export type Role = "ADMIN" | "NGO" | "VERIFIER" | "DONOR";

export interface Party {
  address: string;
  name: string | null;
  organization: string | null;
}

export interface EvidenceFile {
  name: string;
  mime: string;
  size: number;
  sha256: string;
  ref: string;
  provider: string;
  url: string | null;
}

export interface Evidence {
  id: string;
  campaignId: number;
  milestoneId: number;
  ngoAddress: string;
  note: string;
  provider: string;
  isIpfs: boolean;
  manifest: { ref: string; sha256: string; url: string | null };
  files: EvidenceFile[];
  status: "UPLOADED" | "SUBMITTED" | "APPROVED" | "REJECTED" | "RELEASED" | "SUPERSEDED";
  submitTxHash: string | null;
  submittedAt: string | null;
  reviewTxHash: string | null;
  rejectionReason: string | null;
  createdAt: string | null;
}

export interface Milestone {
  id: number;
  description: string;
  amountWei: string;
  status: MilestoneStatus;
  evidenceCID: string | null;
  evidenceHash: string | null;
  evidenceUrl: string | null;
  evidenceIsIpfs: boolean | null;
  rejectionReason: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  releasedAt: string | null;
  evidence?: Evidence[];
}

export interface Campaign {
  id: number | null;
  draftId: string;
  status: "DRAFT" | "ONCHAIN";
  title: string;
  description: string;
  metadataAvailable: boolean;
  coverImage: { ref: string; provider: string; url: string | null; isIpfs: boolean } | null;
  metadata: { ref: string; url: string | null; isIpfs: boolean } | null;
  ngo: Party | null;
  beneficiary: Party | null;
  verifier: Party | null;
  targetWei: string;
  totalAllocatedWei: string;
  totalDonatedWei: string;
  totalReleasedWei: string;
  escrowWei: string;
  active: boolean;
  suspended: boolean;
  deadline: string | null;
  ended: boolean;
  createdAt: string | null;
  createdTxHash: string | null;
  donationCount: number;
  donorCount: number;
  milestones: Milestone[];
  isDemo: boolean;
  syncedAt: string | null;
  syncedBlock: number | null;
  source?: "chain" | "index";
}

export interface ChainEvent {
  _id: string;
  txHash: string;
  logIndex: number;
  blockNumber: number;
  blockTimestamp: string;
  event: string;
  campaignId: number | null;
  milestoneId: number | null;
  actor: string | null;
  subject: string | null;
  amountWei: string | null;
  args: Record<string, unknown>;
}

export interface User {
  id: string;
  address: string;
  name: string;
  email: string | null;
  organization: string | null;
  requestedRole: "DONOR" | "NGO" | "VERIFIER";
  isDemo: boolean;
  createdAt: string;
}

export interface RoleSet {
  isAdmin: boolean;
  isNGO: boolean;
  isVerifier: boolean;
  roles: Role[];
}

export interface VerificationRecord {
  _id: string;
  campaignId: number;
  milestoneId: number;
  verifier: string;
  decision: "APPROVED" | "REJECTED";
  reason: string | null;
  evidenceCID: string | null;
  evidenceHash: string | null;
  txHash: string;
  blockNumber: number;
  decidedAt: string;
  campaignTitle: string | null;
  milestoneDescription: string | null;
}

export interface AuthorizedAccount {
  address: string;
  name: string | null;
  organization: string | null;
  isDemo: boolean;
  authorizedAt: string;
  txHash: string;
}

export interface StorageStatus {
  provider: "pinata" | "kubo" | "local";
  configured: boolean;
  isIpfs: boolean;
  gateway: string | null;
  warning: string | null;
}
