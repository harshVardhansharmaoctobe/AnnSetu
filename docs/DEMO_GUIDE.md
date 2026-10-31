# FoodBridge – Demo Guide

**From Surplus to Served.** A 10–12 minute live demo of the full food-rescue lifecycle with four separate
user sessions, on real database records. Every step below is executed by the automated E2E test
(`tests/e2e/demo-flow.spec.ts`), which also checks the final database rows.

FoodBridge is free: donors give food, NGOs never pay for food or delivery, volunteers carry it, and the app
processes no payments. Everything created by the seeded accounts is **demo data** and is labelled as such
(landing page "Demo listing", impact dashboard "Demo data" section).

## 1. Start the demo

Prerequisites: Node.js 22 and Docker Desktop running.

```bash
cd ps3.3
docker compose up -d       # PostgreSQL 16 + PostGIS on 127.0.0.1:5432 (data volume is kept)
npm run db:seed            # demo accounts + 3 Jaipur demo donations; refreshes their pickup deadlines
npm run build
npm start                  # http://localhost:3000
npm run health             # → { status: 'ok', database: 'up' }
```

First-time setup only: `npm install`, copy `.env.example` to `.env` and fill in real values, then
`npx prisma db push`. Never run `docker compose down -v` – it deletes the database volume.

## 2. Demo accounts

**Passwords are in `DEMO_CREDENTIALS.local.md` in the project folder** (`ps3.3/DEMO_CREDENTIALS.local.md`).
`npm run db:seed` writes it from your local `.env`; it is gitignored and never committed. Open it before the demo.

| Role | Email | Starts as |
|---|---|---|
| Admin | `admin@foodbridge.local` (or `SEED_ADMIN_EMAIL`) | Approved |
| Donor | `donor@foodbridge.local` – Rajasthani Rasoi (Demo), Mansarovar | Pending |
| NGO | `ngo@foodbridge.local` – Annapurna Foundation (Demo), Malviya Nagar | Pending |
| Volunteer | `volunteer@foodbridge.local` – C-Scheme, bike | Pending |

Donor, NGO and volunteer start **PENDING** so the approval step can be shown. Until the donor is approved, the
landing page shows no listings (only approved donors' food is public) and the demo users see the
"awaiting approval" page. Re-running the seed never changes existing accounts.

**Tip:** use four browser profiles (or one normal window plus three private windows) – one per role.

## 3. Click-by-click demo (the 50 → 20 → 30 scenario)

1. **Landing page** – `http://localhost:3000`: tagline *From Surplus to Served*, how it works, live impact.
2. **Admin approves accounts** – sign in as admin → *Command center* → *Accounts awaiting approval* → **Approve**
   the donor, NGO and volunteer. Show *Users* (click a name for the user detail page) and the per-role totals.
   *Locations:* users never type coordinates. In *Profile* (or registration) they search for the address
   (e.g. "Mansarovar, Jaipur") → **Find** → pick the match, or press **My location** / click the map and the
   readable address is filled in. Addresses, not coordinates, are shown everywhere; cards and the public landing
   page show only the area (e.g. "Mansarovar, Jaipur"). Address search needs internet access (OpenStreetMap).
3. **Donor lists 50 portions** – sign in as the donor → *Add food donation* → title, **Quantity 50**, unit Meals,
   storage, handling instructions, add a photo, tick the food-safety declaration → **Publish donation**.
   The pickup location comes from the donor profile. The landing page now shows it under *Food available right now*.
4. **NGO discovers it on the map** – sign in as the NGO → *Map* (or *Discover food* → **Map**): green markers are
   donations, the blue marker is the NGO. Click the donation marker → click its name in the popup.
5. **NGO requests 20** – Quantity **20**, people it will feed (e.g. 40) → **Send request** → status *Pending*.
6. **Donor approves** – donor *Overview* → *Requests awaiting your decision* → **Approve**.
   *My donations* now shows **30 of 50 meals unreserved**; the landing page shows **30 meals available**.
   Approval also opens a delivery for volunteers (nearby volunteers get a notification).
7. **Admin assigns a volunteer** – admin → *Requests & deliveries* (*Awaiting volunteer*) → **Assign** → choose
   the volunteer (sorted by distance) → **Assign**.
   *(Alternative: the volunteer accepts it from *Available assignments* – the first volunteer to accept wins.)*
8. **Volunteer accepts** – sign in as the volunteer: the bell shows *New delivery assigned to you* and the
   dashboard opens on *My assignments*. Open it → **Accept**. Pickup (green) and drop-off (blue) appear on the map
   with a dashed line and an *OpenStreetMap directions* link; phone numbers appear once accepted.
9. **Pickup with proof** – **I have arrived at pickup** (donor notified) → add the pickup photo →
   **I have collected the food**.
10. **Delivery with proof** – **Mark in transit** (NGO notified) → add the delivery photo (required – the button stays
    disabled without it) → quantity **20** → **Mark as delivered**.
11. **NGO confirms receipt** – NGO → *Active deliveries* (or the request page) → **Confirm receipt** → optional
    1–5 rating and feedback → confirm → *Impact recorded: ≈ 20 meals*.
    *(Report problem shows the dispute path; the admin resolves it under *Reported issues*.)*
12. **Admin verifies** – admin → *Requests & deliveries* → **Completed** → open the delivery: full timeline,
    pickup proof and delivery proof photos. *Donations* → click the donation: **Listed 50 · Reserved 0 ·
    Delivered (verified) 20 · Still available 30**. On the *Command center* map, toggle the layers.
13. **Impact dashboard** – *Impact*: *Verified platform records* show total food listed (50 meals), food delivered
    (verified) **20 meals**, available now 30; *Estimated impact* shows meals/kg/CO₂e with their assumptions;
    *Demo data* states how much comes from demo accounts. Only NGO-confirmed deliveries count.

Optional extras: password reset (*Forgot password?* on the login page; the admin can issue a one-time link from the
user detail page), *Settings → Change password* (signs out every session), notifications and *Mark all as read*,
suspending a user (signed out immediately), mobile layout.

## 4. Troubleshooting

| Symptom | Fix |
|---|---|
| `npm run health` reports the database down | Start Docker Desktop, then `docker compose up -d` |
| Landing page shows no listings | The demo donor is still pending – approve it (step 2) |
| *Discover food* is empty | Demo donations expire after their deadline; run `npm run db:seed` again |
| "Too many failed sign-in attempts" | Wait 15 minutes, or restart the server (limits are in memory) |
| Map tiles are grey | No internet access; markers, lists, distances and all actions still work |
| Address and pin look different | Search again and pick the result, or drag the pin: the address always follows the pin. Debug: `localStorage.fbLocationDebug = '1'` in the browser console |
| "Address lookup is unavailable" | No internet access to OpenStreetMap: type the address and click the map to place the pin |
| Forgot-password link not received | No email service in this MVP: the admin issues a link from the user detail page |
