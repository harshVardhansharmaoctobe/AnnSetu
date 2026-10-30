# FoodBridge – Architecture

**Business model.** FoodBridge is free: donors give surplus edible food, verified NGOs request it and never pay
for food or delivery, and volunteers carry it. The platform has no payments, payment gateways or fees. Logistics
sponsorship (donor, CSR or platform-funded) is outside the MVP; no sponsorship or funding data is simulated.

FoodBridge is a single Next.js 15 (App Router) application backed by PostgreSQL 16 (with PostGIS
available) through Prisma 5. There is no separate backend service: API routes under `src/app/api`
are the backend, and React pages under `src/app` are the frontend.

```
Browser ──► Next.js pages (React, client components)
              │  fetch JSON
              ▼
           API routes  src/app/api/**            ← every rule enforced here
              │  requireUser()  – session, role, account status (fresh from DB)
              │  zod schemas    – src/lib/validations.ts
              │  workflow.ts    – all state transitions, in transactions
              ▼
           Prisma ──► PostgreSQL (Docker: foodbridge-postgres, volume ps33_foodbridge-pgdata)
           uploads.ts ──► ./uploads (local disk, behind the UploadStorage interface)
```

## Source layout

| Path | Purpose |
|---|---|
| `src/lib/auth.ts` | NextAuth credentials provider, login lockout, JWT/session callbacks |
| `src/lib/api-auth.ts` | `requireUser({ roles, statuses })` guard used by every protected API |
| `src/lib/page-auth.ts` | `requirePageUser()` guard used by dashboard layouts (UX only; APIs re-check) |
| `src/lib/api.ts` | `route()` wrapper, `ApiError`, body/query parsing, pagination, safe error mapping |
| `src/lib/workflow.ts` | **The only code that changes donation/request/assignment state** |
| `src/lib/events.ts` | Notifications and audit log helpers (written in the same transaction) |
| `src/lib/stats.ts` | Impact and admin statistics from real records |
| `src/lib/uploads.ts` | Image validation (magic bytes) and storage abstraction |
| `src/lib/rate-limit.ts` | In-memory fixed-window limiter (login failures, registration, uploads) |
| `src/lib/validations.ts` | All zod schemas (strict: unknown/protected fields are rejected) |
| `src/components/*` | Shared UI: dashboard shell, forms, map, progress tracker, toasts, dialogs |
| `prisma/schema.prisma` / `prisma/seed.ts` | Data model / safe local demo seed |
| `tests/` | Integration (Vitest + HTTP) and E2E (Playwright) suites with an isolated test DB |

## Lifecycle

Several NGOs may each claim part of one donation, so the delivery lifecycle lives on **FoodRequest**;
**FoodDonation.status** describes how much food is still unclaimed.

```
FoodRequest:   PENDING ──approve──► ACCEPTED ──assign/claim──► VOLUNTEER_ASSIGNED ──pickup──► PICKED_UP
                  │                    │  ▲                          │  (decline / admin remove)
                reject              cancel└──────────────────────────┘
                  ▼                    ▼
               REJECTED            CANCELLED            PICKED_UP ──deliver (photo proof)──► DELIVERED
                                                         DELIVERED ──NGO confirms──► COMPLETED (impact recorded)
                                                         DELIVERED ──NGO disputes──► DISPUTED (report)
                                                         DISPUTED ──admin verifies──► COMPLETED (impact for verified qty)
                                                         DISPUTED ──admin closes──► DISPUTED + disputeResolvedAt (no impact)

FoodDonation:  AVAILABLE ⇄ PARTIALLY_RESERVED ⇄ FULLY_RESERVED ──all requests finished──► COMPLETED
               (open) ──deadline passes──► EXPIRED          any open state ──donor cancels──► CANCELLED

VolunteerAssignment: ASSIGNED ─accept─► ACCEPTED ─pickup─► PICKED_UP ─deliver─► DELIVERED
                     ASSIGNED/ACCEPTED ─decline─► DECLINED · ─admin remove / suspension─► CANCELLED
```

The user-facing "Requested → Approved → Volunteer assigned → Picked up → Delivered → Receipt confirmed"
tracker (`src/components/request-progress.tsx`) renders the request lifecycle.

## Concurrency and data integrity

Every transition is a **conditional update on the expected current state** inside a transaction:

- Approval: `UPDATE FoodDonation SET remainingQuantity -= n WHERE status IN (open) AND remainingQuantity >= n`
  then `UPDATE FoodRequest SET status='ACCEPTED' WHERE status='PENDING'`. If either matches 0 rows the
  transaction rolls back with 409, so two simultaneous approvals can never over-allocate food.
- Assignment: the request moves `ACCEPTED → VOLUNTEER_ASSIGNED` exactly once, so at most one active
  assignment exists per request (verified by a parallel-claim test).
- Duplicate requests: unique index `(donationId, ngoProfileId)`; a cancelled request is reactivated.
- Quantities are validated positive and bounded; reservations use `>=` guards so they never go negative.
- Expired donations are closed lazily before listings (`expireStaleDonations`).
- Notifications and audit entries are written in the same transaction as the change they describe.

## Security model

| Concern | Implementation |
|---|---|
| Authentication | NextAuth credentials, bcrypt (cost 12), JWT session (24 h), generic login errors |
| Stale permissions | `jwt` callback reloads role/status from the DB on every session read; suspended or deleted users lose their session immediately |
| Account policy | APPROVED: full access · PENDING: sign in, view status, complete profile · REJECTED: sign in, read-only · SUSPENDED: cannot sign in |
| Admins | Never created by public registration; provisioned in the DB (seed). Admins cannot modify themselves or other admins |
| Authorization | `requireUser` on every API (role + status); ownership checks in `workflow.ts` and detail routes; other users' resources return 404 |
| Mass assignment | zod `.strict()` everywhere: `id`, `userId`, `role`, `accountStatus`, `status`, `remainingQuantity` are rejected |
| Rate limiting | 5 failed logins per email / 15 min; 10 registrations per IP / hour; 60 uploads per user / hour (in-memory, single process) |
| Uploads | JPEG/PNG/WebP only, detected by magic bytes; extension, MIME and content must agree; 5 MB; UUID filenames; strict name pattern on read (no traversal); served with `nosniff` and a sandbox CSP; signed-in users only |
| Headers | CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed |
| Errors | `toErrorResponse` returns safe messages and codes; stack traces only in server logs; 503 when the DB is down |
| Secrets | `.env` is gitignored; seed passwords come from `.env`; nothing secret is logged or committed |
| XSS | React escaping; map popups built with `textContent`; only internal `/api/uploads/...` image URLs are accepted |
| CSRF | NextAuth CSRF token for sign-in; API routes require the `SameSite=Lax` session cookie and JSON bodies |

## Location and discovery

Coordinates are stored as latitude/longitude and only ever come from saved profiles/listings (map click,
device location after permission, or typed) – there is no live tracking and no fabricated position. Maps:
NGO discovery (donations + the NGO's own location), donor donation detail (pickup + requesting NGOs),
volunteer assignment and admin delivery detail (pickup + drop-off), admin platform map (approved donors,
NGOs, open donations, deliveries in progress; `GET /api/admin/map`). Invalid or 0,0 coordinates are skipped
and reported under the map. Markers carry a title (accessible name). Distances are computed with the Haversine formula
(`calculateDistance`); NGO discovery loads up to 500 matching open donations, computes distance from
the NGO's saved location, and supports sort by nearest/newest/expiry and a radius filter. The match score
(`src/lib/matching.ts`) weights distance 40 %, urgency 30 %, capacity 20 %, category 10 %. Maps use plain
Leaflet with OpenStreetMap tiles; if tiles cannot load, lists and distances still work. PostGIS is enabled
but not required at this scale.

## Impact: verified records, estimates and demo data

The impact dashboard keeps three kinds of figures apart (`src/lib/stats.ts`):

- **Verified records** – deliveries count (and their quantities, recovery rate and volunteer contributions) only
  when the receiving NGO confirmed receipt, or an admin verified a reported problem. Deliveries awaiting
  confirmation and open reports are shown separately and are not counted.
- **Estimates** – derived from verified deliveries only (below).
- **Demo data** – `User.isDemo` is set by the seed; the dashboard states how many donations, verified
  deliveries and meals come from demo accounts (included in, not added to, the totals).

`ImpactRecord` rows are written only when the receiving NGO confirms receipt or an admin verifies a dispute. Factors (`IMPACT_ESTIMATES`):
1 kg food ≈ 2.5 meals, ≈ 2.5 kg CO₂e, ≈ 1000 L water. All estimate figures are labelled "est." in the UI
and the factors are shown next to them. Counts (donations, deliveries, quantities) come straight from records.

## Testing architecture

Integration and E2E tests run `next start` against `foodbridge_test` in the same PostgreSQL server. All
destructive setup (schema push, truncate) refuses any database whose name does not end in `_test`, and a
test asserts that the server under test is not using the development database.
