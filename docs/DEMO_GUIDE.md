# FoodBridge – Demo Guide

A 10-minute live demo of the complete food rescue lifecycle with four separate user sessions.

FoodBridge is free: donors give food, NGOs never pay for food or delivery, volunteers carry it, and the app
processes no payments. Everything created by the seeded accounts below is **demo data** and the impact
dashboard labels it as such.

## 1. One-time setup

Prerequisites: Node.js 22, Docker Desktop running.

```bash
cd ps3.3
npm install
cp .env.example .env          # only if you do not have a .env yet – then fill in real values
docker compose up -d          # PostgreSQL 16 + PostGIS on 127.0.0.1:5432
npx prisma db push            # create/sync tables (non-destructive on an in-sync database)
npm run db:seed               # demo accounts + 3 demo donations (idempotent, safe to re-run)
npm run build
npm start                     # http://localhost:3000
npm run health                # → { status: 'ok', database: 'up' }
```

`.env` must contain `DATABASE_URL`, `POSTGRES_PASSWORD`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`,
`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_DEMO_PASSWORD`. Generate secrets with
`openssl rand -base64 32`. The seed refuses to run in production or without the two seed passwords.

## 2. Demo accounts

| Role | Email | Password |
|---|---|---|
| Admin | value of `SEED_ADMIN_EMAIL` (default `admin@foodbridge.local`) | `SEED_ADMIN_PASSWORD` in your `.env` |
| Donor | `donor@foodbridge.local` – Rajasthani Rasoi (Demo), Mansarovar | `SEED_DEMO_PASSWORD` |
| NGO | `ngo@foodbridge.local` – Annapurna Foundation (Demo), Malviya Nagar | `SEED_DEMO_PASSWORD` |
| Volunteer | `volunteer@foodbridge.local` – C-Scheme, bike | `SEED_DEMO_PASSWORD` |

Passwords are never stored in this repository – read them from your local `.env`. Donor, NGO and
volunteer start as **PENDING** so the approval step can be shown (`SEED_DEMO_APPROVED=true` skips it).
Re-running the seed never changes existing accounts; it only refreshes the deadlines of `[Demo]`
donations no NGO has requested yet.

**Tip:** use four browser profiles (or one normal + three private windows) so each role keeps its own session.

## 3. Click-by-click demo

1. **Landing page** – open `http://localhost:3000`: problem, solution, how it works, live impact (real numbers).
2. **Admin approves accounts** – sign in as admin → *Admin dashboard* → *Accounts awaiting approval* →
   **Approve** the donor, NGO and volunteer. (Show *Users* for search/filter and *Audit log* for the entries.)
3. **Donor lists food** – sign in as the donor → *New donation* → title "Paneer biryani", quantity 40 meals,
   storage "Hot-held", add a photo, tick the food-safety declaration → **Publish donation**.
   The pickup location defaults to the donor's profile.
4. **NGO discovers it on the map** – sign in as the NGO → *Find food* → **Map**: green markers are available
   donations, the blue marker is the NGO's own address. Click the biryani marker → click its name in the popup.
   (The list view shows the same donations with real distances, match score and time left.)
5. **NGO requests** – quantity 30, beneficiaries 60 → **Send request**. The request page shows *Pending*.
6. **Donor approves** – donor dashboard → *Requests awaiting your decision* → **Approve**
   (10 meals stay available for other NGOs). The NGO gets a notification.
7. **Admin assigns a volunteer** – admin → *Deliveries* (*Needs volunteer*) → **Assign** → choose
   Priya Singh (sorted by distance to pickup) → **Assign**.
   *(Alternative: the volunteer can claim it from the **Available** tab, which needs no acceptance step.)*
8. **Volunteer accepts** – sign in as the volunteer → *Deliveries* → open the assignment → **Accept**.
   Pickup and drop-off addresses, contacts and a map are shown.
9. **Pickup** – **I have picked up the food** (pickup photo optional). Donor and NGO are notified.
10. **Delivery proof** – upload a delivery photo (required – the button stays disabled without it),
    quantity 30 → **Mark as delivered**.
11. **NGO confirms receipt** – NGO → request page (or dashboard *Delivered – please confirm receipt*) →
    **Confirm receipt** → impact recorded (≈ 30 meals). *Report problem* shows the dispute path instead.
12. **Admin views the completed delivery** – *Deliveries* → *Completed* → open it: full timeline, contacts,
    pickup and delivery proof photos.
13. **Impact dashboard** – *Impact*: *Verified platform records* update from the confirmed delivery (food
    delivered, verified deliveries, completed donations, volunteer deliveries, recovery rate); *Estimated impact*
    shows meals, kg, CO₂e and water with their assumptions; *Demo data* states how much comes from the demo
    accounts. Deliveries not yet confirmed are listed separately and not counted. The landing page updates too.
14. **Reports (optional)** – as the NGO choose *Report problem* instead of confirming; as the admin open
    *Reports* → **Resolve** → *Delivery verified* (impact recorded for the verified quantity) or *Could not be
    verified* (no impact). Everyone involved is notified and the decision appears in the audit log.

Optional extras: concurrent safety (two NGOs request more than is available; only what remains can be
approved), notifications bell and *Mark all as read*, suspending a user (they are signed out immediately),
mobile layout (resize the window or use a phone).

## 4. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run health` reports the database down | `docker compose ps` – start Docker Desktop, then `docker compose up -d` |
| Login says "Too many failed sign-in attempts" | Wait 15 minutes, or restart the server (limits are in memory) |
| No donations in *Find food* | Demo donations expire; run `npm run db:seed` again, or create a new one as the donor |
| Map tiles are grey | No internet access; markers, lists, distances and all actions still work |
| "Location permission denied" | Click the map or type coordinates instead – nothing else needs location access |
| Docker/PostgreSQL write errors | Free disk space on the drive holding Docker's data (C: on this machine) |

Never run `docker compose down -v` – it deletes the database volume.
