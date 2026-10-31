// Runs the Prisma CLI with DIRECT_URL defaulting to DATABASE_URL (local Docker needs no separate
// direct URL). Explicit environment variables win over .env, and .env is only read, never written.
//
// Safety: a variable that is set in the shell but empty would otherwise be filled from .env (pointing
// a "remote" command at the local database), and a malformed value fails later with Prisma P1013.
// Both are rejected here before Prisma runs, and the target host is printed (never credentials).
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { describe } from './lib/db-url.mjs';

const require = createRequire(import.meta.url);
const fromShell = { DATABASE_URL: process.env.DATABASE_URL, DIRECT_URL: process.env.DIRECT_URL };
for (const [name, value] of Object.entries(fromShell)) {
  if (value !== undefined && value.trim() === '') {
    console.error(`✖ ${name} is set in this shell but empty – refusing to fall back to .env. Set it or remove it (Remove-Item Env:${name}).`);
    process.exit(1);
  }
}
require('@next/env').loadEnvConfig(process.cwd());
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;

for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const d = describe(name, process.env[name]);
  if (d.error) {
    console.error(`✖ ${d.error}`);
    process.exit(1);
  }
  const source = fromShell[name] !== undefined ? 'shell' : name === 'DIRECT_URL' && fromShell.DATABASE_URL !== undefined ? 'shell (DATABASE_URL)' : '.env';
  console.error(`• ${name}: ${d.host}:${d.port}/${d.database} (from ${source})`);
}

const cli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
