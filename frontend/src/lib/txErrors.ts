import { formatEther } from "ethers";

const STATUS_NAMES = ["awaiting evidence", "pending verification", "approved", "rejected", "released"];

type Args = readonly unknown[];

const MESSAGES: Record<string, (a: Args) => string> = {
  CampaignNotActive: () => "This campaign is not accepting donations (not fully allocated or suspended by the admin).",
  CampaignEnded: () => "This campaign's donation period has ended.",
  DonationExceedsTarget: (a) => `This donation exceeds the remaining target. At most ${formatEther(a[0] as bigint)} ETH can still be donated.`,
  InvalidAmount: () => "The amount must be greater than zero.",
  CampaignNotFound: () => "This campaign does not exist on-chain.",
  MilestoneNotFound: () => "This milestone does not exist.",
  NotCampaignNGO: () => "Only the NGO wallet that created this campaign can do this.",
  NotCampaignVerifier: () => "Only the verifier assigned to this campaign can review its milestones.",
  NotAuthorizedToRelease: () => "Only the campaign's verifier or a platform admin can release funds.",
  NotAVerifier: () => "The selected verifier is not authorised on-chain.",
  ConflictOfInterest: () => "The verifier cannot be the NGO or the beneficiary.",
  InvalidMilestoneStatus: (a) => `The milestone is currently ${STATUS_NAMES[Number(a[0])] ?? "in another state"}, so this action is not allowed.`,
  AlreadyReleased: () => "Funds for this milestone have already been released.",
  InsufficientEscrow: (a) =>
    `Not enough funds in escrow: ${formatEther(a[0] as bigint)} ETH available, ${formatEther(a[1] as bigint)} ETH required. More donations are needed first.`,
  TransferFailed: () => "The beneficiary address rejected the transfer. Nothing was released.",
  AllocationExceedsTarget: () => "Milestone allocations would exceed the campaign target.",
  InvalidDeadline: () => "The campaign end date must be in the future.",
  InvalidEvidence: () => "The evidence reference or hash is invalid.",
  EmptyText: () => "A required text field is empty.",
  TextTooLong: (a) => `Text is too long (max ${String(a[0])} characters).`,
  LengthMismatch: () => "Milestone descriptions and amounts do not match.",
  TooManyMilestones: (a) => `Too many milestones (max ${String(a[0])}).`,
  ZeroAddress: () => "An address is missing.",
  AlreadyRegistered: () => "This wallet already has that role.",
  NotRegistered: () => "This wallet does not have that role.",
  RoleConflict: () => "A wallet cannot be both an NGO and a verifier.",
  AccessControlUnauthorizedAccount: () => "Your wallet does not have the on-chain role required for this action.",
  ReentrancyGuardReentrantCall: () => "Re-entrant call blocked.",
};

interface EthersLikeError {
  code?: string | number;
  shortMessage?: string;
  message?: string;
  reason?: string;
  revert?: { name: string; args: Args } | null;
  info?: { error?: { code?: number; message?: string } };
  error?: { code?: number; message?: string };
}

/** Turn a wallet / ethers / contract error into a sentence a user can act on. */
export function describeTxError(err: unknown): string {
  const e = (err ?? {}) as EthersLikeError;
  const rpcCode = e.info?.error?.code ?? e.error?.code;

  if (e.code === "ACTION_REJECTED" || e.code === 4001 || rpcCode === 4001) {
    return "You rejected the request in your wallet. Nothing was sent.";
  }
  if (e.revert?.name && MESSAGES[e.revert.name]) return MESSAGES[e.revert.name](e.revert.args);
  if (e.code === "INSUFFICIENT_FUNDS" || /insufficient funds/i.test(e.message ?? "")) {
    return "Your wallet does not have enough ETH to cover this amount plus gas.";
  }
  if (e.code === "NETWORK_ERROR" || e.code === "SERVER_ERROR" || e.code === "TIMEOUT") {
    return "Could not reach the blockchain network. Check your wallet's connection and try again.";
  }
  if (e.code === "CALL_EXCEPTION") {
    return e.reason ? `Transaction reverted: ${e.reason}` : "The contract rejected this transaction.";
  }
  if (rpcCode === -32002) return "Your wallet already has a pending request. Open MetaMask to continue.";
  return e.shortMessage ?? e.message ?? "Unexpected error";
}
