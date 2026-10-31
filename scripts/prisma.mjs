// Runs the Prisma CLI with DIRECT_URL defaulting to DATABASE_URL (local Docker needs no separate
// direct URL). Explicit environment variables win over .env, and .env is only read, never written.
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import path from 'path';

const require = createRequire(import.meta.url);
require('@next/env').loadEnvConfig(process.cwd());
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) process.env.DIRECT_URL = process.env.DATABASE_URL;

const cli = path.join(path.dirname(require.resolve('prisma/package.json')), 'build', 'index.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
