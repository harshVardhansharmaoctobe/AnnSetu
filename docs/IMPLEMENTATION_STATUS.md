# FoodBridge – Implementation Status

Each item is marked only after it was verified (tsc, lint, build and the test suites in TESTING_REPORT.md).

Legend: ✅ verified · ⚠️ done with a documented limitation · ⏳ deferred

## Checkpoints (git, branch `foodbridge-main`)
| Commit | Content |
|---|---|
| `fd4f357` | `trustchain-backup` – original TrustChain project (never modified) |
| `e7216b1` | Foundation: Next 15, Prisma/PostgreSQL, hardened auth |
| (next commits) | Core workflow + APIs + security · UI · tests, seed and docs – see `git log` |

## Definition of done
| Item | Status |
|---|---|
| Public landing page (problem, solution, how it works, live impact, help) | ✅ |
| Registration (validated, normalised email, bcrypt, PENDING, no public ADMIN) | ✅ |
| Login / logout / sessions with DB-refreshed permissions | ✅ |
| Role-based dashboards (donor, NGO, volunteer, admin) with server-side guards | ✅ |
| Admin approval workflow (approve, reject, suspend, reinstate, audit log) | ✅ |
| Donor creates, edits (before requests) and cancels donations with photo | ✅ |
| NGO browses (search, filters, distance, map) and requests food | ✅ |
| Donor approves/rejects requests; atomic quantity reservation | ✅ |
| Volunteer assignment (admin assign + accept/decline, or self-claim) | ✅ |
| Pickup workflow | ✅ |
| Delivery proof upload (required) and delivery completion | ✅ |
| NGO receipt confirmation or dispute | ✅ |
| Notifications (per event, unread badge, mark one/all read) | ✅ |
| Impact dashboard from real records, estimates labelled with formulas | ✅ |
| Location/discovery (Haversine distance, nearest sort, radius, Leaflet map, list fallback) | ✅ |
| All critical APIs protected (401/403/404 verified for every role) | ✅ |
| Database constraints and transactions (race tests pass) | ✅ |
| No critical/high application security issue left unexplained | ✅ (dependency findings explained in TESTING_REPORT.md) |
| Automated tests pass (143/143) | ✅ |
| Production build passes | ✅ |
| Docker database healthy | ✅ |
| Demo seed works safely (idempotent, env passwords, refuses production) | ✅ |
| End-to-end demo executed successfully (Playwright, four sessions) | ✅ |
| Documentation complete | ✅ |
| Backups and user data preserved (trustchain-backup, MongoDB data, volume, .env) | ✅ |

## Known limitations
- ⚠️ Rate limits are in memory: they reset on restart and are per process (fine for one `next start`).
- ⚠️ Uploads are stored on local disk (`./uploads`); swap `diskStorage` for object storage before deploying.
- ⚠️ No real email/SMS notifications (optional in the brief); notifications are in-app.
- ⚠️ No geocoding: locations are set by map click, device location or typed coordinates.
- ⚠️ Discovery evaluates at most 500 matching open donations per query before distance sorting.
- ⚠️ CSP allows inline scripts (Next.js bootstrap without nonces).
- ⚠️ Dependency advisories that need major upgrades remain (postcss inside Next → Next 16, zod → 4);
  neither is reachable in this codebase today (see TESTING_REPORT.md).
- ⚠️ App Router runs Next's bundled React 19 while `@types/react` is 18; no incompatibility found.

## Deferred (not required for the MVP)
- ⏳ Password reset / email verification.
- ⏳ Admin-side editing of donations and manual dispute resolution actions (disputes are visible and notified).
- ⏳ Profile avatars (the `avatarUrl` column exists but is unused).

## Decisions log
- **Donation vs request status.** Several NGOs can claim parts of one donation, so the delivery lifecycle is
  tracked per `FoodRequest`; `FoodDonation.status` tracks remaining availability. See ARCHITECTURE.md.
- **Concurrency.** Conditional `updateMany` on the expected status (and `remainingQuantity >= n`) inside
  transactions; zero rows means conflict (409).
- **DeliveryStatus.** Represented by `AssignmentStatus` + `RequestStatus`; no separate enum.
- **Impact** is recorded only when the receiving NGO confirms receipt.
- **Schema push.** `db push --accept-data-loss` was used once on the dev DB after verifying every application
  table had 0 rows (only enum values, indexes and two empty columns were replaced). The test DB
  (`foodbridge_test`) is recreated freely by the test harness behind a `_test` name guard.
- **Removed scripts.** `db:reset` (wiped the database) and `db:migrate` (no migrations in this project).
- **Removed dependency.** `react-leaflet` (React 18-only); maps use Leaflet directly.
