// Neon database helper. Reads ONLY .env.neon.local (written by scripts/neon-env.ps1) – never .env – so it
// can never fall back to the local database. Never prints connection strings, users or passwords.
//
//   node scripts/neon.mjs validate [--from-env]   check the two URLs (structure only, no connection)
//   node scripts/neon.mjs check                   connect (pooled + direct), PostGIS, existing tables
//   node scripts/neon.mjs diff                    SQL that db push would run, with destructive statements flagged
//   node scripts/neon.mjs push                    db push – only when the diff has no destructive statement
import { spawnSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { checkNeonPair, redact } from './lib/db-url.mjs';

const require = createRequire(import.meta.url);
const ROOT = process.cwd();
const FILE = '.env.neon.local';
const [command = 'validate', ...flags] = process.argv.slice(2);

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

function loadUrls() {
  if (flags.includes('--from-env')) return { pooled: process.env.DATABASE_URL, direct: process.env.DIRECT_URL };
  if (!existsSync(path.join(ROOT, FILE))) fail(`${FILE} not found – run: powershell -ExecutionPolicy Bypass -File scripts\\neon-env.ps1`);
  const values = {};
  for (const line of readFileSync(path.join(ROOT, FILE), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(DATABASE_URL|DIRECT_URL)\s*=\s*"?(.*?)"?\s*$/);
    if (m) values[m[1]] = m[2];
  }
  return { pooled: values.DATABASE_URL, direct: values.DIRECT_URL };
}

const { pooled, direct } = loadUrls();
const secrets = [pooled, direct].flatMap((u) => {
  try {
    const p = new URL(u).password;
    return [u, p, decodeURIComponent(p)];
  } catch {
    return [u];
  }
});
const safe = (text) => redact(text, secrets);

const result = checkNeonPair(pooled, direct, 'neondb');
for (const w of result.warnings) console.log(`! ${w}`);
if (result.errors.length) {
  for (const e of result.errors) console.error(`✖ ${e}`);
  process.exit(1);
}
const i = result.info;
console.log(`✔ URLs valid. Pooled host: ${i.pooledHost} | direct host: ${i.directHost} | database: ${i.database}`);
console.log(`  pooled params: ${i.pooledParams.join(', ') || '(none)'} | direct params: ${i.directParams.join(', ') || '(none)'}`);
if (command === 'validate') process.exit(0);

// Prisma runs with the pooled URL for queries and the direct URL for schema work, as on Vercel.
const prismaEnv = { ...process.env, DATABASE_URL: pooled, DIRECT_URL: direct };
const prismaCli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
function prisma(args, env = prismaEnv) {
  const r = spawnSync(process.execPath, [prismaCli, ...args], { env, encoding: 'utf8', timeout: 180_000 });
  return { status: r.status, out: safe(`${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

async function query(url, sql) {
  process.env.DIRECT_URL = direct;
  const { PrismaClient } = require('@prisma/client');
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    return await client.$queryRawUnsafe(sql);
  } finally {
    await client.$disconnect();
  }
}

const DESTRUCTIVE = /\b(DROP|TRUNCATE|DELETE)\b|\bRENAME\b|ALTER COLUMN\s+"?\w+"?\s+(SET DATA\s+)?TYPE|ALTER COLUMN\s+"?\w+"?\s+SET NOT NULL/i;
function diff() {
  // Diff via the direct connection (introspection should not go through the pooler).
  const r = prisma(['migrate', 'diff', '--from-schema-datasource', 'prisma/schema.prisma', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'],
    { ...process.env, DATABASE_URL: direct, DIRECT_URL: direct });
  if (r.status !== 0) fail(`schema diff failed:\n${r.out}`);
  const statements = r.out.split(/;\s*\n/).map((s) => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  return { statements, destructive: statements.filter((s) => DESTRUCTIVE.test(s)) };
}

async function check() {
  for (const [label, url] of [['pooled', pooled], ['direct', direct]]) {
    try {
      const [row] = await query(url, "SELECT current_database() AS db, split_part(version(), ' ', 2) AS pg");
      console.log(`✔ ${label} connection works – database ${row.db}, PostgreSQL ${row.pg}`);
    } catch (e) {
      fail(`${label} connection failed: ${safe(e.message).split('\n').filter(Boolean).slice(-2).join(' ')}`);
    }
  }
  const ext = await query(direct, "SELECT extversion FROM pg_extension WHERE extname = 'postgis'");
  if (ext.length === 0) console.log('! PostGIS extension is not enabled in this database');
  else {
    const [g] = await query(direct, `SELECT postgis_lib_version() AS lib,
      ST_AsText(ST_SetSRID(ST_MakePoint(75.8267, 26.9239), 4326)) AS point,
      round(ST_Distance(ST_MakePoint(75.8267, 26.9239)::geography, ST_MakePoint(75.7878, 26.9196)::geography)) AS metres`);
    console.log(`✔ PostGIS ${ext[0].extversion} (lib ${g.lib}) works: point ${g.point}; Hawa Mahal → Jaipur Junction ≈ ${g.metres} m`);
  }
  await tables();
}

async function tables() {
  const rows = await query(direct, `SELECT c.relname AS name, c.reltuples::bigint AS estimate,
      (SELECT count(*) FROM pg_index x WHERE x.indrelid = c.oid)::int AS indexes
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'spatial_ref_sys' ORDER BY c.relname`);
  if (rows.length === 0) return console.log('• public schema has no application tables yet');
  console.log(`• ${rows.length} table(s) in public schema:`);
  for (const r of rows) {
    const [{ n }] = await query(direct, `SELECT count(*)::int AS n FROM "${r.name.replace(/"/g, '')}"`);
    console.log(`    ${r.name.padEnd(22)} rows: ${String(n).padStart(5)}  indexes: ${r.indexes}`);
  }
}

if (command === 'check') await check();
else if (command === 'tables') await tables();
else if (command === 'diff' || command === 'push') {
  const d = diff();
  if (d.statements.length === 0) console.log('✔ Neon schema already matches prisma/schema.prisma – nothing to change.');
  else {
    console.log(`• ${d.statements.length} statement(s) needed:`);
    for (const s of d.statements) console.log(`    ${DESTRUCTIVE.test(s) ? '✖ DESTRUCTIVE ' : ''}${s.split('\n')[0].slice(0, 110)}`);
  }
  if (d.destructive.length) fail(`${d.destructive.length} destructive statement(s) – NOT applying. Review them and decide explicitly.`);
  if (command === 'push' && d.statements.length > 0) {
    console.log('• Running: prisma db push --skip-generate (no --accept-data-loss) …');
    const r = prisma(['db', 'push', '--skip-generate']);
    console.log(r.out.split('\n').filter((l) => /sync|Datasource|error|warn|P\d{4}/i.test(l)).join('\n'));
    if (r.status !== 0) fail('db push failed');
    const after = diff();
    if (after.statements.length) fail(`schema still differs after push (${after.statements.length} statement(s))`);
    console.log('✔ Neon schema now matches prisma/schema.prisma');
    await tables();
  }
} else fail(`unknown command "${command}"`);
