# TrustChain — Architecture

## 1. Overview

```
 Browser (React + Vite)
   ├── Public pages ── read ──► Express REST API ──► MongoDB (metadata, event index)
   │                                 │  ├──► IPFS provider (Pinata / Kubo)  [evidence, metadata]
   │                                 │  └──► Ethereum RPC (read-only: live state, receipts, logs)
   ├── Dashboards (Donor / NGO / Verifier / Admin)
   └── MetaMask + ethers v6 ── signed txs ──► TrustChain.sol (Sepolia / local Hardhat)
```

**Sources of truth**

| Data | Source of truth | Copy kept in |
|---|---|---|
| Balances (donated / escrow / released), milestone status, evidence CID+hash, roles | `TrustChain.sol` | MongoDB snapshot (display cache, refreshed from contract reads) |
| Donation / release / verification history | Contract events | `ChainEvent`, `Verification` collections (written **only** by the indexer from verified logs) |
| Campaign description, cover image, milestone descriptions | IPFS metadata JSON (CID stored on-chain) | `Campaign` document |
| Evidence files | IPFS (CIDs listed in an evidence manifest whose CID + SHA-256 are on-chain) | `Evidence` document |
| User profile (name, org, requested role) | MongoDB | — |

## 2. Smart contract — `TrustChain.sol`

OpenZeppelin `AccessControl` + `ReentrancyGuard`, Solidity 0.8.28.

Roles: `DEFAULT_ADMIN_ROLE` (deployer), `NGO_ROLE`, `VERIFIER_ROLE`. An address cannot hold both NGO and verifier roles (separation of duties).

**Campaign**: `id, ngo, beneficiary, verifier, title, metadataCID, targetAmount, totalAllocated, totalDonated, totalReleased, deadline, milestoneCount, active`.

**Milestone**: `id, description, allocatedAmount, evidenceCID, evidenceHash, status, rejectionReason, submittedAt, reviewedAt`, with
`status ∈ {Pending, Submitted (=PENDING_VERIFICATION), Approved, Rejected, Released}`.

Key rules

1. `createCampaign` (NGO only) takes the milestones in the same transaction. The verifier must hold `VERIFIER_ROLE` and differ from the NGO and beneficiary.
2. Σ milestone allocations ≤ target. The campaign becomes **active (accepts donations) only when Σ allocations = target**, so every donated wei belongs to a milestone. `createMilestone` can add allocations until the target is reached.
3. `donate` requires: active, before deadline, `totalDonated + value ≤ target`.
4. `submitEvidence` — only the campaign's NGO (still holding `NGO_ROLE`), only when the milestone is Pending or Rejected (resubmission).
5. `approveMilestone` / `rejectMilestone(reason)` — only the campaign's assigned verifier (still holding `VERIFIER_ROLE`), only when Submitted. Rejection reason is mandatory and stored on-chain.
6. `releaseFunds` — assigned verifier or admin, only when Approved, only if escrow (`totalDonated − totalReleased`) ≥ allocation. State updated before transfer (CEI), `nonReentrant`, transfer failure reverts. The status moves to Released, so a second release reverts.
7. Funds go only to the campaign's fixed `beneficiary`. Nobody — including the backend — can redirect them.
8. Admin can reassign a campaign's verifier and pause/unpause donations.
9. Plain ETH transfers to the contract revert (no `receive`).

Events: `NGORegistered/Revoked`, `VerifierRegistered/Revoked`, `CampaignCreated`, `MilestoneCreated`, `CampaignStatusChanged`, `CampaignVerifierChanged`, `DonationReceived`, `EvidenceSubmitted`, `MilestoneApproved`, `MilestoneRejected`, `FundsReleased`.

## 3. Authentication & roles

* **Wallet-signature login** (no passwords). `POST /auth/nonce` issues a one-time nonce; the user signs the message with MetaMask (`personal_sign`); the backend recovers the signer with `ethers.verifyMessage`, then issues a JWT bound to that address.
* **Roles are read from the contract** (`hasRole`), cached ~15 s. The JWT does not carry roles, so revocations apply quickly. Donor is the default role for every wallet.
* Registration stores a profile and the *requested* role. An NGO/verifier application becomes effective only after the admin wallet signs `registerNGO` / `registerVerifier` on-chain.
* Every privileged write is a MetaMask-signed contract transaction; the backend holds no keys and cannot move funds.

## 4. Backend (Express)

```
src/config       env (zod-validated), db, chain (provider, contract, ABI, deployment)
src/models       User, AuthNonce, Campaign, Evidence, ChainEvent, Verification, IndexerState
src/services     auth, roles, ipfs, campaign, evidence, indexer, txVerification
src/controllers  auth, campaign, evidence, verification, chain, admin
src/routes       /api/auth /api/campaigns /api/evidence /api/verifications /api/chain /api/admin /api/storage
src/middleware   requireAuth, requireRole, upload (multer), error handler
src/validators   zod schemas
src/utils        HttpError, hashing, logger (redacts secrets)
```

**Transaction verification (`POST /api/chain/sync-tx`)** — a client-supplied hash is never trusted. The backend fetches the receipt from the RPC, requires `status = 1`, `to = CONTRACT_ADDRESS`, matching chain id, then decodes logs emitted **by the contract address** only and feeds them into the same handlers the background indexer uses. Calling it only speeds up indexing; the indexer would pick up the same events anyway.

**Indexer** — polls `eth_getLogs` for the contract in block chunks, stores each log once (`txHash + logIndex` unique), refreshes affected campaigns from contract reads, and writes `Verification` records from `MilestoneApproved/Rejected`. Detects local chain resets via the stored start-block hash.

**Evidence pipeline** — multer (memory) → extension + MIME + magic-byte check → size limits → SHA-256 per file → upload each file → build manifest JSON `{campaignId, milestoneId, files:[{name, mime, size, sha256, cid}]}` → upload manifest → return `{manifestCID, manifestHash = sha256(manifest bytes)}`. The NGO then signs `submitEvidence(campaignId, milestoneId, manifestCID, manifestHash)`.

**IPFS providers** (`IPFS_PROVIDER`): `pinata` (JWT or API key/secret), `kubo` (any IPFS HTTP API `/api/v0/add`), `local` (dev fallback: files stored on disk, reference `local://sha256-<hex>`, served by `/api/storage/local/…`, labelled "Local dev storage — not on IPFS" everywhere).

## 5. Frontend

* `WalletContext` — EIP-1193 provider, account, chain id, connect, switch/add network.
* `AuthContext` — nonce-sign login, JWT in `localStorage`, roles from `/auth/me`.
* `useContractTx` — lifecycle `awaiting signature → pending (hash shown) → confirmed (receipt.status = 1) | failed`, decodes custom errors, then calls `/chain/sync-tx`. Success UI is shown only after the receipt.
* Public pages read from the API, which returns live contract values (labelled "live from contract") with the indexed history.
* Every tx hash links to the internal `/tx/:hash` page and to the configured block explorer (Sepolia Etherscan).

## 6. Main sequence

```
Admin ── registerNGO / registerVerifier ─────────────────────────► Contract
NGO ── POST /campaigns/drafts (cover + metadata → IPFS) ─► API ─► IPFS
NGO ── createCampaign(title, metadataCID, beneficiary, verifier, target, deadline, milestones) ► Contract
Donor ── donate(campaignId) {value} ─────────────────────────────► Contract (escrow)
NGO ── POST /evidence (files) ─► API ─► IPFS (files + manifest) → {CID, SHA-256}
NGO ── submitEvidence(campaignId, milestoneId, CID, hash) ───────► Contract  (PENDING_VERIFICATION)
Verifier ── approveMilestone / rejectMilestone(reason) ──────────► Contract
Verifier ── releaseFunds(campaignId, milestoneId) ───────────────► Contract ─► beneficiary
every tx ── POST /chain/sync-tx(hash) ─► API verifies receipt + logs ─► MongoDB index
Public ── GET /campaigns/:id ─► API (live contract reads + indexed events)
```
