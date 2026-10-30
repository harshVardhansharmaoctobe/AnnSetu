# FoodBridge – Testing Report

All results below were produced by actually running the suites on 2026-10-31 (Windows 11, Node 22.23.2,
Next.js 15.5.28, PostgreSQL 16 + PostGIS in Docker). Nothing was skipped.

## How to run

```bash
npm run test:unit            # Vitest, pure functions (no DB, no server)
npm run build                # integration and E2E tests run against the production build
npm run test:integration     # Vitest + real HTTP against `next start` on :3100 and the foodbridge_test DB
npm run test:e2e             # Playwright against `next start` on :3200 and the foodbridge_test DB
PW_CHANNEL=chrome npm run test:e2e   # use the installed Google Chrome instead of Playwright's Chromium
```

Integration and E2E tests create/refresh a separate `<dev db>_test` database automatically. Every
destructive setup step refuses to run unless the database name ends in `_test`, and one test asserts the
server under test is not reading the development database.

## Final verification run

| # | Check | Result |
|---|---|---|
| 1 | `npm ls --depth=0` | ✅ exit 0 (one stray `@emnapi/runtime` folder in node_modules, not in package.json/lockfile) |
| 2 | `npm audit` | ⚠️ 9 findings (8 high, 1 moderate) – see below |
| 3 | `npm audit --omit=dev` | ⚠️ 3 findings (2 high, 1 moderate) – see below |
| 4 | `npx prisma validate` | ✅ valid |
| 5 | `npx prisma generate` | ✅ Prisma Client 5.22.0 |
| 6 | `npx tsc --noEmit` | ✅ 0 errors |
| 7 | ESLint (`next lint`, core-web-vitals + typescript) | ✅ no warnings or errors |
| 8 | Unit tests | ✅ 33/33 |
| 9 | `next build` (clean) | ✅ 50 routes |
| 10 | Integration tests | ✅ 106/106 |
| 11 | E2E tests | ✅ 4/4 |
| 12 | Docker health | ✅ `healthy`, 0 restarts |
| 13 | DB connectivity (`pg_isready`) | ✅ accepting connections |
| 14 | Prisma schema ↔ dev DB drift | ✅ none |
| 15 | Manual smoke test of all four roles on the seeded dev DB | ✅ 20/20 checks |

## Results by category

| Category | Suite / file | Total | Passed | Failed | Skipped |
|---|---|---|---|---|---|
| Unit – rate limiter | `src/lib/rate-limit.test.ts` | 4 | 4 | 0 | 0 |
| Unit – upload validation | `src/lib/uploads.test.ts` | 10 | 10 | 0 | 0 |
| Unit – validation schemas | `src/lib/validations.test.ts` | 13 | 13 | 0 | 0 |
| Unit – distance, matching, impact | `src/lib/matching.test.ts` | 6 | 6 | 0 | 0 |
| A. Authentication (+ profile, revocation, headers, isolation) | `tests/integration/auth.test.ts` | 30 | 30 | 0 | 0 |
| B. Authorization (roles, ownership, status) | `tests/integration/authorization.test.ts` | 12 | 12 | 0 | 0 |
| C. Donations | `tests/integration/donations.test.ts` | 18 | 18 | 0 | 0 |
| D. Requests (+ concurrency) | `tests/integration/requests.test.ts` | 12 | 12 | 0 | 0 |
| E. Volunteer assignments, delivery, confirmation | `tests/integration/assignments.test.ts` | 9 | 9 | 0 | 0 |
| F. Admin | `tests/integration/admin.test.ts` | 7 | 7 | 0 | 0 |
| G. Notifications and impact | `tests/integration/notifications-impact.test.ts` | 7 | 7 | 0 | 0 |
| H. Uploads | `tests/integration/uploads.test.ts` | 11 | 11 | 0 | 0 |
| I. E2E full demo flow (desktop) | `tests/e2e/demo-flow.spec.ts` | 2 | 2 | 0 | 0 |
| I. E2E responsive (Pixel 7 viewport) | `tests/e2e/mobile.spec.ts` | 2 | 2 | 0 | 0 |
| **Total automated** | | **143** | **143** | **0** | **0** |

### What the key tests prove
- **Authentication:** valid/invalid/unknown login, case-insensitive email, duplicate and invalid-JSON
  registration, public ADMIN registration rejected, suspended accounts refused, lockout after 5 failures,
  pending/rejected restrictions, logout, revocation on suspension/rejection/role change/deletion.
- **Authorization:** each role blocked from other roles' endpoints, non-admins cannot approve accounts,
  every protected API returns 401 anonymously, cross-user access to donations/requests/assignments returns
  404, role/status tampering through profile updates is rejected.
- **Concurrency:** two simultaneous approvals of 7 + 7 on a 10-unit donation → exactly one succeeds and 3
  remain; five parallel approvals of one request → one success; four parallel duplicate requests → one row;
  two volunteers claiming one delivery at once → exactly one active assignment.
- **Delivery:** pickup before acceptance, delivery before pickup, delivery without proof, and delivered
  quantity above the approved amount are all rejected; proofs are recorded with the submitting user.
- **Impact:** aggregates change by exactly the delivered quantities (25 meals → +25 meals, +10 kg, +25 kg CO₂e)
  and only after NGO confirmation; disputed deliveries record no impact; the public endpoint has no PII.
- **Uploads:** valid PNG stored under a UUID and served with `nosniff` + sandbox CSP; text renamed to .png,
  SVG, EXE, wrong MIME, extension/content mismatch, oversized files, missing file, traversal paths, NGO and
  pending uploaders, and anonymous reads are all rejected.
- **E2E:** separate browser sessions for all four roles complete the whole demo through the UI: register,
  complete profiles, admin approval, donation with photo, discovery with distance, request, approval,
  admin assignment, accept, pickup, proof upload, delivery, NGO confirmation, admin monitoring, impact
  numbers, notifications, logout. Mobile tests check no horizontal overflow and the mobile menu.

## Defects found by the tests and fixed

| Found by | Defect | Fix |
|---|---|---|
| Integration (first run 102/106) | Donors could call the NGO discovery feed | Discovery restricted to NGO/ADMIN |
| Integration | A donor opening another donor's donation got the NGO view (200) | Returns 404 |
| Integration | Global CSP overrode the strict sandbox CSP on uploaded images | Global CSP excludes `/api/uploads/*` |
| Integration | Test helper sent a body with GET requests | Test fixed (assertion unchanged) |
| Smoke | Check expected a 307 where Next streams a meta-refresh redirect | Check now accepts either and verifies the target and that no protected content is sent |

No assertion was weakened and no test was skipped to obtain a green result.

## Dependency audit (remaining)

| Package | Severity | Scope | Actual exposure |
|---|---|---|---|
| `postcss` 8.4.31 (inside `next`) | high | prod | Only processes the project's own CSS at build time; not reachable from user input. The project's own postcss (8.5.32) is patched. Fix requires Next 16 (major). |
| `next` | moderate | prod | Flagged only because it bundles that postcss; no direct Next.js advisory on 15.5.28. |
| `zod` 3.25.76 | high | prod | Memory exhaustion when validating oversized *constrained collections*. The codebase has no array/set/record schemas (checked); notification marking deliberately avoids arrays. Fix requires Zod 4 (major). |
| `minimatch`, `@typescript-eslint/*` | high | dev only | ReDoS in lint tooling; never runs in the application. |

## Environment notes
- Playwright's own Chromium could not be downloaded because drive C: is full (`ENOSPC`). E2E tests ran on
  the installed Google Chrome via `PW_CHANNEL=chrome`, with temp profiles under the project's `.pw-tmp/`.
- At the end of the session drive C: reached 0 MB free (not caused by this project's files). Docker keeps
  PostgreSQL data on C:, so free space there is needed for the database to keep accepting writes.
