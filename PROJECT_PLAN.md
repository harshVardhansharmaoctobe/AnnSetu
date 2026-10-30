# TrustChain — Project Plan

Problem statement 3.3 — Transparent Charity Donations on the Blockchain.

## 1. Repository assessment (Phase 0, 2026-10-30)

| Item | Finding |
|---|---|
| Existing files | None. Workspace contained only an empty `ps3.3/` folder, which is used as the project root. |
| Git | Not a repository. `git init` performed locally (no commits, no remotes). |
| Node.js | v22.23.2 |
| Package managers | npm 10.9.8 (used), pnpm 10.34.7 (available, unused) |
| MongoDB | Not installed, no Docker. Dev fallback: `mongodb-memory-server` running a real `mongod` binary (downloads from fastdl.mongodb.org, reachable). Any `MONGODB_URI` (e.g. Atlas) can be used instead. |
| Network | npm registry, Sepolia public RPC (`ethereum-sepolia-rpc.publicnode.com`, chainId 11155111), Pinata API, solc binaries — all reachable. |
| Credentials | None supplied: no Sepolia deployer key, no Pinata keys. See §5. |
| OneDrive | `E:\OneDrive` is **not** the synced OneDrive folder (that is `C:\Users\YASH\OneDrive`), so `node_modules` here is safe. |

## 2. Final folder structure

```
ps3.3/
├── package.json              # root dev scripts (no workspaces; each package installs independently)
├── README.md  PROJECT_PLAN.md  IMPLEMENTATION_STATUS.md  ARCHITECTURE.md
├── .gitignore  .env.example (index of per-package examples)
├── blockchain/               # Hardhat 2 workspace
│   ├── contracts/TrustChain.sol
│   ├── test/TrustChain.test.ts
│   ├── scripts/deploy.ts  export-abi.ts  seed-demo.ts
│   ├── deployments/<network>.json
│   └── hardhat.config.ts  .env.example
├── backend/                  # Express 5 + TypeScript + Mongoose
│   ├── src/{config,models,routes,controllers,services,middleware,validators,utils}
│   ├── src/app.ts  src/server.ts
│   ├── scripts/dev-db.ts     # local mongod via mongodb-memory-server
│   ├── test/                 # Vitest + Supertest (+ in-memory Mongo + local Hardhat node)
│   └── .env.example
└── frontend/                 # React 19 + Vite 7 + Tailwind 4
    ├── src/{components,context,hooks,lib,contracts,pages}
    ├── src/**/*.test.ts(x)   # Vitest
    └── .env.example
```

## 3. Dependencies (pinned to stable majors)

The newest majors on npm (TypeScript 7, Vite 8, React Router 8, Vitest 5, Mongoose 9, Zod 4) are recent releases; the project uses the previous stable line of each to minimise integration risk.

| Area | Packages |
|---|---|
| Blockchain | hardhat 2.29, @nomicfoundation/hardhat-toolbox 5 (ethers v6, chai, mocha, typechain), @openzeppelin/contracts 5.x, solc 0.8.28, dotenv |
| Backend | express 5, mongoose 8, zod 3, jsonwebtoken 9, multer 2, ethers 6, multiformats (CID validation), cors, helmet, dotenv, tsx, typescript 5.9 |
| Backend tests | vitest 3, supertest 7, mongodb-memory-server 10 |
| Frontend | react 19, react-dom 19, vite 7, @vitejs/plugin-react 5, typescript 5.9, tailwindcss 4.1 + @tailwindcss/vite, react-router 7, ethers 6, recharts 3, lucide-react, @radix-ui/react-dialog, clsx + tailwind-merge (shadcn/ui pattern) |
| Frontend tests | vitest 3, @testing-library/react, jsdom |
| Root | concurrently |

## 4. Implementation plan (phases, in order)

| Phase | Deliverable | Exit criteria |
|---|---|---|
| 0 | Inspection, this plan, ARCHITECTURE.md, IMPLEMENTATION_STATUS.md | Docs exist |
| 1 | Three package skeletons, scripts, env examples, .gitignore | frontend dev+build, backend dev+build, Hardhat compiles, Mongo connects |
| 2 | `TrustChain.sol` + Hardhat tests + local deploy script | All tests pass, deploy works on local node |
| 3 | Sepolia config, deploy script, ABI/address export, chain-id validation | Scripts ready; deploy executed only if credentials supplied |
| 4 | Models, wallet-signature auth (JWT), role middleware (roles read from chain), campaign/evidence/verification/chain/admin APIs, IPFS service, event indexer, tx verification | Supertest suite passes against in-memory Mongo + local Hardhat chain |
| 5 | Layouts, landing, campaign list/detail, transparency page, tx page | Pages render real API/chain data |
| 6 | Wallet connect, network guard, donation flow, tx lifecycle UI | Donation confirmed on local chain (Sepolia if funded) |
| 7 | NGO dashboard, create campaign, milestones, evidence upload → on-chain submit | Evidence CID+hash on-chain |
| 8 | Verifier dashboard, review, approve/reject, release | Unauthorized + double release blocked |
| 9 | Donor dashboard, history, transparency figures from contract/events | Values traced to chain |
| 10 | Full E2E scenario + failure scenarios | Critical bugs fixed |
| 11 | README, final checklist, demo walkthrough | Docs complete and honest |

## 5. Known risks and environment requirements

| Risk / requirement | Mitigation |
|---|---|
| No Sepolia deployer key / faucet ETH | Everything works end-to-end on a local Hardhat node (chainId 31337). Sepolia deployment script is ready; needs `SEPOLIA_RPC_URL` + `DEPLOYER_PRIVATE_KEY` with faucet ETH. |
| No Pinata credentials | IPFS service fully implemented for Pinata (JWT or key/secret) and any Kubo-compatible IPFS HTTP API. Without credentials a **clearly labelled local-dev storage fallback** is used: references are `local://sha256-…`, never presented as IPFS CIDs. |
| No MongoDB server | `npm run db` starts a real local `mongod` via mongodb-memory-server with on-disk persistence. |
| MetaMask cannot be driven by automated tests | Contract + backend flows tested with ethers wallets against a real local chain. UI flow tested with a scripted EIP-1193 provider where feasible; manual MetaMask steps documented. |
| Local chain resets vs persisted DB | Indexer stores the hash of its start block; if the chain was reset, chain-derived data for that contract is purged and re-indexed. |
| Funds of a campaign that never completes stay in escrow | Out of scope (refunds are not in the feature list). Documented as a known limitation. |
