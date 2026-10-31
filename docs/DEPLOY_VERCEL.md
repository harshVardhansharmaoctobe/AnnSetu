# Deploying FoodBridge to Vercel with Neon PostgreSQL

FoodBridge runs on Vercel as a standard Next.js 15 project (Node.js runtime for every route).
The database is Neon PostgreSQL. Nothing here deploys automatically.

## 1. Neon database

1. Create a Neon project in a region close to your Vercel functions (e.g. AWS ap-southeast-1 Singapore
   with Vercel region `sin1`, or the region nearest your users).
2. In **Connection details**, copy two connection strings for the same database:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`. Append `&pgbouncer=true&connect_timeout=15`
     (the string already has `?sslmode=require`).
   - **Direct** (no `-pooler`) → `DIRECT_URL`. Used only for schema changes.
3. The schema enables the PostGIS extension; Neon supports it and `prisma db push` creates it.

## 2. Create the schema (from your machine, once – and after schema changes)

The schema is applied with `prisma db push`, which creates missing tables and columns and **refuses any
change that would delete data** (never add `--accept-data-loss` for a real database). It is deliberately
**not** part of the Vercel build, so preview deployments can never change the production database.

```powershell
cd "E:\OneDrive\Desktop\sphinx project\ps3.3"
$env:DATABASE_URL = "<Neon DIRECT connection string>"
$env:DIRECT_URL   = "<Neon DIRECT connection string>"
npm run db:push -- --skip-generate
Remove-Item Env:DATABASE_URL, Env:DIRECT_URL
```

Shell variables take precedence over `.env`; `.env` is only read, never written.

## 3. Admin and demo accounts (optional, from your machine)

The only way to create the admin is the seed. Use **new passwords**, not your local ones, and skip the
credentials file so your local `DEMO_CREDENTIALS.local.md` is not overwritten:

```powershell
$env:DATABASE_URL = "<Neon DIRECT connection string>"
$env:SEED_ADMIN_EMAIL = "admin@foodbridge.local"
$env:SEED_ADMIN_PASSWORD = "<new strong password>"
$env:SEED_DEMO_PASSWORD = "<another new strong password>"
$env:SEED_DEMO_APPROVED = "true"          # omit to demonstrate the approval step
$env:SEED_CREDENTIALS_FILE = "none"
npm run db:seed
Remove-Item Env:DATABASE_URL, Env:SEED_ADMIN_EMAIL, Env:SEED_ADMIN_PASSWORD, Env:SEED_DEMO_PASSWORD, Env:SEED_DEMO_APPROVED, Env:SEED_CREDENTIALS_FILE
```

The seed refuses `NODE_ENV=production`, never changes existing accounts, and is safe to re-run (it refreshes
the deadlines of the demo donations, which expire after a few hours).

## 4. Vercel project

Import the GitHub repository. Settings:

| Setting | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | the folder containing `package.json` (repository root) |
| Install command | default (`npm install`; its `postinstall` runs `prisma generate`) |
| Build command | default (`npm run build` = `prisma generate && next build`) |
| Node.js version | 22.x (also pinned in `package.json` `engines`) |

### Environment variables

| Variable | Environments | Value |
|---|---|---|
| `DATABASE_URL` | Production (+ Preview if wanted) | Neon **pooled** URL with `&pgbouncer=true&connect_timeout=15` |
| `DIRECT_URL` | same | Neon **direct** URL |
| `NEXTAUTH_SECRET` | all | new random value, e.g. `openssl rand -base64 32` – never reuse the local one |
| `NEXTAUTH_URL` | Production only | `https://<your-project>.vercel.app` (or your custom domain), no trailing slash |
| `SUPPORT_EMAIL` | all (recommended) | real contact – identifies the app to OpenStreetMap's geocoder |
| `MAX_FILE_SIZE_MB` | optional | `4` (default on Vercel; request bodies over 4.5 MB are rejected by Vercel) |
| `GEOCODER_COUNTRY` | optional | `in` |

Leave **unset** on Vercel: `NODE_ENV`, `UPLOAD_DIR`, `UPLOAD_STORAGE` (defaults to `database` on Vercel),
`TRUSTED_PROXY_HOPS` (default 1 is correct), `LOCATION_DEBUG`, `LOG_RESET_LINKS`, every `SEED_*`,
`POSTGRES_PASSWORD`. For Preview deployments `NEXTAUTH_URL` can stay unset: NextAuth uses the deployment URL.

Use a separate Neon branch for Preview deployments if you do not want previews to use production data.

## 5. After deploying

- `https://<your-project>.vercel.app/api/health` → `{"status":"ok","database":"up"}`
- Sign in as the admin, approve accounts, run the demo flow.

## Platform notes

- **Uploads** are stored in PostgreSQL on Vercel (table `StoredFile`) and served only to signed-in users
  through `/api/uploads/…`. Fine for a demo; for heavy use move to object storage (Vercel Blob or S3)
  by adding an `UploadStorage` implementation in `src/lib/uploads.ts`.
- **Rate limits and the geocoder cache are in memory per function instance**, so on Vercel they are
  weaker than on a single server. Use a shared store (e.g. Upstash Redis) if abuse becomes a concern.
- **Address search** uses OpenStreetMap Nominatim from Vercel's shared IPs; if it throttles, users can
  still type the address and place the pin on the map.
- **Password-reset emails** are not sent; admins issue one-time links from the user detail page.
