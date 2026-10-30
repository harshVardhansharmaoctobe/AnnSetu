import { config } from "./config";
import type {
  AuthorizedAccount,
  Campaign,
  ChainEvent,
  Evidence,
  RoleSet,
  StorageStatus,
  User,
  VerificationRecord,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "ERROR",
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "trustchain.token";

export const tokenStore = {
  get(): string | null {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string | null) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* storage unavailable: session lasts for this page only */
    }
  },
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${config.apiUrl}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Cannot reach the TrustChain API. Check that the backend is running.", "NETWORK_ERROR");
  }
  const text = await res.text();
  const body = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = body?.error ?? {};
    throw new ApiError(res.status, err.message ?? `Request failed (${res.status})`, err.code, err.details);
  }
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: "POST", body: body instanceof FormData ? body : JSON.stringify(body ?? {}) });

const qs = (params: Record<string, string | number | undefined | null>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
};

export interface AuthResponse {
  token: string;
  user: User;
  roles: RoleSet | null;
  chainAvailable: boolean;
}

export interface DraftResponse {
  draftId: string;
  metadata: { ref: string; url: string | null; isIpfs: boolean; provider: string };
  contractArgs: {
    title: string;
    metadataCID: string;
    beneficiary: string;
    verifier: string;
    targetAmount: string;
    deadline: number;
    milestoneDescriptions: string[];
    milestoneAmounts: string[];
  };
}

export interface PendingReview {
  campaignId: number;
  campaignTitle: string;
  ngo: string;
  beneficiary: string;
  milestoneId: number;
  description: string;
  amountWei: string;
  evidenceCID: string;
  evidenceHash: string;
  submittedAt: string | null;
  escrowWei: string;
  evidence: Evidence | null;
}

export interface AwaitingRelease {
  campaignId: number;
  campaignTitle: string;
  milestoneId: number;
  description: string;
  amountWei: string;
  escrowWei: string;
  beneficiary: string;
}

export interface DonationTotals {
  campaignId: number;
  title: string;
  contributedWei: string | null;
  indexedContributedWei: string;
  targetWei: string;
  totalDonatedWei: string;
  totalReleasedWei: string;
  milestonesReleased: number;
  milestoneCount: number;
}

export interface IntegrityReport {
  evidenceId: string;
  onChain: { evidenceCID: string | null; evidenceHash: string };
  isCurrentOnChainEvidence: boolean;
  manifest: { ref: string; expected: string; computed: string | null; match: boolean };
  files: { name: string; ref: string; expected: string; computed: string | null; match: boolean }[];
  allMatch: boolean;
}

export interface Overview {
  campaigns: number;
  totalDonatedWei: string;
  totalReleasedWei: string;
  escrowWei: string;
  donations: number;
  donors: number;
  pendingReviews: number;
  users: number;
  ngos: number;
  verifiers: number;
  recentEvents: ChainEvent[];
}

export interface Application {
  address: string;
  name: string;
  email: string | null;
  organization: string | null;
  requestedRole: "NGO" | "VERIFIER";
  isDemo: boolean;
  createdAt: string;
  onChain: { isNGO: boolean; isVerifier: boolean; isAdmin: boolean } | null;
}

export interface TxDetail {
  hash: string;
  receipt: {
    status: "success" | "reverted";
    blockNumber: number;
    from: string;
    to: string | null;
    gasUsed: string;
    toTrustChain: boolean;
  } | null;
  events: ChainEvent[];
}

export const api = {
  // auth
  nonce: (address: string) => post<{ nonce: string; message: string }>("/auth/nonce", { address }),
  register: (body: { address: string; signature: string; name: string; email?: string; organization?: string; requestedRole: string }) =>
    post<AuthResponse>("/auth/register", body),
  login: (address: string, signature: string) => post<AuthResponse>("/auth/login", { address, signature }),
  me: () => get<Omit<AuthResponse, "token">>("/auth/me"),

  // campaigns
  campaigns: (params: { ngo?: string; verifier?: string; q?: string; state?: string } = {}) =>
    get<{ campaigns: Campaign[] }>(`/campaigns${qs(params)}`),
  campaign: (id: number | string) => get<{ campaign: Campaign }>(`/campaigns/${id}`),
  campaignEvents: (id: number | string) => get<{ events: ChainEvent[] }>(`/campaigns/${id}/events`),
  myCampaigns: () => get<{ campaigns: Campaign[] }>("/campaigns/mine"),
  createDraft: (form: FormData) => post<DraftResponse>("/campaigns/drafts", form),

  // evidence
  uploadEvidence: (form: FormData) => post<{ evidence: Evidence }>("/evidence", form),
  evidence: (params: { campaignId?: number; milestoneId?: number }) => get<{ evidence: Evidence[] }>(`/evidence${qs(params)}`),
  integrity: (id: string) => get<IntegrityReport>(`/evidence/${id}/integrity`),

  // verification
  pendingReviews: () => get<{ items: PendingReview[] }>("/verifications/pending"),
  awaitingRelease: () => get<{ items: AwaitingRelease[] }>("/verifications/awaiting-release"),
  verificationHistory: (params: { verifier?: string; campaignId?: number }) =>
    get<{ records: VerificationRecord[] }>(`/verifications/history${qs(params)}`),

  // chain
  chainStatus: () =>
    get<{ chain: { ok: boolean; reason?: string; latestBlock?: number }; indexer: Record<string, unknown>; storage: StorageStatus }>(
      "/chain/status",
    ),
  syncTx: (txHash: string) => post<{ events: { event: string; campaignId: number | null }[]; blockNumber: number }>("/chain/sync-tx", { txHash }),
  transactions: (params: { campaignId?: number; address?: string; event?: string; limit?: number }) =>
    get<{ events: ChainEvent[] }>(`/chain/transactions${qs(params)}`),
  tx: (hash: string) => get<TxDetail>(`/chain/tx/${hash}`),
  donations: (donor: string) => get<{ donor: string; events: ChainEvent[]; totals: DonationTotals[] }>(`/donations${qs({ donor })}`),

  // directory & admin
  verifiers: () => get<{ accounts: AuthorizedAccount[] }>("/directory/verifiers"),
  ngos: () => get<{ accounts: AuthorizedAccount[] }>("/directory/ngos"),
  overview: () => get<Overview>("/admin/overview"),
  applications: () => get<{ applications: Application[] }>("/admin/applications"),
};
