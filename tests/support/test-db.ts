/**
 * Isolated test database helpers.
 *
 * Tests never touch the development database: they use `<dev db name>_test` in the same
 * PostgreSQL server. Every destructive helper refuses to run unless the database name ends in
 * "_test", so a misconfiguration cannot wipe real data.
 */
import { execSync } from 'child_process';
import { loadEnvConfig } from '@next/env';
import { PrismaClient } from '@prisma/client';

loadEnvConfig(process.cwd());

export function testDatabaseUrl(): string {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const dev = process.env.DATABASE_URL;
  if (!dev) throw new Error('DATABASE_URL is not set (.env) – cannot derive the test database URL');
  const url = new URL(dev);
  url.pathname = `${url.pathname.replace(/^\//, '')}_test`.replace(/^/, '/');
  return url.toString();
}

function databaseName(url: string) {
  return new URL(url).pathname.replace(/^\//, '');
}

export function assertTestDatabase(url: string) {
  const name = databaseName(url);
  if (!/^[a-z0-9_]+_test$/.test(name)) {
    throw new Error(`Refusing to run destructive test setup against database "${name}" (name must end in _test)`);
  }
  return name;
}

/** Creates the test database if needed, syncs the schema, and empties every table. */
export async function prepareTestDatabase() {
  const url = testDatabaseUrl();
  const name = assertTestDatabase(url);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const maintenance = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const exists = await maintenance.$queryRawUnsafe<{ count: bigint }[]>(
      'SELECT count(*)::bigint AS count FROM pg_database WHERE datname = $1',
      name
    );
    if (Number(exists[0].count) === 0) await maintenance.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
  } finally {
    await maintenance.$disconnect();
  }

  // Schema sync on the throwaway test database only (guarded above).
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const tables = await prisma.$queryRawUnsafe<{ tablename: string }[]>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'spatial_ref_sys'`
    );
    if (tables.length > 0) {
      await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} CASCADE`);
    }
  } finally {
    await prisma.$disconnect();
  }
  return url;
}

let client: PrismaClient | null = null;
/** Prisma client bound to the test database (for fixtures and assertions). */
export function testPrisma() {
  if (!client) {
    const url = testDatabaseUrl();
    assertTestDatabase(url);
    client = new PrismaClient({ datasourceUrl: url });
  }
  return client;
}
