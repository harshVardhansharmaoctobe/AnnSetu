# FoodBridge – Implementation Plan

Plan followed for the hackathon MVP. Priorities, in order: correct functionality, security and data
integrity, the complete end-to-end workflow, UI quality, automated testing, demo reliability.

| # | Phase | Scope | Outcome |
|---|---|---|---|
| 0 | Audit | Git state, backup branch, configuration, dependencies, secrets | Done – plaintext demo passwords removed before the first commit |
| 1 | Foundation | Next 15.5.28, Prisma, Docker PostgreSQL, NextAuth hardening | Done (commit `e7216b1`) |
| 2 | Schema v2 | Lifecycle enums, unique request per NGO/donation, proof FK, timestamps, indexes | Done |
| 3 | Platform services | API conventions, `requireUser`, workflow service, notifications/audit, rate limits, security headers | Done |
| 4 | UI shell | Landing (about, how it works, live impact, help), login, register, role dashboards, 404/error/loading | Done |
| 5 | Donor | Profile, create/edit/cancel donations, photo, approve/reject requests, tracking with proof | Done |
| 6 | NGO | Profile, discovery (search, filters, distance, map), request, track, withdraw, confirm/dispute | Done |
| 7 | Volunteer | Profile, open deliveries, claim, accept/decline, pickup, proof upload, deliver, history | Done |
| 8 | Admin | Stats, users (search/filter/approve/reject/suspend/reinstate), deliveries + assignment, donations, audit log | Done |
| 9 | Notifications | Per-event notifications, unread badge, mark one/all read | Done |
| 10 | Location | Haversine distance, nearest sort, radius, Leaflet maps with list fallback | Done |
| 11 | Impact | Real aggregates, labelled estimates with stated factors, category chart | Done |
| 12 | Uploads | Magic-byte validation, size limits, UUID names, traversal-proof reads | Done |
| 15 | Tests | Unit (Vitest), integration (HTTP, isolated DB), E2E (Playwright, desktop + mobile) | Done – see TESTING_REPORT.md |
| 16 | Demo | Idempotent env-driven seed, demo guide | Done – see DEMO_GUIDE.md |
| 17–19 | Review, verification, commits | Security/performance review, full final verification, logical commits | Done |

## Key decisions

1. **Request-level lifecycle.** Partial claims by several NGOs make a single donation-level lifecycle
   ambiguous; the request carries the delivery state, the donation carries availability.
2. **Optimistic conditional updates instead of locks.** Simple, portable and race-safe; verified by
   parallel-approval and parallel-claim tests.
3. **Impact only on NGO confirmation.** Prevents counting deliveries that were disputed or never received.
4. **PENDING users may complete their profile.** Admins need organisation details to approve accounts.
5. **Both admin assignment and volunteer self-claim.** Admin assignment needs volunteer acceptance;
   self-claims are accepted immediately. Either way only one active assignment can exist.
6. **Delivery proof is mandatory.** A delivery photo uploaded through FoodBridge is required to mark a
   delivery complete; pickup photos are optional.
7. **Plain Leaflet, not react-leaflet.** The App Router runs React 19 (bundled by Next) and react-leaflet 4
   targets React 18.
8. **Isolated test database.** Tests never touch development data.
