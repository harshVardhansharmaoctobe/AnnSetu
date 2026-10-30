# TrustChain — Implementation Status

Legend: ✅ done & verified · 🟡 partial · ⛔ blocked · ⬜ not started

| Phase | Status | Notes |
|---|---|---|
| 0 — Inspection & planning | ✅ | Empty workspace; plan, architecture written |
| 1 — Foundation | ✅ | Frontend build, backend start + Mongo connect, Hardhat compile verified |
| 2 — Smart contract | ✅ | 42 Hardhat tests passing; local deploy works |
| 3 — Testnet deployment | 🟡 | Scripts, chain-id validation, ABI export done. ⛔ Sepolia deploy blocked: no `DEPLOYER_PRIVATE_KEY` |
| 4 — Backend | ✅ | 37 Supertest API tests passing against real Mongo + local chain. Pinata path implemented but ⛔ untested (no credentials) |
| 5 — Public frontend | ✅ | Landing, listing, detail, transparency, tx pages render live data; desktop + mobile smoke-tested in Edge (CORS and mobile-overflow bugs found and fixed) |
| 6 — MetaMask & donation | ✅ | Wallet connect, network guard, donation with receipt-gated success — verified through the UI in the E2E run |
| 7 — NGO & IPFS | ✅ | Create campaign (2-step), milestones, evidence upload → on-chain submit — verified through the UI in the E2E run |
| 8 — Verifier & release | 🟡 | Implemented; approval verified through the UI. Release UI fix applied, E2E re-run pending (blocked: C: drive full) |
| 9 — Donor & transparency | 🟡 | Implemented and type-checked; E2E steps 6–7 pending (blocked: C: drive full) |
| 10 — Integration testing | 🟡 | 14 frontend unit tests pass; Playwright E2E steps 1–4 pass; remaining steps blocked by a full C: drive |
| 11 — Final delivery | ⬜ | |

## Phase log

### Phase 0 — 2026-10-30
- Inspected workspace, toolchain, network reachability (see PROJECT_PLAN.md §1).
- Created PROJECT_PLAN.md, ARCHITECTURE.md, IMPLEMENTATION_STATUS.md.
- Blockers: none for local development. Sepolia deploy needs a funded key; Pinata needs credentials.

### Phase 1 — Foundation
- Root `package.json` (setup/dev/build/test scripts via `concurrently`), `.gitignore` (all `.env*` except examples).
- `blockchain/` Hardhat 2.29 + toolbox 5 + OZ 5.6 (solc 0.8.28, cancun).
- `backend/` Express 5 + Mongoose 8 + Zod 3, env validation, error handling, `/api/health`, `npm run db` (local mongod via mongodb-memory-server, persisted in `backend/.data/mongo`).
- `frontend/` React 19 + Vite 7 + Tailwind 4 theme tokens.
- Verified: `npm run build` (frontend) ✅, backend `tsc` build ✅, backend start → `{"status":"ok","db":"connected"}` ✅, `hardhat --version` ✅.
- Dependency note: `ethers@6.17` pins `@types/node@22.7.5`, which conflicts with Vite 7's optional peer; resolved by installing `@types/node@22.20.5` explicitly.

### Phase 2 — Smart contract
- `contracts/TrustChain.sol`: AccessControl + ReentrancyGuard; campaigns, milestones, escrow donations, evidence CID+hash, assigned-verifier approval/rejection, release to fixed beneficiary, admin role management, verifier reassignment, suspension; custom errors; all required events.
- Role separation (NGO ≠ verifier) enforced in `_grantRole`, so it also holds for `AccessControl.grantRole`.
- `contracts/test/ReceiverMocks.sol`: rejecting and re-entrant beneficiaries (test only).
- `test/TrustChain.test.ts`: **42 passing** — valid/invalid creation, allocation limits, donations (zero, over-target, deadline, suspended, plain ETH), evidence auth (outsider, other NGO, revoked NGO), approval/rejection auth (NGO, admin, other verifier, revoked verifier), release (auth, before approval, after rejection, double release, insufficient escrow, transfer failure rollback, re-entrancy), full scenario.
- `npm run deploy:local` deployed to the local node and exported ABI + `deployments.json` to `backend/contract/` and `frontend/src/contracts/`.

### Phase 3 — Testnet deployment
- `hardhat.config.ts` Sepolia network (chainId 11155111) reading `SEPOLIA_RPC_URL` / `DEPLOYER_PRIVATE_KEY` from `blockchain/.env`; malformed keys are ignored, keys are never printed.
- `scripts/deploy.ts` validates the RPC chain id against the network, refuses an unfunded deployer, waits for 2 confirmations on Sepolia, writes `deployments/sepolia.json`, exports ABI/addresses.
- ⛔ **Blocked**: `npm run deploy:sepolia` → "No deployer account for "sepolia". Set DEPLOYER_PRIVATE_KEY…". Needed: a testnet private key with Sepolia faucet ETH (≈0.02 ETH is ample) in `blockchain/.env`. No deployment result has been fabricated.

### Phase 4 — Backend
- **Auth**: wallet signature (nonce → `personal_sign` → `verifyMessage`) → JWT. Nonces are single-use with a 10 min TTL. Roles are read live from the contract (10 s cache), never from the JWT or the requested role.
- **Models**: User, AuthNonce, Campaign (metadata + chain snapshot), Evidence, ChainEvent, Verification, IndexerState.
- **Indexer**: polls `eth_getLogs`, idempotent (unique `txHash+logIndex`), serialised processing, refreshes campaign snapshots from contract reads, derives Verification records only from events, detects local chain resets.
- **`POST /api/chain/sync-tx`**: verifies receipt exists, `status=1`, `to=contract`, then indexes only logs emitted by the contract.
- **IPFS service**: Pinata (JWT or key/secret), Kubo, and the `local` fallback (`local://sha256-…`, served with `X-TrustChain-Storage: local-dev (not IPFS)`). A selected provider without credentials returns 503 — no silent fallback.
- **Evidence**: extension + MIME + magic-byte validation, size/count limits, per-file SHA-256, manifest JSON uploaded, manifest SHA-256 returned as bytes32; integrity endpoint re-downloads and re-hashes against the on-chain hash.
- **Tests** (`backend/test/api.test.ts`, 37 passing): auth (forged signature, replay, duplicate, tampered JWT), role gating from chain (NGO applicant without on-chain role → 403, revocation → 403), admin restrictions, draft validation (sum ≠ target, non-verifier, conflict of interest, fake PNG, PDF as cover), draft→on-chain linking, sync-tx rejection (malformed, unknown, wrong contract, reverted), idempotent indexing, background indexer pickup, evidence auth (donor, other NGO), invalid type / MIME mismatch / disguised file / oversize / empty / unknown milestone, missing IPFS credentials → 503, local storage labelling, integrity check, 409 while pending, CID validation, verifier-scoped pending list, absence of any approve API, approval/release/rejection recorded from events, duplicate release reverts, unassigned verifier reverts, tx detail, admin totals.
- Bug fixed during testing: indexing an ethers `Result` out of range throws → unknown milestone returned 500; now converted to an array (404).
